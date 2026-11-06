# Moji Survivor — Rebirth Reset Fix, Historical & Moji Leaderboards, Trading-Card Profiles & Math Awards

Fixes the infinite Career Rebirth exploit by resetting cycle Player Level to `Lv.1` on Rebirth while preserving `Lifetime XP` for all-time stats, upgrades the Leaderboard to aggregate full player run histories and auto-merge your own relay receipts into local stats, adds a collectible **Moji Leaderboard** with rarity graphics (featuring **Prismatic Rainbow + Silver Sparkles** for Mythic/Apex cards and zero gold), and introduces **Trading-Card Player Profiles** with deterministic **Silly Math Awards** and queryable Nostr event tags.

### User Review & Critical Decisions

> [!IMPORTANT]
> Updated Mythic/Apex rarity and Trading Card styling to use **Holographic Rainbow with Chrome Silver Sparkles** (no gold!). Click **Proceed** when ready to build.

- **Confirmed Decision 1 — Rebirth Resets Cycle Player Level to `Lv.1` (Preserving `Lifetime XP`)**: Ascending to a new Rebirth Tier resets both your 5 Upgrade Lab tracks (`0/44`) and your active cycle Player Level back to `Lv.1 (0/100 XP)` by recording `xpSpentOnRebirths`, while keeping `lifetimeXpEarned` untouched for your Trading Card and badge math.
- **Confirmed Decision 2 — Full Run History Leaderboards & Own-Run Auto-Merge**: Aggregates all signed `kind: 30078` run receipts per player (supporting both **All-Time Career Totals** and **Best Single Run** views plus expandable per-player run history timelines) and automatically merges your own verified relay runs back into your local `highScore`, `bestWave`, and career totals.
- **Confirmed Decision 3 — Moji Leaderboard with Rainbow + Silver Sparkle Mythic Rarity**: Adds a dedicated **Moji Ranks** view in `Ranks` with collectible rarity frames (`Common`, `Uncommon`, `Rare`, `Epic`, and **Mythic / Apex** rendered in **Prismatic Rainbow with Chrome Silver Sparkles**—no gold).
- **Confirmed Decision 4 — Collectible Trading-Card Profiles, Silly Awards & Queryable Tags**: Upgrades the `Profile` tab (and player inspection on the Leaderboard) with a visual **Survivor Trading Card** (plus downloadable/shareable PNG card generator), deterministic **Silly Awards & Badges** computed purely from signed math, and queryable stat/badge tags on `kind: 30078` events.

---

### 1. Overview & Core Concept

- **What It Does**:
  1. Makes Career Rebirth a true prestige loop where your cycle level resets to `Lv.1` and your Upgrade Lab resets to `0/44`, requiring real progression in each Rebirth cycle while preserving all-time `Lifetime XP`.
  2. Turns the `Ranks` view into a full historical Nostr stat hub with **Player Career Totals**, **Best Single Runs**, expandable **Player Run Histories**, and a **Moji Leaderboard** showcasing the most-slain and most-featured custom emojis with holographic rarity graphics.
  3. Introduces collectible **Survivor Trading Cards** on the `Profile` tab and Leaderboard player modal—complete with Weapon Mastery, Top Defeated Mojis, deterministic **Silly Math Awards**, and queryable `kind: 30078` tags so badge verification is pure math.
- **Target Audience / Persona**: Nostr players and custom emoji collectors competing on Android and web who want persistent historical leaderboards, collectible trading cards, and verifiable on-relay achievements.
- **Key Value**: Fixes progression balance, ensures your Lobby and Profile always reflect your highest relay-verified runs, and makes every custom NIP-30 emoji and player career feel like a collectible card game.

---

### 2. User Experience & Visual Design

- **Key User Flows**:
  1. **Rebirth Cycle Reset (`Upgrades`)**:
     - Shows accurate `totalUpgradeLevels / 44` progress (`10 + 10 + 8 + 8 + 8`).
     - Displays both **Cycle Level (`Lv.X`)** and **All-Time Lifetime XP**.
     - Clicking **Ascend to Rebirth Tier N** resets Upgrade Lab levels to `0/44` and active Cycle Level to `Lv.1 (0/100 XP)` while preserving `Lifetime XP`, unspent Mojo, and Codex unlocks.
  2. **Historical Player Leaderboards & Moji Leaderboard (`Ranks`)**:
     - **Top Mode Switch**: `Player Ranks` · `Moji Leaderboard` · `My Receipts`.
     - **Player Ranks**: Toggle between **Career Totals** (sums all verified `kind: 30078` run receipts + published progress snapshots per pubkey: Cumulative Score, Total Kills, Total Bosses, Run Count) and **Single Run Best** (`Best Score`, `Highest Wave`, `Most Defeated`, `Boss Slayers`).
     - **Expandable Player History & Trading Card Modal**: Tapping any ranked player opens their **Survivor Trading Card**, unlocked **Silly Awards**, and their chronological list of verified Nostr run receipts.
     - **Auto-Merge Own Relay Runs**: Whenever relay sync finds verified `kind: 30078` runs authored by your active `pubkey` (such as an older `180,530` score run from another session/device), it automatically reconciles them into your local `highScore`, `bestWave`, `localReceipts`, and `creditedRuns` ledger so your Lobby and Profile are immediately up to date.
     - **Moji Leaderboard**: Ranks custom NIP-30 emojis across `Most Slain`, `Featured in Top Runs`, and `Highest Power Rating`, rendered inside **Rarity Graphic Cards** with holographic tier borders, combat archetype badges, and pack attribution.
  3. **Survivor Trading Card & Silly Awards (`Profile`)**:
     - Displays your interactive **Survivor Trading Card** right at the top of the `Profile` tab with foil/neon rarity styling based on your Rebirth Tier & Career Level, showing `Cycle Lv.`, `Lifetime XP`, `Rebirth Tier`, `Lifetime Score`, `Best Run`, `Total Kills`, `Bosses Slain`, `Signature Weapon`, and `Most Slain Moji`.
     - Includes a **Silly Awards & Math Badges Case** where each badge shows the exact mathematical formula and verified progress bar (e.g., *Cursed Banker*, *Emoji Exterminator*, *Apex Bully*, *Ascension Addict*, *Glass Cannon*, *Centurion*, *Spellweaver Supreme*, *Codex Hoarder*).
     - Includes a **"Share / Download Trading Card PNG"** button that renders the full collectible trading card with your avatar, stats, top Moji sprite, and badges onto an exportable high-res canvas.

- **Visual Identity & Rarity Graphics System (Zero Gold — Prismatic Rainbow & Silver Sparkles)**:
  - *Aesthetic Direction*: High-contrast arcade trading-card vault in Moji Survivor's signature Pitch Black (`#000000`) and BreBre Deep Pink (`#FF1493`) palette (`🖤💗`), accented with Cyber Cyan (`#00F0FF`) and Chrome Silver (`#E2E8F0` / `#FFFFFF`).
  - *Rarity Graphics Tiers (for Moji Cards & Survivor Trading Cards)*:
    - **Common (`Matte Slate #64748B`)**: Clean geometric frame with subtle grid backing.
    - **Uncommon (`Neon Mint #10B981`)**: Dual-line tech frame with corner brackets.
    - **Rare (`Cyber Cyan #00F0FF`)**: Radiant cyan circuit border with diagonal sheen.
    - **Epic (`BreBre Pink #FF1493`)**: Neon magenta twin-bezel frame with corner emblems.
    - **Mythic / Apex (`Prismatic Rainbow + Silver Sparkles`)**: Iridescent full-spectrum rainbow gradient border (`#FF1493 → #FF6B00 → #00F5D4 → #00F0FF → #A855F7 → #FF1493`) overlaid with crisp **Chrome Silver (`#FFFFFF` / `#CBD5E1`) 4-point star sparkles** and holographic foil shimmer (both in the DOM card component and the Canvas PNG Trading Card renderer).

---

### 3. Key Product Decisions & Trade-Offs

- **Decision 1 — Tracking `xpSpentOnRebirths` vs. Erasing `lifetimeXpEarned`**
  - *Chosen Approach*: Add `xpSpentOnRebirths` to `PersistedGameState`. Active `playerLevel`, `playerXp`, and `playerXpNext` are derived from `cycleXp = Math.max(0, lifetimeXpEarned - xpSpentOnRebirths)`, which resets to `0` (`Lv.1`) on each Rebirth while `lifetimeXpEarned` continues growing monotonically forever.
  - *Why*: Resets your active level to `Lv.1` as requested (fixing the infinite Rebirth bug) without destroying your all-time XP history needed for Trading Card stats and Nostr badge math.

- **Decision 2 — Deterministic Math Engine for Silly Awards & Queryable Nostr Tags**
  - *Chosen Approach*: Compute all awards via a pure, deterministic function `evaluatePlayerAwards(stats)` that takes verifiable numbers (`totalRuns`, `lifetimeScore`, `highScore`, `bestWave`, `totalKills`, `totalBossKills`, `rebirthCount`, `mojoBalance`, `lifetimeMojoEarned`, `codexCount`, `runs`) and outputs unlocked badges with their exact math proof. Publish these summary metrics and `["badge", "<badge_id>"]` tags on `kind: 30078` (`mojisurvivor:progress:v1`) and include `["featured_emoji", ...]` tags on run receipts.
  - *Why*: Ensures badges are never arbitrary flags—any external script or player querying relays can verify the exact numbers and confirm every badge is legitimately earned.

---

### 4. Technical Architecture & Data Strategy *(Technical Reference)*

- **Architecture & Component Diagram**:

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                     MOJI SURVIVOR — STATS, RANKS & CARDS                     │
│          [Lobby] · [Upgrades] · [Codex] · [Ranks] · [Profile]                │
└─────────┬──────────────────────────┬──────────────────────────┬──────────────┘
          │                          │                          │
          ▼                          ▼                          ▼
┌───────────────────────┐  ┌─────────────────────────┐  ┌──────────────────────┐
│ REBIRTH & CYCLE XP    │  │ HISTORICAL & MOJI       │  │ TRADING CARD &       │
│ ENGINE                │  │ LEADERBOARD AGGREGATOR  │  │ MATH BADGE ENGINE    │
│ • cycleXp = lifetime  │  │ • Multi-Run Per-Player  │  │ • Deterministic      │
│   - xpSpentOnRebirths │  │   History & Career Sums │  │   Silly Awards Math  │
│ • Resets Lv.1 & 0/44  │  │ • Auto-Merge Own Relay  │  │ • Rainbow + Silver   │
│   Upgrades on Rebirth │  │   Receipts into Local   │  │   Sparkle Foil Cards │
│ • Preserves All-Time  │  │ • Moji Leaderboard      │  │ • Queryable 30078    │
│   Lifetime XP & Mojo  │  │   (Kills/Featured/Power)│  │   Stat & Badge Tags  │
└───────────────────────┘  └─────────────────────────┘  └──────────────────────┘
```

- **Data Model & Protocol Additions**:
  - `PersistedGameState`: Adds `xpSpentOnRebirths?: number` (migrated cleanly so existing saves with `rebirthCount > 0` and `0` upgrades reset cycle XP to `Lv.1` until leveled again) and `MAX_TOTAL_UPGRADE_LEVELS = 44`.
  - `PlayerLeaderboardAggregate`: Groups all verified `kind: 30078` run receipts by `pubkey`, computing `runCount`, `bestScore`, `cumulativeScore`, `bestWave`, `cumulativeKills`, `cumulativeBosses`, `favoriteWeapon`, `featuredEmojis`, and chronological `runs[]`, enriched with any published `mojisurvivor:progress:v1` snapshot.
  - `MojiLeaderboardEntry`: Aggregates NIP-30 and Reserve emojis across local + relay snapshots and featured run tags, tracking `emojiKey`, `shortcode`, `url`, `tier` (`Common` | `Uncommon` | `Rare` | `Epic` | `Apex`), `powerRating`, `totalKills`, `timesFeaturedInRuns`, and `packTitle`.
  - `SillyAwardEvaluation`: Pure mathematical evaluation for 10+ fun awards (*Cursed Banker*, *Ascension Addict*, *Emoji Exterminator*, *Apex Bully*, *Glass Cannon*, *Speedrunner*, *Centurion*, *Spellweaver Supreme*, *Codex Collector*, *Untouchable Wave*).
