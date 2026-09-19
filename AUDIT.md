# Rhune Bot — Code Audit / Tech-Debt Log

> **Status:** IN PROGRESS — read-through phase. No code changes yet.
> **Started:** 2026-09-18 (Fri evening, after deploy of PR #34 — machine ver 26)
> **Scope:** Bot source code + tests only (per Kaia). Excludes `rhune-ttrpg` vault.
> **Method:** Report-first. Log findings here; triage with Kaia before fixing. Mark potential bugs/edge cases clearly so we can write confirmation tests *before* any big fix.
> **Commit for baseline:** `32ce63d` (main, as of audit start).

## How findings are tagged
- **[BUG]** — likely actual bug / silent-wrong behavior (need confirm test first)
- **[EDGE]** — edge case / unhandled path that could break
- **[PERF]** — inefficiency (redundant calls, N+1, hot path)
- **[DRY]** — duplicated logic / copy-paste / streamlining
- **[DEBT]** — style drift, magic numbers, missing error handling, cruft
- **[DOC]** — README / docs inaccurate
- **[TEST]** — missing coverage / uncovered path

## Baseline numbers
- Total JS: ~7,833 lines, 32 source files.
- Heaviest: `lib/playbooks.js` (1502, data), `index.js` (1151), `commands/char.js` (1011), `lib/create_wizard.js` (505), `commands/roll.js` (379), `lib/moves_data.js` (348).
- Tests: 33 passing (6 files).

---

## FILE MAP

### Entry / core
- `index.js` (1151) — client, all event handlers (MessageCreate, InteractionCreate: buttons, menus), health server, command registration.
- `commands/` — `char.js` (1011), `roll.js` (379), `inv.js` (200), `outfit.js` (97), `move.js` (46), `coinflip.js` (13).

### lib/ — data + logic
- `playbooks.js` (1502, data), `moves_data.js` (348, data), `create_wizard.js` (505), `char_ops.js`, `character_embed.js`, `characters_pb.js`, `conditions_pb.js`, `create_wizard.js`, `db.js`, `dice.js`, `dice_images.js`, `disambiguation.js`, `embed_pager.js`, `format.js`, `gm.js`, `id.js`, `interaction_helpers.js`, `inventory_pb.js`, `inventory_state_pb.js`, `inventory_template.js`, `moves_data.js`, `pb.js`, `pb_diagnostics.js`, `pbta_roll_strip.js`, `pending_actions.js`, `resolve_target.js`, `rolllog.js`, `rolllog_pb.js`.

### infra / meta
- `Dockerfile`, `fly.toml`, `eslint.config.js`, `.github/workflows/ci.yml`, `.env.example`, `README.md`, `IMPLEMENTATION_PLAN.md`.

---

## FINDINGS LOG

(newest at top; each entry = id, tag, location, description, why, suggested fix, effort)

## index.js (1151) — findings

- **A1 [DRY]** The "category overview" embed (`📖 Move Reference` + per-category move counts + category button row) is built **3 times** by copy-paste: `rhune:move:sheet:` fallback, `rhune:move:reference`, and `rhune:move:cat:`. Extract a `buildMoveReferenceEmbed()` helper (likely in `lib/moves_data.js` or `lib/embed_pager.js`). Reduces ~40 lines of duplication. **Effort:** S.
- **A2 [DRY]** The "re-render sheet + build action/components row" block is duplicated in **3 places**: `rhune:playbook:back:`, `rhune:editdone:`, and wizard `finalize`. The row assembly (Playbook / Moves / Edit buttons conditionally) is identical logic. Extract `lib/character_embed.js` helper e.g. `buildSheetActionRow(record)`. **Effort:** S.
- **A3 [DEBT]** Magic number `flags: 64` is used ~20× throughout `index.js` (ephemeral flag). Replace with `MessageFlags.Ephemeral` from discord.js for readability + future-proofing (deprecation warnings already appear in logs about `ephemeral` option vs flags). **Effort:** S.
- **A4 [DEBT]** `buildEditView()` is defined inline in `index.js` but is cohesive enough to live in `lib/character_embed.js` or a new `lib/edit_view.js`. Makes `index.js` smaller + unit-testable. **Effort:** S.
- **A5 [TEST]** **All button handlers + the MessageCreate outfit-save handler are entirely untested.** Covered: dice, template, some PB wrappers, char/inv commands. Uncovered: quick-roll buttons, edit hp/xp/debil, inventory button, playbook/move reference buttons, creation wizard buttons/menus, the reply-to-save flow (expiry, length guard, save, template cleanup). This is the biggest single coverage gap. **Effort:** L (bulk) — see TEST section.
- **A6 [EDGE]** Edit-HP clamp uses `record.hp_max ?? current` as the upper bound. If a record is missing `hp_max` (null/undefined) and `hp` is also null → `current` becomes 0 and the clamp collapses to `[0, 0]`, so HP can never be raised. Should treat missing `hp_max` as a generous default (e.g. `hp_max || 20` or reuse creation default). Low likelihood but silently confusing. Needs a confirm test. **Effort:** S.
- **A7 [DEBT]** `deployCommands()` re-reads `commands/` dir & re-requires each command, and `index.js` startup also reads/registers commands — two separate registration passes with duplicated loading logic. Minor, but could share one loader. **Effort:** M (low priority; has tests?—no).
- **A8 [EDGE]** `parsePickCharCustomId` / disambiguation handlers: for the `rhune:pick:*` flow, when a non-owner picks, code does `getCharacterById`, then still calls `renderCharacterSheetEmbed`/`doCharAction` after owner check. Confirm the GM path (`guildOwnerId: interaction.guild?.ownerId ?? null`) isn't redundant given `isGm` is computed separately — the two owner-determinations (`isGuildOwner` + `guildId`/`guild.ownerId`) should be unified to avoid drift. **Effort:** S-M.
- **A9 [DEBT]** `rollCommand` is imported via `require('./commands/roll')` (and used for `buildModifierPicker`, `resolveStatInfo`, `buildModePicker`, `executeQuickRoll`). Check for circular-import risk (roll.js may import index helpers). Verify. **Effort:** S (inspect).
- **A10 [DEBT]** Health HTTP server + client are both started at module load; if `BOT_TOKEN` missing, `client.login` throws but health server already bound (good for Fly readiness). Confirm no unhandled-rejection crash path for failed login. **Effort:** S.

## ✅ RESOLVED — Dead code removal (rolllog/db + fate)

Branch `chore/remove-dead-code`, commit `418d1dc` (2026-09-18). Deleted `lib/rolllog.js` + `lib/db.js` (old SQLite roll-log, superseded by `rolllog_pb`; `better-sqlite3` wasn't even in package.json deps). Removed `rollFate()` (dice.js) + `fateEmbed()` (format.js) + the fate test block in dice.test.js (which tested the removed `/fate` feature). No behavior change; suite 33 passing, lint clean. PR: https://github.com/CalebCyphers/Rhune/pull/new/chore/remove-dead-code

## Dead code — roll logging backend

- **B1 [DEBT] Dead code: `lib/rolllog.js` + `lib/db.js` (local SQLite roll log).** The project moved roll logging to PocketBase (`lib/rolllog_pb.js`), but the original better-sqlite3 local backend was left behind. `lib/rolllog.js` imports `lib/db.js`, and nothing else imports either. `better-sqlite3` is **not even in package.json deps** — so this code would crash if ever required. Safe to delete `lib/rolllog.js` + `lib/db.js` after confirming no import. **Effort:** S. (Confirm: `grep` shows zero live imports.)

## commands/roll.js (379) — findings

- `roll.js` imports cleanly; **no circular import with index.js** (A9 cleared). Clean, well-factored.
- **R1 [DEBT]** (cleared) `STAT_LABELS` defined only once in roll.js (exported). No duplication.
- **R2 [EDGE]** `executeQuickRoll` builds own dice-line / title / description that largely duplicate `twoD6Embed()` in format.js (the field layout + dice-line + dropped-die line is copy-pasted). Could reuse the shared embed builder to keep one source of truth for roll rendering. **Effort:** S-M.
- **R3 [PERF] minor** `resolveStatInfo` and `buildModifierPicker` each independently call `getActiveCharacterId` + `getCharacterById` (2 DB round-trips each). In the quick-roll flow, `buildModifierPicker` runs, then each button-press re-resolves the same active char. Could pass the resolved record through the button customId/flow to avoid repeat lookups. **Effort:** M (needs flow refactor) — low priority.
- **R4 [TEST]** `resolveStatInfo`, `buildModifierPicker`, `buildModePicker`, `executeQuickRoll`, `buildDiceAttachments` have **no unit tests**. These are pure-ish/DB-stubable and ideal candidates. **Effort:** M.

## lib/pb.js (184) — findings

- Solid, well-documented retry/reauth design; already tested (test/pb/pb.test.js). No major issues.
- **P1 [DEBT]** (confirmed) `rollFate()` in dice.js + `fateEmbed()` in format.js are **dead** — not imported by any live command. Only `test/unit/dice.test.js` references `rollFate`. The `/fate` command was removed but these were left. Could keep (harmless) or remove for cleanliness; if kept, test stays valid. **Effort:** S if removing.

## lib/char_ops.js (72) — findings

- **C1 [EDGE]** `doCharAction` 'set' action merges only `stats` into the existing record (`{ ...(record.stats || {}), ...(patch.stats || {}) }`); other top-level fields are replaced wholesale via `patch`. For a character whose record lacks e.g. `hp_max`, a partial set is fine, but there's no typing/clamping — a malformed patch could set `hp` to a string or negative. The button/edit paths sanitize before calling; the `/char set` raw path may not. Confirm `/char set` input validation. **Effort:** S-M.
- **C2 [EDGE]** `cond_add`/`cond_remove` re-fetch `getCharacterById` after mutating conditions but the returned record's conditions aren't in the char record (conditions live in a separate collection and are fetched separately in the sheet renderer) — so returning `record` here is only useful as a trigger to re-render. Harmless but slightly confusing; re-fetch could be skipped since the caller re-renders from id. **Effort:** S.
- **C3 [TEST]** `doCharAction` multi-action dispatcher has **no direct unit tests** (owner/GM gate, active/sheet/rename/delete/set/mod/cond_add/cond_remove paths, unknown-action error). Core authz + mutation logic; high-value to test with mock PB. **Effort:** M.

## lib/character_embed.js (70) — findings
- **E1 [PERF] N+1:** `renderCharacterSheetEmbed` calls `listConditions` (a PB read) for **every sheet render**. Called from `/char sheet`, the Inventory button, playbook-back, edit-done, wizard-finalize, pick flows, etc. Each `runPb` also has retry machinery. For a single-guild small scale it's fine, but it's an unavoidable extra round-trip per render. Could be batched when rendering multiple sheets, or conditions could be denormalized onto the record. **Effort:** M (low priority at current scale).
- **E2 [PERF] minor** `formatStatBlock`/`safeInline`/`formatStat` are pure and duplicated-ish (small). Fine.
- **E3 [EDGE]** `specialPossessions` parsing: if `choices` is a JSON string and `JSON.parse` throws, it silently defaults to `{}` — acceptable defensive behavior. But `chosen_possessions` items are joined with `• ` inside a code block; a possession containing a backtick or newline could break the monospace block. Discord allows it, but multi-line possessions render oddly. **Effort:** S (cosmetic).

## lib/inventory_state_pb.js (54) — findings
- Clean upsert; already covered by test/pb/inventory_pb.test.js? (verify inventory_state has a test). **S1 [TEST]** confirm `inventory_state_pb` (upsert/get) is unit-tested; if not, add.

## lib/conditions_pb.js (26) — findings
- Clean, thin. `listConditions` sorts by name; `addCondition` doesn't dedupe (duplicates possible if same name added twice). **C4 [EDGE]** `addCondition` does not guard against adding a duplicate condition name (no uniqueness on (character_id, name)). `removeCondition` removes **all** duplicates, so double-adds are individually removable but silently accumulate until then. **Effort:** S.

## lib/character_embed / inventory — cross-file note
- Inventory intentionally removed from sheet; `Special Possessions` retained. Correct per spec.

## lib/dice_images.js (34) — clean. ## lib/pbta_roll_strip.js (77)
- **S2 [PERF]** FIFO cache in `renderPbtaD6Strip` keys on `pbta:<faces>:drop:<idx>` — good value cache (only 6 faces dice; bounded 200). No issue. `loadImage(fs.readFileSync(...))` per render (not cached at the die-image level — only the composed strip is cached); for a 3-face strip it reads 3 PNGs from disk every cache miss. Minor; could pre-load the 6 d6 images once at boot. **Effort:** S.

## commands/inv.js (200) — findings

- **I1 [DEBT] Two live inventory systems.** `/inv check` uses the new freeform note (`inventory_state_pb`), but `/inv list|add|set|remove` still operate on the **legacy per-item backend** (`rhune_inventory_items` via `inventory_pb.js`). Both command sets are exposed and working. With inventory now being a freeform note (per design), the per-item commands are legacy cruft that confuse the model: a player using `/inv add` puts data in a table that `/inv check` never reads, so it silently doesn't show up. Decide: (a) deprecate/remove per-item subcommands, or (b) keep both but clearly label. Recommend removing `list/add/set/remove` (and then `inventory_pb.js` becomes dead alongside SQLite rolllog). **Effort:** M. **Add a confirm test first** that `/inv check` ignores per-item data (documents the split).
- **I2 [DRY]** `resolveCharRecord()` is copy-pasted **identically** in `commands/inv.js` and `commands/outfit.js`. Extract to a shared helper (e.g. `lib/character_embed.js` or a new `lib/char_target.js`). **Effort:** S.
- **I3 [DRY]** In `sub === 'set'` and `sub === 'remove'`, the manual cross-guild ownership check (getInventoryItemById → getCharacterById → verify guild + owner) duplicates what `inventory_pb.getInventoryItemById({ id, guildId })` already does for the guild part. Could pass `guildId` to the helper and only keep the owner check. **Effort:** S.
- **I4 [BUG?]** `/inv add` uses `addInventoryItem` which is fine, but the legacy `sub==='set'` mutates `rhune_inventory_items` — invisible to the new `/inv check` flow. Confirms I1 confusion.
- **I5 [EDGE]** `sub==='check'` hard-caps display at 1900 chars (ephemeral limit is 2000 with header). Reasonable, but `DISCORD_MESSAGE_LIMIT` constant lives in `outfit.js`; the 1900 here is inconsistent (should reference the 2000 const / header math). Minor consistency nit. **Effort:** S.

## commands/outfit.js (97) — findings
- **O1 [TEST]** The reply-to-save flow (setPending, template post, expiry, length guard, save, template-run cleanup) is handled in `index.js` MessageCreate and is **entirely untested**. Highest-value integration test remaining (mock client).
- **O2 [EDGE]** `DISCORD_MESSAGE_LIMIT - header.length - 20` reserve: body slices template to fit. If `use_current` template is `> 2000 - header`, it's truncated silently — data-loss risk for an already-long saved note (re-editing a long note would truncate it on the visible template, though the *saved* text is unchanged until re-saved). Consider warning when truncation occurs. **Effort:** S. Confirm with test of long-current-note truncation.
- O3 [DEBT] `resolveCharRecord` duplication (see I2).

## commands/move.js (46) — findings
- `moves list` builds category rows + a button row with **one button per category** in a single ActionRow. Discord action rows max **5 components**; if there are >5 categories, `.addComponents` will throw at runtime. Check `categoryNames.length`.**M1 [EDGE] cleared (verified): exactly 5 categories** → the single ActionRow holds all 5 buttons, at Discord's 5-component limit, so no crash today. But brittle: adding a 6th category makes `addComponents` throw at runtime (move list + all 3 index.js overview embeds assume the same). Recommend a helper that splits category buttons into rows of ≤5. **Effort:** S.
- **M2 [DEBT]** `moves list` re-implements the category-overview embed that index.js also builds 3× (finding A1). Should share `buildMoveReferenceEmbed()`. **Effort:** S.

## commands/coinflip.js (13) — findings
- **CF1 [DEBT]** Instantiates its **own** `new Chance()` instead of reusing `lib/id.js`'s shared `chance`. Minor duplication; also `chance.coin()` isn't tested. Harmless. **Effort:** S.

## commands/char.js (1011) + lib/create_wizard.js (505) — wizard findings

- **W1 [EDGE] brittle (verified data safe today):** Wizard UI builders assume ≤5 elements per ActionRow, but several are at/ near the limit with current playbook data:
  - `background_picker`: backgrounds = 3 (safe).
  - `instinct_picker`: **instincts = exactly 5** — at Discord's 5-component/row limit. A 6th instinct crashes `addComponents` at runtime (whole wizard blocks).
  - `possessions_picker`: loops options into rows of 5, breaks at 5 rows (25 options). Current max = 8 (safe), but if any playbook ever lists >25 possessions, extras are **silently dropped** (no overflow message); if `pickCount` > 25, the Confirm button can never enable, soft-locking the wizard.
  - `moves_picker`: one ActionRow per OR-group dropdown; current max orGroups = 1 (safe), but >5 would crash.
  - **Recommendation:** extract a `rowOf(components, max=5)` helper and add overflow guards (like moves_picker already does with its '('+N+' more moves' note) for backgrounds/instincts/possessions/orGroups. **Effort:** M. Confirm tests: render each step for the playbook with the most instincts/possessions/orGroups and assert ≤5 components per row.
- **W2 [DEBT] `buildWizardStep()` is a 300-line switch in `commands/char.js`** (lines ~300–600) with 7 render cases; it inflates the command file and is deeply coupled to wizard state. It's exported for reuse but lives inside a command module (odd layering — index.js imports it from the command). Could move to `lib/` (e.g. `lib/wizard_ui.js`) for cleanliness + testability. **Effort:** M.
- **W3 [DRY]** The stat-name map `{ str:'STR', ... }` is re-declared inline (char.js `stats_picker` + `confirm` cases) though `STAT_LABELS` exists in roll.js. Minor. **Effort:** S.
- **W4 [EDGE]** `assignStat` swap path: `state.statPool.indexOf(newVal)` finds the **first** occurrence of a duplicate value — with `STANDARD_STAT_POOL = [2,1,1,0,0,-1]` the two `1`s and two `0`s are ambiguous. It relies on `statPoolKeys` (composite index:value) for the *selection*, but removal uses plain `indexOf(newVal)` on value → can remove the wrong duplicate slot. For identical values this is behaviorally harmless (values equal), but it desyncs `statPoolKeys` from `statPool` if removing a different index than the composite key implied. Verify with a confirm test around duplicate-value swaps/returns (esp. returning a stat to pool then reassigning). **Effort:** S-M.
- **W5 [EDGE]** `backStep` from 'confirm' sets step to 'possessions' and clears `chosenPossessions` — meaning a player who backs out of the final Review loses their possession picks. Minor UX papercut; low priority.
- **W6 [DEBT]** Wizard sessions are in-memory `Map` keyed by userId (loss on restart). Acceptable per design note, but `/char create` while an old session exists silently *resets* it (startWizard overwrites). No "cancel/replace" confirmation. Low priority.
- **W7 [TEST]** `create_wizard.js` pure state-machine functions (startWizard/selectPlaybook/selectBackground/selectInstinct/assignStat/toggleMove/setOrChoice/togglePossession/advanceStep/backStep/getStepInfo) are **completely untested** yet are the most logic-dense, pure (no I/O) code in the repo — ideal candidates for a focused, non-bloating test file. **Effort:** M (high value).

## ✅ RESOLVED — A11 (GM-denied bug)

Fixed on branch `fix/a11-gm-disambiguation` (2026-09-18). Confirm test first (`test/unit/char_ops.test.js`, 5 tests): the A11 test failed on old code (proving the bug) and passes after the fix. Fix:
- `lib/char_ops.js`: `doCharAction` now accepts an explicit `isGM` flag (default null → falls back to legacy `guildOwnerId === userId`). Prefers `isGM` when the caller has already resolved it.
- `index.js` pickchar handler: passes the already-computed `isGM` (from `isGuildOwner()`) into `doCharAction`, keeping `guildOwnerId` as a harmless fallback.
- Full suite: 38 passing (was 33).

## index.js — pickchar disambiguation GM bug (HIGH VALUE)

- **A11 [BUG] (high value) GM denied via disambiguation path.** In the `parsePickCharCustomId` handler, the code correctly computes `isGm = await isGuildOwner(interaction, user.id)` (line 956) and lets a GM through the owner gate. But then it calls `doCharAction({ ... guildOwnerId: interaction.guild?.ownerId ?? null })`. `doCharAction` (char_ops.js) re-derives `isGM = (guildOwnerId === userId)`. In this bot's partial-guild environment, `interaction.guild?.ownerId` is frequently **undefined**, so `guildOwnerId` becomes `null` and `doCharAction` **denies the GM** who should be allowed. The fix: pass the already-computed `isGm` boolean (or resolve `guildOwnerId` via `isGuildOwner`) into `doCharAction`, OR make `doCharAction` accept an `isGM` flag instead of re-deriving from the unreliable `guild.ownerId`. Impact: GM using `/char set|mod|condition` on a character they don't own, when the target name is ambiguous (disambiguation path) → false "You do not own that character." Non-disambiguation paths check `isGm` directly in char.js and work. **Effort:** S. **Confirm test first:** unit-test `doCharAction` with `guildOwnerId=null` + owner≠user → expected allow when GM, actual deny.

## lib/moves_data.js (348)
- **M3 [EDGE] cleared (verified):** max moves in any category = 10 (Basic/Homefront), well under Discord's 25-option select limit. Safe today. `buildMoveNav`/`buildMovePicker` reuse is clean.
- M1 already covered category count (5).

<!-- findings append below -->

