#!/usr/bin/env bash
# AI WARS dev environment.
#   dev.sh up         spread Ollama over both cards, preload the coding model, start next dev
#   dev.sh status     model / VRAM / web server state
#   dev.sh down       stop next dev, unload the model (GPUs idle, Ollama stays in spread mode)
#   dev.sh restore    back to per-card mode (card0 Ollama, card1 Ollama + ComfyUI) via gpu-services
set -euo pipefail
cd "$(dirname "$0")/.."
ROOT=$PWD
MODEL=${LOCAL_MODEL:-qwen3-coder-next:q4_K_M}
NUM_CTX=${LOCAL_NUM_CTX:-131072}   # 128k = 56 GB over both cards; 262144 fits too (60 GB)
OLLAMA=${OLLAMA_URL:-http://localhost:11434}
GPU_SERVICES=${GPU_SERVICES:-$HOME/projects/gpu-services}
DROPDIR=/etc/systemd/system/ollama.service.d
RUN=$ROOT/.dev; mkdir -p "$RUN"

vram() {  # rocm-smi isn't installed; read amdgpu sysfs, skipping the iGPU
  for d in /sys/class/drm/card[0-9]*/device; do
    [[ -r $d/mem_info_vram_total ]] || continue
    awk -v n="${d%/device}" -v u="$(cat "$d/mem_info_vram_used")" '$1 > 8e9 {printf "%s: %.1f / %.1f GB\n", n, u/1e9, $1/1e9}' "$d/mem_info_vram_total"
  done
}

spread_mode() {
  if [[ ! -f $DROPDIR/card0.conf ]] && cmp -s "$ROOT/scripts/ollama-spread.conf" "$DROPDIR/spread.conf"; then
    echo "ollama already in spread mode"; return
  fi
  echo "switching ollama to spread mode (sudo)..."
  systemctl --user stop ollama-card1 comfyui 2>/dev/null || true
  sudo install -D -m 644 "$ROOT/scripts/ollama-spread.conf" "$DROPDIR/spread.conf"
  sudo rm -f "$DROPDIR/card0.conf"
  sudo systemctl daemon-reload && sudo systemctl restart ollama
  for _ in $(seq 30); do curl -sf "$OLLAMA/api/version" >/dev/null && break; sleep 1; done
}

preload() {
  echo "loading $MODEL (first load takes ~30-60s)..."
  curl -sf "$OLLAMA/api/generate" -d "{\"model\":\"$MODEL\",\"prompt\":\"\",\"keep_alive\":\"60m\",\"options\":{\"num_ctx\":$NUM_CTX}}" >/dev/null
  ollama ps
  vram
}

web_up() {
  [[ -f package.json ]] || { echo "no package.json yet; skipping next dev"; return; }
  if [[ -f $RUN/next.pid ]] && kill -0 "$(cat "$RUN/next.pid")" 2>/dev/null; then
    echo "next dev already running"; return
  fi
  [[ -d node_modules ]] || npm install
  nohup npm run dev -- -H 0.0.0.0 >"$RUN/next.log" 2>&1 & echo $! >"$RUN/next.pid"
  echo "next dev: http://$(hostname -I | awk '{print $1}'):3000  (log: .dev/next.log)"
}

web_down() {
  if [[ -f $RUN/next.pid ]]; then
    pkill -P "$(cat "$RUN/next.pid")" 2>/dev/null || true
    kill "$(cat "$RUN/next.pid")" 2>/dev/null || true
    rm -f "$RUN/next.pid"; echo "next dev stopped"
  fi
}

case ${1:-status} in
  up)      spread_mode; preload; web_up ;;
  down)    web_down; ollama stop "$MODEL" 2>/dev/null || true; echo "model unloaded"; vram ;;
  restore) web_down; sudo rm -f "$DROPDIR/spread.conf"; "$GPU_SERVICES/install.sh" ;;
  status)
    [[ -f $DROPDIR/card0.conf ]] && echo "ollama: per-card mode (card 0 only)" || echo "ollama: spread mode"
    ollama ps; vram
    [[ -f $RUN/next.pid ]] && kill -0 "$(cat "$RUN/next.pid")" 2>/dev/null && echo "next dev: running" || echo "next dev: stopped" ;;
  *) sed -n '2,7p' "$0"; exit 1 ;;
esac
