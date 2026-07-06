# Rhunebot Implementation Plan (v0.2 — codebase-aware)

This plan is tailored to the current `Rhune` repo:
- Node + `discord.js` v14
- CommonJS (`type: commonjs`)
- Slash commands loaded from `/commands/*.js` exporting `{ data, execute }`
- Commands currently **deployed globally on startup** via `Routes.applicationCommands(CLIENT_ID)`

The goal of Phase 0 is to make development fast, repeatable, and safe (feature branches + PRs).

---

## Phase 0 — Make it Dev-Friendly (first PR)

### Goals
- Faster command iteration (guild-scoped deploy in dev)
- Clear env/config expectations
- Working `lint` and non-failing `test` script
- Minimal runbook in README

### Steps

#### 0.1 Document & standardize environment variables
- Add `.env.example` with:
  - `BOT_TOKEN`
  - `CLIENT_ID`
  - `BOT_STATUS`
  - `GUILD_ID` (optional; when set, commands deploy to a single guild)

#### 0.2 Improve command deployment behavior
- In `index.js` deploy commands:
  - If `process.env.GUILD_ID` is set → deploy to `Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID)`
  - Else → deploy globally as it currently does
- Add clear logging indicating where commands were deployed.

#### 0.3 Add/adjust npm scripts
- Add:
  - `lint`: run eslint
  - `dev`: run bot with `NODE_ENV=development` (or just `node index.js` with dev env)
- Fix `test` to not fail by default (replace placeholder exit 1). Options:
  - Temporary: `node -e "console.log('no tests yet')"`
  - Or introduce a test runner (Vitest/Jest) in Phase 1.

#### 0.4 Add lightweight README runbook
- How to create a Discord app + bot token
- Required env vars
- How slash command deployment works (global vs guild)
- How to run locally

#### 0.5 (Optional but recommended) CI smoke check
- GitHub Action:
  - `npm ci`
  - `npm run lint`
  - `npm test`

### Definition of done
- A new contributor can:
  1) copy `.env.example` → `.env`
  2) set `GUILD_ID`
  3) run `npm run dev`
  4) see commands appear quickly in that guild

---

## Phase 1 — Dice Engine Library + `/roll` + `/fate` (second PR)

### Steps
- Create `lib/dice/` with minimal parser/evaluator.
- Add PbtA roll helpers (2d6 + stat; adv/dis).
- Add `commands/roll.js` and `commands/fate.js`.

---

## Phase 2 — Roll Presentation + Roll Logging (third PR)

- Standard embed formatting helpers.
- Add SQLite-backed roll logs with rollId.

---

## Phase 3 — Storage Layer + Character Model Skeleton (fourth PR)

- SQLite storage layer + migrations.
- `/pc` commands for create/show/set/hp/xp/debilities.

---

## Phase 4 — Move Definitions + `/move roll` MVP (fifth PR)

- Move definitions stored in repo (markdown + YAML frontmatter suggested).
- `/move show` + `/move roll` with global miss XP.

---

## Phase 5 — Burn Brightly + Hold Currencies (sixth PR)

- Link roll logs and allow spending XP to modify a roll.
- Generic hold/spend currencies.

---

## Phase 6+ — Companions/Followers, Inventory/Supplies, Steading, Arcana, Rules Search

Sequenced based on play needs.
