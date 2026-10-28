#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.11"
# dependencies = ["mcp>=1.9,<2", "httpx>=0.27"]
# ///
"""Call the local-llm MCP tools from a shell (same code path as the MCP server).

  cli.py status
  cli.py code   --task-file spec.md --target src/a.ts --target src/a.test.ts [--context docs/DESIGN.md]
  cli.py review --base main [--focus-file spec.md] [--context docs/DESIGN.md]
  cli.py ask    "question" [--context file]
"""
import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import server  # noqa: E402

ap = argparse.ArgumentParser()
ap.add_argument("cmd", choices=["status", "code", "review", "ask"])
ap.add_argument("prompt", nargs="?", default="")
ap.add_argument("--task-file")
ap.add_argument("--focus-file")
ap.add_argument("--target", action="append", default=[])
ap.add_argument("--context", action="append", default=[])
ap.add_argument("--base", default="main")
ap.add_argument("--allow-other-files", action="store_true")
a = ap.parse_args()

if a.cmd == "status":
    print(server.local_status())
elif a.cmd == "code":
    task = Path(a.task_file).read_text() if a.task_file else a.prompt
    print(server.local_code(task, a.target, a.context, a.allow_other_files))
elif a.cmd == "review":
    focus = Path(a.focus_file).read_text() if a.focus_file else a.prompt
    print(server.local_review(a.base, focus, a.context))
else:
    print(server.local_ask(a.prompt, a.context))
