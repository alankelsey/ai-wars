# Local LLM tooling — what's still needed

Status as of 2026-10-28 (after PRs 5–14). The setup: Claude writes specs and contract tests, the local model
(`qwen3-coder-next`, 128k ctx, spread over 2 AMD cards) writes code through the `local-llm` MCP server
(`tools/local-llm-mcp/server.py`): `local_code`, `local_iterate`, `local_review`, `local_ask`, `local_status`.

**This session's numbers:** 12 `local_iterate` loops, 5 ended green by themselves. ~47k output tokens, ~28 min of GPU time.
Of the 7 that didn't, most failures were in *tests* (Claude's or the model's own), not in the implementation.
The items below target those failure modes first.

## What already works
- Whole-file or search/replace edits, `<need>` requests for more files, auto context from imports.
- `local_iterate` fix loop with STUCK detection (same failure set two rounds in a row).
- `local_review` with evidence check + second-pass verifier (false positives get rejected reliably).
- `AGENTS.md` is sent with every call, including the "Local model pitfalls" section.
- Per-call metrics in `.llm-logs/metrics.jsonl`; full prompts/responses in `.llm-logs/*.md`.

## Done since (PR 17)
- 256k context by default (`.mcp.json` no longer pins 128k); `keep_alive` is 60m everywhere.
- Runtime model switch: `scripts/dev.sh model <name> [ctx]` writes `.dev/local-llm.json`, read on every call.
- Automatic hand-off: when `local_iterate` ends STUCK / STILL FAILING it runs `claude -p` once on the remaining
  failures (Sonnet, `LOCAL_ESCALATE_BUDGET_USD` cap, edits limited to `target_files`), re-checks, and logs an
  `escalate` metric row with cost. `LOCAL_ESCALATE=0` turns it off. Tests: `npm run test:tools`.

## Done since (PR 24)
- **Parser fix (was #0):** a closing `</file>` / `</edit>` only counts at line start and when followed by the next
  block or the end of the reply (`guards.py`), so files that contain the tags no longer get cut short. The bug hit
  again while building this: the first write of `guards.py` stopped at its own regex.
- **Shrink guard:** a whole-file write that would leave an existing 20+ line file under half its size is refused
  (`REFUSED:` in the report) and the model is told to use edits.
- **Edits must apply (was #2):** a round fails when an edit's search text didn't match or a write was refused, even if
  the checks are green.
- **Anchors (part of #0b):** `local_iterate(anchors=["path: exact existing line", ...])` fails the round while any named
  spot is unchanged (diff within 3 lines). Specs list their anchors; see the template in the ship-pr skill.
  Not done yet: splitting a multi-edit task into one call per anchor automatically.
- **Code map (most of #5):** every call sends `<codemap>`: one line per `src/` file with its header comment and
  exports, generated live by `codemap.py` (never stale). `npm run codemap` prints it; CI runs `codemap:check`, which
  fails when a source file has no one-line header comment. Not done yet: rejecting unresolved imports before checks.
- **Leaner conventions:** the model gets AGENTS.md without the Workflow section, the spec pointer and the Next.js
  block (it can't read `node_modules` docs), and none of it for Python-only tasks.

## Model comparison (2026-10-29)
Same task (multi-edit `server.py`, pre-PR-17 file, 16 pytest contract tests, 4 fix rounds, no hand-off):

| model | speed | where it runs | result | wall time |
|---|---|---|---|---|
| qwen3-coder-next q4_K_M (80B, 3B active) | 66 tok/s | 100% GPU, 60 GB @ 256k | STILL FAILING, 10/16 pass; 1 edit applied per round | 185 s |
| qwen3.5:122b-a10b (122B, 10B active) | 26 tok/s | 87 GB, 29% CPU / 71% GPU @ 256k | STILL FAILING, file left broken; round 0 applied 10 of 11 edits, then whole-file rewrites hit parser bug 0 and truncated it | 1255 s |

Takeaway: the 122B model plans multi-site edits much better but is ~2.5× slower per token and writes ~3× more tokens,
so ~7× slower per task. Re-run after fixing parser bug 0; until then keep coder-next as default
(`scripts/dev.sh model qwen3.5:122b-a10b` to try it).

## Needed — high priority

### 0. Parser: files that contain the output tags
**Problem:** a whole-file rewrite of `server.py` got cut off, because its CODE_SYSTEM prompt contains a literal
`</file>`; the non-greedy regex ends the block there. **Build:** match `</file>` only at line start followed by a
next `<file`/`<edit`/`<notes>` block or end of output, or refuse whole-file writes for such files and ask for edits.

### 0b. Multi-site edits on big files
**Problem:** on the 650-line `server.py` the model applied 1 of 4–7 requested edits per round, duplicated a
function, and put code above the names it used. **Build:** split a multi-edit task into one call per edit site
automatically, or verify after each round that every requested anchor was edited.


### 0c. Verification tooling
**Problem:** checking that a rule really works in play (e.g. "do missing pallets actually leave the inventory?") and
whether the game is too easy is done by hand with throwaway scripts. A model edit that silently did not apply still
reported PASSED (PR 18), because the checks were already green before the change.
**Build:**
- `npm run sim -- --games 1000 --difficulty hard`: seeded bot players (greedy buy-low/sell-high, random, hoarder) play
  full games through the real engine. Report win rate, net-worth percentiles, event/risk counts per game, and
  invariant violations (inventory never negative, losses match messages, data center untouched by events).
  Use it to verify rule changes and to tune difficulty with numbers instead of feel.
- `local_iterate`: fail the round when a requested edit did not apply or a target file is unchanged (see #2),
  and support an "expect red first" check for the new test, so an unchanged file can't pass.
- Live smoke check after each Pages deploy: load https://alankelsey.github.io/ai-wars/, start a game, buy, travel,
  and fail on console errors.

### 1. Scoped typecheck
**Problem:** `npm run typecheck` checks the whole project, so it fails whenever *other* files are mid-change.
Twice I had to drop typecheck from `checks`, and type errors (widened literals, a missing import) only surfaced at the end.
**Build:** a `typecheck` mode that runs `tsc --noEmit` and keeps only errors in `target_files` (+ their tests).
Report the other errors as "outside scope" without failing the round.

### 2. "All target files written" check
**Problem:** one call (StatsPanel + MarketList + TipBanners) wrote 1 of 3 files and still returned PASSED,
because lint passed on what existed.
**Build:** fail the round if any target file is missing or unchanged when the task says to create it, and tell the
model which files it skipped.

### 3. Test-vs-implementation guard
**Problem:** when the model writes both code and tests, it treats its own wrong test as truth and bends correct
code to match (highscores, datacenter, QtyPicker: wrong expectations, un-awaited `userEvent`, double `render`).
**Build:**
- A two-phase mode: phase 1 writes tests only, and Claude approves them; phase 2 locks those tests (read-only) and implements.
- Or a quick heuristic: if a round changes the implementation while the failing assertion's *expected* value
  came from the model's own test, ask it to justify the expected value first.
- Lint rule `testing-library/await-async-events` and `no-render-in-loop`-style checks for test files.

### 4. Clean failure output
**Problem:** test failures arrive with ANSI colour codes and full DOM dumps, so 60 lines of noise hide the one
useful assertion (QtyPicker rounds).
**Build:** strip ANSI codes; collapse Testing Library DOM dumps to the first ~10 lines; always include each
failing test's name + first `AssertionError`/`Error:` line + the code frame.

### 5. Module map in context
**Problem:** the model guessed import paths (`../game`, `@/game`) for 4 rounds. Listing exact import lines in
every task fixed it, but that's manual.
**Build:** auto-generate a compact map (`path → exported names`) for `src/` and send it with every call; reject
writes whose imports don't resolve *before* running checks (fast feedback, no wasted test run).

### 6. Fast path for small changes
**Why now:** the user wants *every* change to go through the local model, including 1–20 line fixes.
**Build:** `local_edit(task, file, checks)`: a single file, search/replace only, one check round, tight prompt
(no full spec boilerplate). Fall back to `local_iterate` on failure.

## Needed — medium priority

### 7. Lint auto-fix before feedback
Run `eslint --fix` on target files before the check round. Unescaped `'` in JSX and unused imports cost full
model rounds.

### 8. Long runs and progress
`local_iterate` often exceeds the MCP tool's 120s window and moves to the background with no progress until it ends.
**Build:** per-round progress notifications (round N, pass/fail counts), and a `local_cancel`.

### 9. Metrics summary and "who fixed it"
**Build:** `cli.py metrics` → per task: rounds, final status, tokens, wall time, plus whether Claude had to hand-fix
(diff between the model's last write and the committed file). Feed that into PR bodies automatically.
Today this is ad-hoc Python.

### 10. Pitfall capture
**Build:** when Claude hand-fixes model output, record a one-line category (import path, literal widening, test
async, …). `cli.py pitfalls` suggests new `AGENTS.md` lines when a category repeats. (Those lines must stay above
the `<!-- BEGIN:nextjs-agent-rules -->` block; `next dev` rewrites everything inside it.)

### 11. Dev-environment commands
- `dev.sh web-restart`: restart only `next dev` (today that needs hand-sourcing `web_up`/`web_down`).
- `dev.sh up` needs a TTY for `sudo`. Add a narrow NOPASSWD sudoers rule (or a polkit rule) for the drop-in
  install + `systemctl restart ollama`, so it can run from Claude Code.
- `keep_alive` is 30m in the server but 60m in `dev.sh preload`. Pick one, and have `local_status` warn
  when the model has unloaded (the first call after that is slow).

## Nice to have
- **Visual check:** the model can't see screenshots, so UI verification is all Claude. A local vision model
  (e.g. a Qwen-VL build) could do a first pass on `.dev/*.png` against the spec.
- **Request queue:** calls are serialized on the GPUs; queue them and report position, instead of blocking.
- **Review metrics:** record dropped/rejected/confirmed counts per review to track the reviewer's precision over time.
- **Replay harness:** re-run a logged task (`.llm-logs/*.md`) against a new model or prompt and compare
  rounds and pass rates, to judge model upgrades with data.
