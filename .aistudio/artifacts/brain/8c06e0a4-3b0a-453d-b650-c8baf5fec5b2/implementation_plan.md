# MojiSurvivor — Relay Auto-Discovery, Amethyst Nsite Hardening, Moderation Blocklist & Career Rebirth Plan

## 1. Architectural & Feature Overview

This update resolves relay connectivity bottlenecks, hardens compatibility with the Amethyst Android `nsite` browser, ensures clean production builds (`npm run build`), integrates the `moji-curator-blocklist/v1` NSFW publisher/emoji blocklist, and expands progression with **Career Rebirth Prestige** and **Lifetime Totals & Leaderboard Filters**.

---

## 2. Core Systems & Implementation Details

### A. Automatic Relay Discovery, Health Probing & Manual Override Toggle
* **Curated Public Relay Candidate Pool (`/src/lib/nostrEngine.ts`)**:
  * Expand the candidate pool of free public Nostr relays known to serve kinds `0`, `1984`, `10002`, `10030`, `30030`, and `30078` (e.g., `wss://relay.damus.io`, `wss://nos.lol`, `wss://relay.primal.net`, `wss://purplepag.es`, `wss://relay.nostr.band`, `wss://nostr.wine`, `wss://offchain.pub`, `wss://relay.snort.social`).
  * Implement `probeRelaysHealth()` in `NostrCoordinator`: on app startup or manual sync, runs a lightweight concurrent WebSocket probe (`REQ` for a single `30030` event with a 3.5s timeout) measuring round-trip `latencyMs`, connection state (`online` | `degraded` | `unreachable`), and read/write responsiveness.
  * Automatically prune unreachable/timed-out relays from active query loops so the client never repeatedly pings dead relays on subsequent syncs.
* **Auto-Manage Relays Toggle (`/src/lib/storage.ts`, `/src/components/IdentitySettingsView.tsx`)**:
  * Add `autoManageRelays: boolean` (default `true`) to `PlayerProfileState`.
  * When `autoManageRelays` is enabled, the coordinator automatically selects and connects to the top responsive relays from the probe and displays live per-relay status badges (`online` + latency in ms) and a **"Re-Scan Healthy Relays"** button.
  * Users can flip the **"Auto-Manage Relays"** toggle off at any time to expose custom relay management (add/remove `wss://` relays manually).

### B. Amethyst `nsite` Browser Compatibility & `npm run build` Reliability
* **Eliminate All `<form onSubmit>` Tags (`/src/components/IdentitySettingsView.tsx`, `/src/components/CodexView.tsx`)**:
  * Amethyst's hardened `nsite` WebView blocks HTML `<form>` submission events under strict CSP/sandbox rules (`form-action 'none'`).
  * Convert all 7 `<form>` wrappers (Relay addition, NIP-55 Android Signer pubkey bind, NIP-46 Bunker URI connect, Local `nsec` import, Banned Hash add, Banned Author `npub`/hex add, and Safe Hash add) into `<div>` flex containers with `onKeyDown={(e) => e.key === 'Enter' && ...}` on the `<input>` and `type="button" onClick={...}` on the action button.
* **Nsite Permission Manifests & Relative Asset Bundling (`/public/.well-known/nostr.json`, `/public/manifest.webmanifest`, `/index.html`, `/vite.config.ts`)**:
  * Add `public/manifest.webmanifest` and `public/.well-known/nostr.json` declaring `nip07`, `nip46`, `nip55`, and WebSocket relay permissions for `nsite` gateways and Android WebView containers.
  * Set `base: './'` in `vite.config.ts` and clean relative asset references so static `nsite` blossom deployments and `npm run build` succeed cleanly in any environment.

### C. Built-In `moji-curator-blocklist/v1` NSFW Blocklist & JSON Importer
* **Baked-In Publishers & Emoji URL Hashes (`/src/lib/moderationLists.ts`)**:
  * Bake all 9 unique NSFW publisher hex pubkeys from the user's `moji-curator-blocklist/v1` report into `BUILTIN_BLOCKED_PUBKEYS`:
    * `1a21da9d5ae3dffdac19adf5e400394401f67f8da4113a1b7bdece35b0d99fe2`
    * `415778be61cfd789cd58eb06c902706b49dc7da16b0a22125670dff33d81dc42`
    * `f4b55ea7491fb70849afa6f673fc58846b61ce7efb1d8051bbae35b0d99fe2` (`f4b55ea7491fb70849afa6f673fc58846b61ce7efb1d8051bbae35d1a13a48ab`)
    * `983d5dae1d2280926cf90c037394dbda4348503f4cc342464df7fde98cabecdf`
    * `626b275b16dec6db7a27e807c2db690e71b4d42d482f1817ab370601eeabb735`
    * `0b7943cce4a9c7fee87a7921b6201d4f847defc2064d6ba6ad3e3f6cdc43c1b3`
    * `0a717f27d9ef6f45dafe49f14a49fa4bac8c51b7efc85ff1f318779d8c43707b`
    * `4b56bbf41c92e586e88927acb78836eb49f2b184081ef852625cf78be7d56bd6`
    * `025cf9571bc0c7172802bcb37c9de29fcc852f59a4f7c84231ef8eb6fcae30dc`
  * Pre-compute and bake the SHA-256 normalized URL hashes for all 4 specific blocked emoji URLs into `BUILTIN_BLOCKED_HASHES`, and also block matching exact normalized URLs.
* **`moji-curator-blocklist/v1` JSON Importer (`/src/components/IdentitySettingsView.tsx`)**:
  * Add a bulk JSON import/paste modal in the Moderation panel that parses `moji-curator-blocklist/v1` payloads, hashes any `blocked[].url` entries, extracts `blocked[].author` and `blockedPublishers[]`, and merges them directly into the player's local & NIP-51 moderation lists.

### D. Career Rebirth Prestige System
* **Prestige Loop (`/src/lib/storage.ts`, `/src/lib/gameEngine.ts`, `/src/components/UpgradeLabView.tsx`)**:
  * Track `rebirthCount: number` and `lifetimeMojoEarned: number` on `PlayerProfileState` (and persist in Nostr Kind `30078` progression snapshots).
  * Once a player reaches **Career Player Lv. 20+** (20 total upgrade levels purchased), unlock the **Career Rebirth** chamber in the Upgrade Lab:
    * Resetting Upgrade Lab levels to 0 grants **+1 Rebirth Tier** (`rebirthCount + 1`).
    * Each Rebirth Tier grants permanent multiplicative combat bonuses that persist across all runs and stack with Upgrade Lab levels:
      * **+15% Weapon Damage** per Rebirth Tier
      * **+12% Mojo Bounty** per Rebirth Tier
      * **+10% Max Hull Integrity** per Rebirth Tier
    * Displays a Rebirth Prestige badge (`Rebirth I`, `Rebirth II`, etc.) on the HUD and Leaderboard receipts.

### E. Expanded Lifetime Totals & Leaderboard Filters
* **Career Totals Ribbon & Sort Filters (`/src/components/LeaderboardView.tsx`, `/src/lib/storage.ts`, `/src/lib/nostrEngine.ts`)**:
  * Track cumulative career stats in `PlayerProfileState`: `totalRuns`, `totalScore`, `totalKills`, `totalBossKills`, `bestScore`, `highestWave`, and `rebirthCount`.
  * Add a **Career Lifetime Totals** summary strip at the top of the Leaderboard view showing personal lifetime totals alongside global relay stats.
  * Add interactive Leaderboard filter/sort tabs (`Best Score`, `Highest Wave`, `Most Defeated`, `Apex Boss Slayers`) so players can rank runs across different survival metrics.

---

## 3. Verification Plan
1. **Unit & Integration Suite (`npm test -- --run`)**:
   * Verify `BUILTIN_BLOCKED_PUBKEYS` and `BUILTIN_BLOCKED_HASHES` block all publishers and URLs from the `moji-curator-blocklist/v1` payload.
   * Verify `parseCuratorBlocklistJson` accurately extracts authors, publishers, and URL hashes.
   * Verify Career Rebirth resets upgrade levels while incrementing `rebirthCount` and applying permanent stat multipliers in `MojiSurvivorEngine`.
2. **Build & Lint Verification (`compile_applet` & `lint_applet`)**:
   * Ensure zero TypeScript or ESLint errors and clean relative bundle generation (`npm run build`).
