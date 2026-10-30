#!/usr/bin/env bash
# AI WARS dev environment (model control comes from local-llm-kit's `llm` command).
#   dev.sh up         `llm up` (spread Ollama, preload the coding model), then start next dev
#   dev.sh status     `llm status`, then web server state
#   dev.sh down       stop next dev, then `llm down` (GPUs idle)
#   dev.sh restore    stop next dev, then `llm restore` (per-card mode via gpu-services)
#   dev.sh model M [ctx]  same as `llm model M [ctx]`
set -euo pipefail
cd "$(dirname "$0")/.."
ROOT=$PWD
RUN=$ROOT/.dev; mkdir -p "$RUN"

command -v llm >/dev/null || { echo "llm not found: install local-llm-kit (see its README)"; exit 1; }

web_up() {
  [[ -f package.json ]] || { echo "no package.json yet; skipping next dev"; return; }
  if [[ -f $RUN/next.pid ]] && kill -0 "$(cat "$RUN/next.pid")" 2>/dev/null; then
    echo "next dev already running"; return
  fi
  [[ -d node_modules ]] || npm install
  # own process group (setsid) so web_down can stop npm, next dev and next-server together
  DEV_ORIGINS=$(hostname -I | xargs | tr " " ",") setsid nohup npm run dev -- -H 0.0.0.0 >"$RUN/next.log" 2>&1 &
  echo $! >"$RUN/next.pid"
  echo "next dev: http://$(hostname -I | awk '{print $1}'):3000  (log: .dev/next.log)"
}

web_down() {
  if [[ -f $RUN/next.pid ]]; then
    kill -- "-$(cat "$RUN/next.pid")" 2>/dev/null || true
    rm -f "$RUN/next.pid"; echo "next dev stopped"
  fi
}

case ${1:-status} in
  up)      llm up; web_up ;;
  down)    web_down; llm down ;;
  restore) web_down; llm restore ;;
  status)
    llm status
    [[ -f $RUN/next.pid ]] && kill -0 "$(cat "$RUN/next.pid")" 2>/dev/null && echo "next dev: running" || echo "next dev: stopped" ;;
  model)   shift; llm model "$@" ;;
  *)       sed -n '2,7p' "$0"; exit 1 ;;
esac
