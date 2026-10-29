# AI WARS!

A browser trading game: buy and sell AI chips across world cities, pay back your $5,500 loan in 30 days,
and turn a profit before the IPO. Spec: [docs/DESIGN.md](docs/DESIGN.md).

## Play locally

```bash
npm install
npm run dev        # http://localhost:3000
npm test
```

## How this repo is built

Code and tests are written by a local LLM (qwen3-coder-next split across two Radeon R9700s) through the
`local-llm` MCP server in `tools/local-llm-mcp/`. Claude plans each PR, the local model writes it and
reviews it, and Claude verifies the review findings and the test results.

```bash
scripts/dev.sh up       # spread Ollama over both GPUs, load the model, start next dev
scripts/dev.sh status
scripts/dev.sh down     # stop next dev, unload the model
scripts/dev.sh restore  # back to per-card mode (gpu-services)
tools/local-llm-mcp/cli.py status   # same tools as the MCP server, from a shell
```

Start Claude Code from this directory to pick up `.mcp.json` and the `/ship-pr` skill.

| Tool | What it does |
|---|---|
| `local_code` | Model writes whole files or search/replace edits; target files' imports are added as context automatically |
| `local_iterate` | Write → lint/typecheck/test → feed failures back, with history; stops early when stuck |
| `local_review` | Diff review → evidence check → second-pass verifier; only confirmed findings return |
| `local_ask`, `local_status` | Free-form question; loaded model + per-card VRAM |
| `playwright` MCP / `scripts/screenshot.sh` | Headless screenshots of the dev server via system Chrome |

Context window: 128k by default (`LOCAL_NUM_CTX`; 56 GB across both cards; 262144 also fits at 60 GB).
Raw model output goes to `.llm-logs/`, one JSON line per call in `.llm-logs/metrics.jsonl` (both gitignored).
