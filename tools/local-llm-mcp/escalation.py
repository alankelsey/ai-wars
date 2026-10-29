"""Pure helpers for handing failed local_iterate runs to Claude Code."""

import json
import os
from typing import Any


ESCALATE = os.environ.get("LOCAL_ESCALATE", "1") != "0"
ESCALATE_MODEL = os.environ.get("LOCAL_ESCALATE_MODEL", "sonnet")
ESCALATE_BUDGET_USD = float(os.environ.get("LOCAL_ESCALATE_BUDGET_USD", "1.0"))
ESCALATE_TIMEOUT_S = float(os.environ.get("LOCAL_ESCALATE_TIMEOUT_S", "900"))


def _escalation_prompt(task: str, target_files: list[str], errors: str) -> str:
    """Return the prompt text for Claude escalation."""
    lines = [
        "A local model could not make these checks pass. Fix the root cause with the smallest change.",
        f"Edit only these files: {', '.join(target_files)}",
        "Do not weaken or delete tests. If a test contradicts the spec, fix the test and say so.",
        f"<spec>\n{task}\n</spec>",
    ]

    # Keep last 8000 chars if errors is longer than that
    if len(errors) > 8000:
        errors = errors[-8000:]
    lines.append(f"<failures>\n{errors}\n</failures>")

    lines.append("Run the failing checks (npm run lint / npm run typecheck / npm test) to confirm. Finish with 1-3 lines: root cause, what you changed.")

    return "\n\n".join(lines)


def _escalation_cmd(prompt: str, target_files: list[str]) -> list[str]:
    """Return the command to invoke claude -p with the escalation prompt."""
    cmd = [
        "claude",
        "-p",
        prompt,
        "--model",
        ESCALATE_MODEL,
        "--output-format",
        "json",
        "--max-budget-usd",
        str(ESCALATE_BUDGET_USD),
        "--permission-mode",
        "default",
        "--allowedTools",
        "Read",
        "Grep",
        "Glob",
        "Bash(npm run *)",
        "Bash(npm test *)",
    ]
    for t in target_files:
        cmd.extend([f"Edit(./{t})"])
    return cmd


def _parse_claude_json(stdout: str) -> dict[str, Any]:
    """Parse claude JSON output into a standard result dict."""
    try:
        obj = json.loads(stdout)
        if not isinstance(obj, dict):
            return {"ok": False, "summary": stdout[:600], "cost_usd": 0.0, "turns": 0}

        ok = not obj.get("is_error", False)
        summary = str(obj.get("result", ""))[:600]
        cost_usd = float(obj.get("total_cost_usd", 0))
        turns = int(obj.get("num_turns", 0))

        return {"ok": ok, "summary": summary, "cost_usd": cost_usd, "turns": turns}
    except (json.JSONDecodeError, ValueError, TypeError):
        return {"ok": False, "summary": stdout[:600], "cost_usd": 0.0, "turns": 0}


def _git_changed() -> set[str]:
    """Return repo-relative paths from git status --porcelain."""
    try:
        proc = subprocess.run(
            ["git", "status", "--porcelain"],
            capture_output=True,
            text=True,
            timeout=30,
        )
    except (subprocess.TimeoutExpired, FileNotFoundError):
        return set()

    if proc.returncode != 0:
        return set()

    changed: set[str] = set()
    for line in proc.stdout.splitlines():
        # Format: "XY path" or "XY old_path -> new_path"
        if not line.strip():
            continue
        parts = line.split(maxsplit=1)
        if len(parts) < 2:
            continue
        status_and_path = parts[1]
        if " -> " in status_and_path:
            # Rename: keep the new path (after ' -> ')
            parts_rename = status_and_path.split(" -> ")
            if len(parts_rename) == 2:
                changed.add(parts_rename[1].strip())
            else:
                changed.add(status_and_path.strip())
        else:
            changed.add(status_and_path.strip())

    return changed


def _outside_changes(before: set[str], after: set[str], target_files: list[str]) -> list[str]:
    """Return sorted paths in after that are neither in before nor in target_files."""
    targets = set(target_files)
    outside = (after - before) - targets
    return sorted(outside)
