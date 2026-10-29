# AI WARS — conventions for code agents

Game spec: docs/Market_mock.md. Design decisions: docs/DESIGN.md (takes precedence over the mock where they differ).

## Stack
- Next.js (App Router, static export), React, TypeScript `strict`. No other UI or state libraries unless asked.
- Tests: Vitest + jsdom + @testing-library/react. Test files sit next to the code as `*.test.ts(x)`.
- npm scripts: `dev`, `build`, `test` (vitest run), `typecheck` (tsc --noEmit), `lint`.

## Layout
- `src/game/` — pure game logic. No React, no DOM, no `Math.random`, no `Date`. All randomness through the
  seeded RNG passed in. Functions take state and return new state (never mutate inputs). This module will be
  reused later inside a bigger sim, so keep it free of UI concerns.
- `src/game/data/` — chips, cities, companies, events as typed constants. Balancing lives here, not in logic.
- `src/app/` and `src/components/` — UI only. Components read state and dispatch actions; no game rules here.

## Workflow
- Claude writes specs and the contract tests for tricky logic; the local model implements until they pass.
  See .claude/skills/ship-pr/SKILL.md.

## Style
- Small named functions, explicit types on exports, no `any`, no default exports except Next.js pages/layouts.
- Every file in `src/` starts with a one-line `//` comment saying what it does (after `"use client";` if present).
  It feeds the code map the local model sees; CI checks it (`npm run codemap:check`). Update it when the file's job changes.
- Money is integer dollars. Round with `Math.ceil` where the spec says "round up", otherwise `Math.round`.
- Console look: black background, green monospace text. Keep CSS in CSS modules or `globals.css`.
- Every logic function gets unit tests that cover edge cases (zero money, zero stock, last turn).
- Tests: build fixtures in one step (`const base = makeState(); const state = { ...base, market: {...} }`),
  never reference a variable inside its own initializer. No `any` in tests either; type fakes against the
  real interfaces. Import every symbol you use (CONFIG, types) explicitly.
- `as const` arrays are readonly: type them `readonly EventKind[]` instead of casting.

## Local model pitfalls (seen in past PRs; check your output against these)
- Imports: use only paths that exist. Engine modules are `@/game/game`, `@/game/market`, `@/game/types`,
  `@/game/data/...`; there is no `@/game` or `../game` barrel. If a task lists import lines, copy them exactly.
- A failing test may be wrong. If the implementation matches the spec and the test does not, say so in your notes
  and fix the test (when it is yours to edit); never bend working code to match a bad expectation.
- `as const` only goes on literals (`[...] as const`, `{...} as const`), never on a `.map(...)` or other call.
- `CONFIG` values are literal types: `let debt = CONFIG.startDebt` is typed `5500`. Annotate: `let debt: number`.
- React lint: no `setState` inside `useEffect`, no reading/writing `ref.current` during render. Do side effects in
  the event handler that causes them.
- Text that tests match as one string (headers, summary lines) must be one template literal, not `{a} text {b}`.
- Don't put a literal `$` before `formatMoney(...)`; it already adds one.
- Test fixtures must use real data: companies from `COMPANIES`, chips/cities from `src/game/data`.
- ASCII art and other "creative" strings: check that they actually say what the spec asks for.
- Literal unions widen inside object literals: `{ ...risk, outcome: "down" }` assigned to a `const` becomes `string`.
  Type the variable (`const next: GameState = ...`) or build it through a typed helper.
- Test fixtures: no-op checks compare against the exact object passed in (`const input = {...}; expect(f(input)).toBe(input)`),
  not against the base the input was spread from.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
