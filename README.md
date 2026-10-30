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

Code and tests are written by a local LLM (qwen3.8:27b, with qwen3.5:122b-a10b as fallback, on two Radeon R9700s)
through the [local-llm-kit](https://github.com/alankelsey/local-llm-kit) Claude Code plugin. Claude plans each PR
and writes the contract tests, the local model writes the code and reviews it, and Claude verifies and ships.

```bash
scripts/dev.sh up       # `llm up` (spread Ollama over both GPUs, load the model), then start next dev
scripts/dev.sh status
scripts/dev.sh down     # stop next dev, `llm down`
```

Start Claude Code here: `.claude/settings.json` offers the kit plugin (MCP server + `ship-pr` skill), and
`.claude/local-llm.json` holds this project's settings. `.mcp.json` adds the playwright MCP for screenshots
(`scripts/screenshot.sh` does the same from a shell). Raw model output and metrics go to `.llm-logs/` (gitignored).
