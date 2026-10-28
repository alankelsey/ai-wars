#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.11"
# dependencies = ["mcp>=1.9,<2", "httpx>=0.27"]
# ///
"""MCP server that hands coding work to a local Ollama model.

Claude plans and verifies; the local model writes files and reviews diffs.
File contents go straight from the model to disk, so they never pass through
Claude's context. Raw model output is kept in .llm-logs/ for debugging.
"""

from __future__ import annotations

import json
import os
import re
import subprocess
import time
from pathlib import Path

import httpx
from mcp.server.fastmcp import FastMCP

OLLAMA_URL = os.environ.get("OLLAMA_URL", "http://localhost:11434")
MODEL = os.environ.get("LOCAL_MODEL", "qwen3-coder-next:q4_K_M")
NUM_CTX = int(os.environ.get("LOCAL_NUM_CTX", "32768"))
NUM_PREDICT = int(os.environ.get("LOCAL_NUM_PREDICT", "16384"))
TIMEOUT_S = float(os.environ.get("LOCAL_TIMEOUT_S", "1200"))
MAX_CONTEXT_CHARS = int(os.environ.get("LOCAL_MAX_CONTEXT_CHARS", "80000"))


def _repo_root() -> Path:
    env = os.environ.get("REPO_ROOT")
    if env:
        return Path(env).resolve()
    try:
        out = subprocess.run(
            ["git", "rev-parse", "--show-toplevel"], capture_output=True, text=True, check=True
        )
        return Path(out.stdout.strip()).resolve()
    except (subprocess.CalledProcessError, FileNotFoundError):
        return Path.cwd().resolve()


ROOT = _repo_root()
LOG_DIR = ROOT / ".llm-logs"

mcp = FastMCP("local-llm")

CODE_SYSTEM = """You are a senior TypeScript/React engineer working in a Next.js + Vitest repo.
You receive a task, project conventions, and the current contents of relevant files.
Write complete, working, idiomatic code. No placeholders, no TODOs, no elided sections.

OUTPUT FORMAT (strict):
For every file you create or change, output the FULL new file content like this:
<file path="relative/path/from/repo/root.ts">
...entire file content...
</file>
After all files, output one block:
<notes>
Short bullet list: what you did, assumptions, anything the reviewer should check.
</notes>
Output nothing outside <file> and <notes> blocks. Do not wrap file content in markdown fences."""

REVIEW_SYSTEM = """You are a meticulous code reviewer. Review the diff for real defects:
correctness bugs, spec violations, broken edge cases, missing tests for important logic,
type errors, React state bugs, accessibility problems, and needless complexity.
Do not report style nits or praise. Every finding must name a concrete failure scenario.
If there is nothing real, return an empty findings list."""

REVIEW_SCHEMA = {
    "type": "object",
    "properties": {
        "findings": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "file": {"type": "string"},
                    "line": {"type": "integer"},
                    "severity": {"type": "string", "enum": ["high", "medium", "low"]},
                    "category": {"type": "string"},
                    "summary": {"type": "string"},
                    "failure_scenario": {"type": "string"},
                },
                "required": ["file", "line", "severity", "category", "summary", "failure_scenario"],
            },
        }
    },
    "required": ["findings"],
}


def _safe_path(rel: str) -> Path:
    p = (ROOT / rel).resolve()
    if p != ROOT and ROOT not in p.parents:
        raise ValueError(f"path escapes repo: {rel}")
    if ".git" in p.relative_to(ROOT).parts:
        raise ValueError(f"refusing to touch .git: {rel}")
    return p


def _read_files(paths: list[str]) -> str:
    chunks, total = [], 0
    for rel in paths:
        p = _safe_path(rel)
        if not p.exists():
            chunks.append(f'<existing path="{rel}" status="missing"/>')
            continue
        text = p.read_text(errors="replace")
        total += len(text)
        if total > MAX_CONTEXT_CHARS:
            raise ValueError(
                f"context too large (>{MAX_CONTEXT_CHARS} chars) at {rel}; pass fewer files"
            )
        chunks.append(f'<existing path="{rel}">\n{text}\n</existing>')
    return "\n\n".join(chunks)


def _conventions() -> str:
    p = ROOT / "AGENTS.md"
    return p.read_text() if p.exists() else ""


def _chat(system: str, user: str, *, fmt: dict | None = None, temperature: float = 0.3) -> dict:
    body = {
        "model": MODEL,
        "stream": False,
        "messages": [{"role": "system", "content": system}, {"role": "user", "content": user}],
        "options": {
            "num_ctx": NUM_CTX,
            "num_predict": NUM_PREDICT,
            "temperature": temperature,
            "top_p": 0.8,
        },
        "keep_alive": "30m",
    }
    if fmt is not None:
        body["format"] = fmt
    t0 = time.time()
    r = httpx.post(f"{OLLAMA_URL}/api/chat", json=body, timeout=TIMEOUT_S)
    r.raise_for_status()
    data = r.json()
    data["_wall_s"] = round(time.time() - t0, 1)
    return data


def _log(kind: str, prompt: str, data: dict) -> str:
    LOG_DIR.mkdir(exist_ok=True)
    name = f"{time.strftime('%Y%m%d-%H%M%S')}-{kind}.md"
    content = data.get("message", {}).get("content", "")
    (LOG_DIR / name).write_text(f"# {kind}\n\n## prompt\n\n{prompt}\n\n## response\n\n{content}\n")
    return f".llm-logs/{name}"


def _stats(data: dict) -> str:
    out_tok = data.get("eval_count", 0)
    in_tok = data.get("prompt_eval_count", 0)
    eval_s = data.get("eval_duration", 0) / 1e9 or 1
    truncated = " TRUNCATED (hit num_predict)" if data.get("done_reason") == "length" else ""
    return (
        f"model={MODEL} wall={data['_wall_s']}s in={in_tok}tok out={out_tok}tok "
        f"({out_tok / eval_s:.1f} tok/s){truncated}"
    )


FILE_RE = re.compile(r'<file path="([^"]+)">\n?(.*?)\n?</file>', re.S)
NOTES_RE = re.compile(r"<notes>(.*?)</notes>", re.S)
FENCE_RE = re.compile(r"^```[\w-]*\n(.*?)\n```$", re.S)


@mcp.tool()
def local_code(
    task: str,
    target_files: list[str],
    context_files: list[str] | None = None,
    allow_other_files: bool = False,
) -> str:
    """Have the local LLM write or rewrite files in the repo.

    task: precise spec with acceptance criteria.
    target_files: repo-relative paths the model may create/overwrite (current contents are sent).
    context_files: extra repo-relative files to show read-only (types, specs, neighbours).
    allow_other_files: if False, files outside target_files are skipped and reported.
    Returns a summary (files written, line counts, model notes, log path) — not the code.
    """
    context_files = context_files or []
    prompt = "\n\n".join(
        s
        for s in [
            f"<conventions>\n{_conventions()}\n</conventions>" if _conventions() else "",
            f"<task>\n{task}\n</task>",
            "Files you may write: " + ", ".join(target_files),
            "<read_only_context>\n" + _read_files(context_files) + "\n</read_only_context>"
            if context_files
            else "",
            "<current_target_files>\n" + _read_files(target_files) + "\n</current_target_files>",
        ]
        if s
    )
    data = _chat(CODE_SYSTEM, prompt)
    log = _log("code", prompt, data)
    content = data.get("message", {}).get("content", "")

    written, skipped = [], []
    allowed = {str(_safe_path(t)) for t in target_files}
    for rel, body in FILE_RE.findall(content):
        m = FENCE_RE.match(body.strip())
        if m:
            body = m.group(1)
        try:
            p = _safe_path(rel)
        except ValueError as e:
            skipped.append(f"{rel} ({e})")
            continue
        if str(p) not in allowed and not allow_other_files:
            skipped.append(f"{rel} (not in target_files)")
            continue
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(body.rstrip("\n") + "\n")
        written.append(f"{rel} ({body.count(chr(10)) + 1} lines)")

    notes = NOTES_RE.search(content)
    missing = [t for t in target_files if not any(w.startswith(t + " ") for w in written)]
    lines = [
        _stats(data),
        "written: " + (", ".join(written) or "NONE"),
    ]
    if missing:
        lines.append("not written: " + ", ".join(missing))
    if skipped:
        lines.append("skipped: " + "; ".join(skipped))
    if not written:
        lines.append("raw output head: " + content[:600])
    lines.append("notes: " + (notes.group(1).strip() if notes else "(none)"))
    lines.append(f"log: {log}")
    return "\n".join(lines)


@mcp.tool()
def local_review(base: str = "main", focus: str = "", context_files: list[str] | None = None) -> str:
    """Have the local LLM review the diff between `base` and the working tree.

    focus: what to check hardest (e.g. the PR spec / acceptance criteria).
    context_files: specs or unchanged files the reviewer needs to judge correctness.
    Returns JSON {"findings": [...]} — Claude must verify each finding before acting.
    """
    diff = subprocess.run(
        ["git", "diff", base, "--", ".", ":(exclude)package-lock.json"],
        cwd=ROOT, capture_output=True, text=True,
    ).stdout
    untracked = subprocess.run(
        ["git", "ls-files", "--others", "--exclude-standard"], cwd=ROOT, capture_output=True, text=True
    ).stdout.split()
    if not diff.strip() and not untracked:
        return json.dumps({"findings": [], "note": f"no diff vs {base}"})
    if len(diff) > MAX_CONTEXT_CHARS:
        return f"diff too large ({len(diff)} chars); review per directory or raise LOCAL_MAX_CONTEXT_CHARS"
    prompt = "\n\n".join(
        s
        for s in [
            f"<conventions>\n{_conventions()}\n</conventions>" if _conventions() else "",
            f"<focus>\n{focus}\n</focus>" if focus else "",
            "<context>\n" + _read_files(context_files) + "\n</context>" if context_files else "",
            "<new_untracked_files>\n" + _read_files(untracked) + "\n</new_untracked_files>"
            if untracked
            else "",
            f"<diff base=\"{base}\">\n{diff}\n</diff>",
        ]
        if s
    )
    data = _chat(REVIEW_SYSTEM, prompt, fmt=REVIEW_SCHEMA, temperature=0.1)
    log = _log("review", prompt, data)
    content = data.get("message", {}).get("content", "")
    return f"{_stats(data)}\nlog: {log}\n{content}"


@mcp.tool()
def local_ask(prompt: str, context_files: list[str] | None = None) -> str:
    """Ask the local LLM a free-form question, optionally with repo files as context."""
    ctx = _read_files(context_files) if context_files else ""
    user = f"{ctx}\n\n{prompt}" if ctx else prompt
    data = _chat("You are a concise, expert software engineer.", user, temperature=0.5)
    _log("ask", user, data)
    return f"{_stats(data)}\n\n{data.get('message', {}).get('content', '')}"


@mcp.tool()
def local_status() -> str:
    """Show loaded Ollama models and per-GPU VRAM use."""
    try:
        ps = httpx.get(f"{OLLAMA_URL}/api/ps", timeout=5).json()
        models = [
            f"{m['name']} size={m['size'] / 1e9:.1f}GB vram={m.get('size_vram', 0) / 1e9:.1f}GB "
            f"ctx={m.get('context_length', '?')}"
            for m in ps.get("models", [])
        ] or ["(no models loaded)"]
    except httpx.HTTPError as e:
        models = [f"ollama unreachable at {OLLAMA_URL}: {e}"]
    try:
        vram = subprocess.run(
            ["rocm-smi", "--showmeminfo", "vram"], capture_output=True, text=True, timeout=10
        ).stdout
        vram = "\n".join(l for l in vram.splitlines() if "Used" in l)
    except (FileNotFoundError, subprocess.TimeoutExpired):
        vram = "(rocm-smi unavailable)"
    return f"configured model: {MODEL} num_ctx={NUM_CTX}\n" + "\n".join(models) + "\n" + vram


if __name__ == "__main__":
    mcp.run()
