# MojiSurvivor

**MojiSurvivor is a mobile-oriented, browser-based survivor arcade game** built with React, TypeScript, Vite and Tailwind CSS. Players fight waves using custom Nostr emojis (NIP-30), collect progression/upgrades and browse a Codex, leaderboards and identity/settings. The application has local save/checkpoint logic and optional Nostr identity, relay, and publication capabilities.

This is the **game's source repository**, not the Pretend Internet launcher or a generic React example. Do not infer that the existing code has been verified as an installed Android app or a publicly working nsite merely because it builds.

## Start here (human or coding agent)

1. Read [AGENTS.md](AGENTS.md) for source boundaries, current user requirements, safety rules and verification expectations.
2. Read [NIP.md](NIP.md) before changing Nostr event formats, signers, moderation, or identity handling.
3. Inspect the exact requested behavior and relevant current source/tests. Do not redesign gameplay, replace the UI, or infer an approved roadmap from an AI Studio example.
4. Keep **build/test** and **sign/publish/deploy** as separate actions. Documentation or CI success is not publication permission.

## Project map

| Path | Role |
| --- | --- |
| `index.html`, `src/main.tsx`, `src/App.tsx` | Browser entry and top-level game navigation/state |
| `src/components/ArenaView.tsx` | Arcade game view |
| `src/lib/gameEngine.ts`, `src/lib/realms.ts` | Gameplay and realm configuration |
| `src/lib/storage.ts` | Local progression, checkpoints and recovery |
| `src/lib/nostrEngine.ts`, `src/lib/moderationLists.ts` | Nostr integration, signer/relay handling and moderation |
| `src/components/IdentitySettingsView.tsx` | Identity, settings and publication surface |
| `src/components/NsitePublisherPanel.tsx`, `src/lib/nsitePublisher.ts` | In-app nsite publication path |
| `scripts/publish-nsite.ts` | Explicit CLI publishing tool (network/signing side effects) |
| `tests/mojisurvivor.test.ts` | Node-compatible test suite for game state, Nostr and publication helpers |
| `vite.config.ts`, `bun.lock`, `package.json` | Build definition, pinned Bun dependencies and scripts |
| `metadata.json`, `.env.example` | AI Studio metadata and placeholder environment configuration |

## Local development and offline checks

The repository has a **Bun lockfile** (`bun.lock`). Use a Bun-capable environment for the following source-declared scripts:

```bash
bun install --frozen-lockfile
bun run dev
```

`bun run dev` starts the Vite development server, currently configured by `package.json` for port 3000. Before proposing a code change or marking it ready, run the non-publishing checks:

```bash
bun run lint
bun run test
bun run build
```

- `lint` invokes `tsc --noEmit`; `test` invokes `tsx --test tests/mojisurvivor.test.ts`; `build` invokes `vite build`.
- The production build uses a relative Vite base and emits `dist/`. The Vite plugin also writes `dist/build-manifest.json` for the existing nsite publisher.
- Copy the existing `.env.example` only if a specific tested integration needs its variables; **never commit API keys, Nostr secrets or bunker connection URIs**.
- A successful build/test proves only those checks. Verify relevant browser behavior, local save/reopen, and device-specific interactions separately.

**CI status:** `.github/workflows/webpack.yml` (historical filename) now defines a Bun/Vite verification job for pull requests and pushes to `main`: frozen Bun install, TypeScript check, regression tests, production build, and a downloadable `dist/` artifact. **Treat results as unverified until the exact-head run passes**; a GitHub CI artifact is not a public deployment. The separate `.github/workflows/npm-publish-github-packages.yml` still attempts GitHub Packages publication on release creation and uses `npm ci` without a checked-in npm lockfile; it is **not** an approved game/nsite release path. Follow [AgentOps readiness checklist #30](https://github.com/br3avery-maker/AgentOps/issues/30) for independent release-safety review.

## Nostr and publication boundaries

The game can browse remote Nostr content and includes optional signing and publishing features. Read [NIP.md](NIP.md) for the relevant event kinds, signer adapters and identity/trust requirements. The CLI `publish:nsite` is a **real publication operation**, not a build command.

- Never run `publish:nsite`, `npm publish`, release creation, relay broadcasts, Blossom uploads, or signer flows merely to check compilation or preview UI.
- For any **separately authorized** publication, confirm the intended account, site identity/namespace, actual event data, and precise operation. A signer connection, relay `OK`, and a verified live nsite are different stages.
- Do not add an automatic "create new site" fallback when an **update** target is unavailable. Preserve recovery receipts and do not create clones or publish under the wrong identity.
- The current code's ability to sign or upload is **not** a verified end-to-end remote signing or publication acceptance result.

## Acceptance and handoff

For an actual coding task, identify the source revision, current issue/requirement, requested outcome, preserved behavior, changed files, commands/results, browser or Android verification if required, and a durable branch/PR or other recoverable checkpoint. Record any tests not run. Existing user corrections and the actual game workflow outrank generic scaffolding.

**Verification boundary:** this README describes source and checks; inspect the current GitHub Actions run for actual build/test evidence. Compilation and regression tests are not installed-device acceptance, a completed AI Studio cold-import test, or proof of live nsite publication.
