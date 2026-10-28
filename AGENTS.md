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

## Style
- Small named functions, explicit types on exports, no `any`, no default exports except Next.js pages/layouts.
- Money is integer dollars. Round with `Math.ceil` where the spec says "round up", otherwise `Math.round`.
- Console look: black background, green monospace text. Keep CSS in CSS modules or `globals.css`.
- Every logic function gets unit tests that cover edge cases (zero money, zero stock, last turn).
