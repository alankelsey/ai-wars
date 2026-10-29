---
name: ship-pr
description: Ship one AI WARS PR with the local LLM doing the coding - spec, test-first split, local_iterate fix loop, verified local review, PR, CI, squash-merge. Use for any feature or fix PR in this repo.
---

# Ship a PR (Claude orchestrates, local LLM codes)

Claude's job is specs, tests-as-contract, verification and merging. The local model (`local-llm` MCP:
`local_code`, `local_iterate`, `local_review`, `local_ask`, `local_status`) writes implementation code.
Shell fallback with the same tools: `tools/local-llm-mcp/cli.py {code|iterate|fix|review|ask|status}`.

## 0. Environment
- `local_status`: model loaded with both cards in use? If not, ask the user to run `scripts/dev.sh up` (sudo).
  Switch models with `scripts/dev.sh model <name> [ctx]` (writes `.dev/local-llm.json`; no MCP restart needed).
- `git checkout main && git pull --ff-only && git checkout -b prN-<slug>`.

## 1. Spec (in `.tasks/prN.md`, gitignored)
- Exact exported signatures and types, data shapes, edge cases, and the rules from docs/DESIGN.md that apply.
- Name every file the model may write. Keep each call to <= 3 files / ~5k output tokens; split bigger work.
- List the exact import lines for each target file in the task; the model guesses module paths badly.
- Compute any expected numbers with the real formula (floating point!) or have tests compute them.

## 2. Test-first split
- **Claude writes the contract tests** when they need bookkeeping (fake RNG queues, exact money maths,
  multi-step state). The local model is weak at that and strong at implementation.
- Simple, table-style tests can be delegated: put them in the same task as the implementation.
- Give the model fixtures/helpers to use instead of describing them in prose.

## 3. Implement
- `local_iterate(task, target_files, context_files, max_rounds=4)`. Keep `typecheck` in `checks` even when other files are
  mid-change (filter tests instead); dropping it hides type errors until the end. Imports of target files are added to
  context automatically; still pass specs (docs/DESIGN.md) and sibling modules it should mirror.
- When the model also wrote the tests, check failing expectations before letting it "fix" code: it tends to bend
  correct implementations to match its own wrong tests.
- When STUCK / STILL FAILING, `local_iterate` hands off to Claude Code automatically (`claude -p`, Sonnet,
  $1 cap, edits limited to `target_files`) and re-checks. The result says `PASSED (escalated to Claude)` or
  `STILL FAILING after escalation to Claude`, plus the cost and a summary. Pass `escalate=False` for tasks where
  failures are expected (partial steps) or when a hand-off makes no sense (env problems).
- Still failing after the hand-off → read the remaining errors yourself and find the root cause. Sharpen the
  spec and re-run (most common fixes: a missing helper, a wrong expectation, an unclear rule), or make a
  few-line fix. Never weaken tests to get green.
- Large existing files: give the model one explicitly placed edit per step ("replace exactly these lines",
  "insert after line X"). It handles new files well but drops or misplaces edits spread across a big file.

## 4. Verify (Claude)
- Read the implementation diff against the spec (not every test line). Check: spec rules, rounding,
  immutability, determinism (no Math.random/Date in src/game), UI has no game rules.
- `npm run lint && npm run typecheck && npm test && npm run build`.
- UI PRs: `scripts/dev.sh status` (next dev running?), then screenshot with the playwright MCP or
  `scripts/screenshot.sh / .dev/shot.png 1280,800` and `... 390,844` for mobile; look at both.

## 5. Review
- `git add -A`, then `local_review(base="main", focus=<spec>, context_files=["docs/DESIGN.md"])`.
- Only confirmed findings come back (evidence check + second-pass verifier). Still verify each one yourself;
  route real ones to `local_iterate` as a fix task.

## 6. Ship
- Commit (attribution lines per system reminder), push, `gh pr create` with: what, how it was built
  (rounds, what the model got wrong, what Claude fixed), verification checklist.
- `gh pr checks <n> --watch`; on red, read `gh run view --log-failed`, fix via the loop, push.
- Green → `gh pr merge <n> --squash --delete-branch`, `git checkout main && git pull --ff-only`.
- Note offload numbers from `.llm-logs/metrics.jsonl` in the PR body when interesting.

## 6b. After merging
- New recurring model mistake? Add one line to "Local model pitfalls" in AGENTS.md (it is sent with every call).

## 7. When done for the day
`scripts/dev.sh down` (stops next dev, unloads the model; GPUs idle).
