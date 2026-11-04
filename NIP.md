# NIP.md — MojiSurvivor Nostr Protocol Specification

This document defines the Nostr event kinds, tag schemas, cryptographic verification rules, and signer adapters used by **MojiSurvivor**, following the [Soapbox MKStack / Shakespeare](https://github.com/soapbox-pub/shakespeare) protocol guidelines (`@nostrify/nostrify` + `nostr-tools`).

---

## 1. Consumed Standard NIPs

- **NIP-01**: Basic protocol flow, BIP-340 Schnorr event verification (`verifyEvent`), and `kind: 0` user profile metadata (`name`, `display_name`, `picture`, `nip05`).
- **NIP-07**: Browser extension signing via `window.nostr` (`NBrowserSigner`).
- **NIP-09**: Event Deletion Request (`kind: 5` referencing `e`, `a`, and `k: 30078`) so players can revoke test runs from relays and leaderboards.
- **NIP-19**: Bech32 encoding/decoding (`npub`, `nsec`, `nevent`, `naddr`).
- **NIP-30**: Custom Emoji discovery via `kind: 30030` (Emoji Sets) and `kind: 10030` (User Emoji Lists), including resolution of `["a", "30030:<pubkey>:<d-tag>"]` set references. Every `["emoji", "<shortcode>", "<https-url>"]` tag is sanitized (`https:` allowlist), assigned a collision-resistant identity (`nip30:<author>:<pack>:<code>:<urlHash>`), and deterministically hashed via SHA-256 to derive enemy combat attributes.
- **NIP-31**: Unknown event fallback via `["alt", "..."]` tag on all published game receipts and progression saves.
- **NIP-42**: Automatic client authentication (`kind: 22242`) on relay `AUTH` challenges via `NPool`.
- **NIP-46**: Nostr Connect / Remote Signing (`bunker://` and `nostrconnect://`) via `NConnectSigner` and `BunkerURI` using NIP-44 encryption and strict 128-bit CSPRNG secret verification (rejecting generic `"ack"` responses).
- **NIP-55**: Android External Signer (`nostrsigner:` URI intent primary path) for Amber (`com.greenart7c3.nostrsigner`), binding every returned signed event to the exact `PendingNip55Request` (`requestId`, `expectedPubkey`, `expectedEventHash`, tags, content, and BIP-340 signature) without ever falling back to guest signing.

---

## 2. Public Game Run Receipt (`kind: 30078`)

MojiSurvivor publishes immutable-per-run addressable receipts using `kind: 30078` with a unique parameterized `d` tag (`mojisurvivor:run:<timestamp>:<run_hash>`) so earlier runs are never overwritten by relays while remaining queryable via indexed single-letter `#t` tags.

### Relay Query Filter
```json
{
  "kinds": [30078],
  "#t": ["mojisurvivor"],
  "limit": 100
}
```

### Event Schema
```json
{
  "kind": 30078,
  "pubkey": "<64-char lowercase hex BIP-340 x-only pubkey>",
  "created_at": 1793749800,
  "tags": [
    ["d", "mojisurvivor:run:1793749800:7f8a9b1c2d3e"],
    ["t", "mojisurvivor"],
    ["p", "<player-pubkey-hex>"],
    ["score", "14820"],
    ["wave", "11"],
    ["defeated", "312"],
    ["bosses", "2"],
    ["duration", "318"],
    ["run_hash", "7f8a9b1c2d3e"],
    ["weapons", "lightning_zap:3,garlic_aura:2"],
    ["client", "mojisurvivor"],
    ["alt", "MojiSurvivor run receipt: 14,820 pts on Wave 11 (312 emojis defeated)"]
  ],
  "content": "",
  "id": "<64-char sha256 event hash>",
  "sig": "<128-char BIP-340 Schnorr signature>"
}
```

### Verification & Authorship Rules
1. **Strict BIP-340 Schnorr Verification**: Every inbound event from any relay MUST pass `verifyEvent(event)` (`nostr-tools`), match `^mojisurvivor:run:\d+:[0-9a-f]{6,64}$`, carry `["t", "mojisurvivor"]`, match `p === pubkey`, and satisfy integer bounds before entering leaderboard state.
2. **Honest Trust Framing**: Schnorr verification attests cryptographic publisher identity and event integrity across relays (not server-side anti-cheat).
3. **Signed vs. Relay-Confirmed Separation**: Local state distinguishes `unsigned_local`, `signing`, `signed_local`, `queued_offline`, `publishing`, `confirmed` (real NIP-01 `OK` acceptance), `rejected`, and `failed`.

---

## 3. Cross-Device Player Progression Snapshot (`kind: 30078`)

When opted in by the player, MojiSurvivor publishes permanent progression snapshots using a stable addressable identifier:

- `kind`: `30078`
- `d`: `mojisurvivor:progress:v1`
- `t`: `mojisurvivor-progress`

### Reconciliation Invariants
- **Local-First**: All Mojo coins, Career XP, purchased upgrades, and Codex emoji discoveries are persisted locally immediately (across `localStorage`, backup slot, and `AndroidNostrBridge` when present).
- **No Duplication or Rollback**: Cross-device saves merge idempotently via `creditedRuns` (`runSessionId` ledger), taking max upgrade levels per stat, max kill counts per `emojiKey` (preserving full NIP-30 emoji URL & trait metadata offline), and deriving spendable `mojoBalance` from reconciled `lifetimeMojoEarned - totalSpentOnUpgrades`.
- **Zero Secrets**: Progression snapshots contain public game progression only — never `nsec` keys, guest keys, or NIP-46 secrets.

---

## 4. Deterministic Emoji Combat Stat Derivation

Given a sanitized NIP-30 custom emoji `shortcode` and `imageUrl`:

```ts
const digestHex = sha256Hex(`${shortcode}:${imageUrl}`);
```

- `byte[0]` → Base HP (`20`–`100`)
- `byte[1]` → Movement Speed (`1.0`–`3.2`)
- `byte[2]` → Contact / Projectile Damage (`5`–`25`)
- `byte[3] % 4` → AI Archetype (`0`: Swarm Rusher, `1`: Zigzag Stalker, `2`: Shockwave Brute, `3`: Orbiting Sniper)
- `byte[4]` → EXP & Mojo Bounty (`1`–`5`)
- `powerRating = floor(hp * 0.5 + speed * 15 + damage * 2)`
