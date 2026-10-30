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

from codemap import build_codemap
from guards import EDIT_RE, FILE_RE, malformed_blocks, round_problems, shrink_refusal, stray_tags, trim_conventions, untouched_anchors
from escalation import (
    ESCALATE,
    ESCALATE_BUDGET_USD,
    ESCALATE_MODEL,
    ESCALATE_TIMEOUT_S,
    _escalation_cmd,
    _escalation_prompt,
    _outside_changes,
    _parse_claude_json,
)


OLLAMA_URL = os.environ.get("OLLAMA_URL", "http://localhost:11434")
# 256k context: ~29 GB for qwen3.8:27b, all on GPU (benchmark in docs/LOCAL_LLM_TOOLING.md).
DEFAULT_MODEL = "qwen3.8:27b"
DEFAULT_NUM_CTX = 262144
DEFAULT_FALLBACK_MODEL = "qwen3.5:122b-a10b"
FALLBACK_ROUNDS = 3
NUM_PREDICT = int(os.environ.get("LOCAL_NUM_PREDICT", "16384"))
TIMEOUT_S = float(os.environ.get("LOCAL_TIMEOUT_S", "1200"))
# ~4 chars/token: 600k chars of context files is ~150k tokens, leaving room for output in a 256k window.
MAX_CONTEXT_CHARS = int(os.environ.get("LOCAL_MAX_CONTEXT_CHARS", "600000"))
MAX_NEED_ROUNDS = 2


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
SETTINGS_FILE = ROOT / ".dev" / "local-llm.json"


def _settings(path: Path | None = None) -> dict:
    """{"model", "num_ctx", "fallback_model"}: SETTINGS_FILE (or `path`), then env LOCAL_MODEL/LOCAL_NUM_CTX/LOCAL_FALLBACK_MODEL, then defaults ("" = no fallback)."""
    model = os.environ.get("LOCAL_MODEL", DEFAULT_MODEL)
    num_ctx_str = os.environ.get("LOCAL_NUM_CTX", str(DEFAULT_NUM_CTX))
    fallback_model = os.environ.get("LOCAL_FALLBACK_MODEL", DEFAULT_FALLBACK_MODEL)
    try:
        num_ctx = int(num_ctx_str)
    except ValueError:
        num_ctx = DEFAULT_NUM_CTX

    p = path or SETTINGS_FILE
    if p.exists():
        try:
            data = json.loads(p.read_text())
            if isinstance(data, dict):
                if isinstance(data.get("fallback_model"), str):
                    fallback_model = data["fallback_model"]
                if "model" in data and isinstance(data["model"], str) and data["model"]:
                    model = data["model"]
                if "num_ctx" in data:
                    nc = data["num_ctx"]
                    if isinstance(nc, int):
                        num_ctx = nc
                    elif isinstance(nc, str):
                        try:
                            num_ctx = int(nc)
                        except ValueError:
                            pass
        except (json.JSONDecodeError, OSError, ValueError, TypeError):
            pass

    return {"model": model, "num_ctx": num_ctx, "fallback_model": fallback_model}


mcp = FastMCP("local-llm")

CODE_SYSTEM = """You are a senior TypeScript/React engineer working in a Next.js + Vitest repo.
You receive a task, project conventions, and the current contents of relevant files.
Write complete, working, idiomatic code. No placeholders, no TODOs, no elided sections.
Import every symbol you use.

OUTPUT FORMAT (strict). Use one of these per change:

1. New file, or rewriting most of a file — the FULL content:
<file path="relative/path/from/repo/root.ts">
...entire file content...
</file>

2. Small change to an existing file — PREFER THIS for fixes. One block per change; <search> must copy
lines from the current file EXACTLY (including indentation) and match exactly once:
<edit path="relative/path.ts">
<search>
exact existing lines
</search>
<replace>
new lines
</replace>
</edit>

3. If you cannot do the task without seeing another repo file (a type, a helper), output ONLY
<need path="relative/path.ts"/> lines (one per file) and nothing else; you will be called again with them.

After all files/edits, output one block:
<notes>
Short bullet list: what you did, assumptions, anything the reviewer should check.
</notes>
Output nothing outside these blocks. Do not wrap content in markdown fences.
Write each file exactly once, then stop. Never output a second version of a file.
Only write the files listed as writable; other files are read-only context."""

REVIEW_SYSTEM = """You are a meticulous code reviewer. Review the diff for real defects:
correctness bugs, spec violations, broken edge cases, missing tests for important logic,
type errors, React state bugs, accessibility problems, and needless complexity.
Do not report style nits or praise. Every finding must name a concrete failure scenario.
Judge against this repo's stated environment (AGENTS.md / README: one Linux box, 2x AMD GPUs, local dev).
Portability to other OSes, GPUs, CI images or hardware is out of scope, and so are deliberate design
choices that are documented in comments or the spec.
For each finding, `evidence` must be one line of code copied EXACTLY from the file as it is now
(not from removed diff lines). Before reporting, re-read that line and confirm the defect is really there:
check that imports you think are missing are not already present. If unsure, leave it out.
If there is nothing real, return an empty findings list."""

REVIEW_SCHEMA = {
    "type": "object",
    "properties": {
        "findings": {
            "type": "array",
            "maxItems": 12,
            "items": {
                "type": "object",
                "properties": {
                    "file": {"type": "string"},
                    "line": {"type": "integer"},
                    "severity": {"type": "string", "enum": ["high", "medium", "low"]},
                    "category": {"type": "string"},
                    "evidence": {"type": "string", "maxLength": 300},
                    "summary": {"type": "string", "maxLength": 200},
                    "failure_scenario": {"type": "string", "maxLength": 400},
                },
                "required": [
                    "file", "line", "severity", "category", "evidence", "summary", "failure_scenario"
                ],
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


def _conventions(target_files: list[str] | None = None) -> str:
    """AGENTS.md minus what the local model can't act on; None keeps the TypeScript rules (review)."""
    p = ROOT / "AGENTS.md"
    return trim_conventions(p.read_text(), target_files or ["review.ts"]) if p.exists() else ""


def _chat(
    system: str,
    user: str,
    *,
    fmt: dict | None = None,
    temperature: float = 0.3,
    num_predict: int = NUM_PREDICT,
    model: str | None = None,
) -> dict:
    s = _settings()
    body = {
        "model": model or s["model"],
        "stream": False,
        "messages": [{"role": "system", "content": system}, {"role": "user", "content": user}],
        "options": {
            "num_ctx": s["num_ctx"],
            "num_predict": num_predict,
            "temperature": temperature,
            "top_p": 0.8,
            "repeat_penalty": 1.1,
        },
        "keep_alive": "60m",
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
    s = _settings()
    out_tok = data.get("eval_count", 0)
    in_tok = data.get("prompt_eval_count", 0)
    eval_s = data.get("eval_duration", 0) / 1e9 or 1
    truncated = " TRUNCATED (hit num_predict)" if data.get("done_reason") == "length" else ""
    return (
        f"model={data.get('model') or s['model']} wall={data.get('_wall_s', 0)}s in={in_tok}tok out={out_tok}tok "
        f"({out_tok / eval_s:.1f} tok/s){truncated}"
    )


def _metric(kind: str, data: dict, extra: dict | None = None) -> None:
    """Append one JSON line per model call to .llm-logs/metrics.jsonl (offload accounting)."""
    LOG_DIR.mkdir(exist_ok=True)
    s = _settings()
    row = {
        "ts": time.strftime("%Y-%m-%dT%H:%M:%S"),
        "kind": kind,
        "model": data.get("model") or s["model"],
        "in_tok": data.get("prompt_eval_count", 0),
        "out_tok": data.get("eval_count", 0),
        "wall_s": data.get("_wall_s", 0),
        "truncated": data.get("done_reason") == "length",
        **(extra or {}),
    }
    with (LOG_DIR / "metrics.jsonl").open("a") as f:
        f.write(json.dumps(row) + "\n")


NEED_RE = re.compile(r'<need path="([^"]+)"\s*/>')
NOTES_RE = re.compile(r"<notes>(.*?)</notes>", re.S)
FENCE_RE = re.compile(r"^```[\w-]*\n(.*?)\n```$", re.S)


@mcp.tool()
def local_code(
    task: str,
    target_files: list[str],
    context_files: list[str] | None = None,
    allow_other_files: bool = False,
    model: str | None = None,
) -> str:
    """Have the local LLM write or edit files in the repo.

    task: precise spec with acceptance criteria.
    target_files: repo-relative paths the model may create/change (current contents are sent).
    context_files: extra repo-relative files to show read-only (types, specs, neighbours).
    allow_other_files: if False, files outside target_files are skipped and reported.
    model: Ollama model for this call (default: the configured model).
    The model may answer with whole files, search/replace edits, or <need> requests for more files
    (fetched automatically, up to MAX_NEED_ROUNDS times).
    Returns a summary (files written, edits applied/failed, model notes, log path) — not the code.
    """
    context_files = list(context_files or [])
    auto = _auto_context(target_files, context_files)
    context_files += auto
    fetched: list[str] = []
    for _ in range(MAX_NEED_ROUNDS + 1):
        prompt = _code_prompt(task, target_files, context_files)
        data = _chat(CODE_SYSTEM, prompt, model=model)
        log = _log("code", prompt, data)
        content = data.get("message", {}).get("content", "")
        needs = [n for n in NEED_RE.findall(content) if n not in context_files and n not in target_files]
        if needs and not FILE_RE.search(content) and not EDIT_RE.search(content):
            ok_needs = [n for n in needs if _safe_exists(n)]
            if not ok_needs:
                break
            context_files += ok_needs
            fetched += ok_needs
            continue
        break
    result = _apply_output(content, target_files, allow_other_files)
    _metric("code", data, {"task": task[:120], **{k: len(v) for k, v in result.items()}})

    notes = NOTES_RE.search(content)
    lines = [_stats(data)]
    if auto:
        lines.append("auto-included imports: " + ", ".join(auto))
    if fetched:
        lines.append("model requested and got: " + ", ".join(fetched))
    lines.append("written: " + (", ".join(result["written"]) or "NONE"))
    if result["edited"]:
        lines.append("edited: " + ", ".join(result["edited"]))
    if result["edit_failed"]:
        lines.append("EDITS FAILED (search text not found once): " + "; ".join(result["edit_failed"]))
    if result["refused"]:
        lines.append("REFUSED: " + "; ".join(result["refused"]))
    bad = malformed_blocks(content)
    if bad:
        lines.append(bad)
    touched = {w.split(" ")[0] for w in result["written"] + result["edited"]}
    missing = [t for t in target_files if t not in touched]
    if missing:
        lines.append("not touched: " + ", ".join(missing))
    if result["skipped"]:
        lines.append("skipped: " + "; ".join(result["skipped"]))
    if result["dupes"]:
        lines.append("WARNING model emitted these files more than once (last copy kept): " + ", ".join(result["dupes"]))
    if not touched:
        lines.append("raw output head: " + content[:600])
    lines.append("notes: " + (notes.group(1).strip() if notes else "(none)"))
    lines.append(f"log: {log}")
    return "\n".join(lines)


def _safe_exists(rel: str) -> bool:
    try:
        return _safe_path(rel).is_file()
    except ValueError:
        return False


IMPORT_RE = re.compile(r"""^\s*import\s[^'"]*?from\s+['"]((?:\.{1,2}/|@/)[^'"]+)['"]""", re.M)


def _auto_context(target_files: list[str], context_files: list[str]) -> list[str]:
    """Local modules imported by the target files, so the model sees real types instead of guessing."""
    found: list[str] = []
    for rel in target_files:
        p = _safe_path(rel)
        if not p.is_file():
            continue
        for spec in IMPORT_RE.findall(p.read_text(errors="replace")):
            base = (ROOT / "src" / spec[2:]) if spec.startswith("@/") else (p.parent / spec)
            for cand in (base, *(base.with_name(base.name + ext) for ext in (".ts", ".tsx")),
                         base / "index.ts", base / "index.tsx"):
                if cand.is_file():
                    r = str(cand.resolve().relative_to(ROOT))
                    if r not in target_files and r not in context_files and r not in found:
                        found.append(r)
                    break
    return found


def _code_prompt(task: str, target_files: list[str], context_files: list[str]) -> str:
    conventions = _conventions(target_files)
    parts = [
        f"<conventions>\n{conventions}\n</conventions>" if conventions else "",
        f"<codemap>\n{build_codemap(ROOT)}</codemap>",
        f"<task>\n{task}\n</task>",
        "Files you may write: " + ", ".join(target_files),
        "<read_only_context>\n" + _read_files(context_files) + "\n</read_only_context>" if context_files else "",
        "<current_target_files>\n" + _read_files(target_files) + "\n</current_target_files>",
    ]
    return "\n\n".join(p for p in parts if p)


def _apply_output(content: str, target_files: list[str], allow_other_files: bool) -> dict[str, list[str]]:
    """Write <file> blocks and apply <edit> blocks; return what happened, by category."""
    res: dict[str, list[str]] = {
        "written": [], "edited": [], "edit_failed": [], "refused": [], "skipped": [], "dupes": []
    }
    allowed = {str(_safe_path(t)) for t in target_files}

    def check(rel: str) -> Path | None:
        try:
            p = _safe_path(rel)
        except ValueError as e:
            res["skipped"].append(f"{rel} ({e})")
            return None
        if str(p) not in allowed and not allow_other_files:
            res["skipped"].append(f"{rel} (not in target_files)")
            return None
        return p

    blocks = FILE_RE.findall(content)
    seen = [rel for rel, _ in blocks]
    res["dupes"] = sorted({r for r in seen if seen.count(r) > 1})
    for rel, body in blocks:
        m = FENCE_RE.match(body.strip())
        if m:
            body = m.group(1)
        p = check(rel)
        if p is None:
            continue
        old_text = p.read_text(errors="replace") if p.is_file() else ""
        new_text = body.rstrip("\n") + "\n"
        refusal = (shrink_refusal(rel, old_text, new_text) if p.is_file() else None) or stray_tags(rel, old_text, new_text)
        if refusal:
            res["refused"].append(refusal)
            continue
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(new_text)
        res["written"].append(f"{rel} ({body.count(chr(10)) + 1} lines)")

    edit_counts: dict[str, int] = {}
    for rel, search, replace in EDIT_RE.findall(content):
        p = check(rel)
        if p is None:
            continue
        if not p.exists():
            res["edit_failed"].append(f"{rel}: file does not exist (use <file>)")
            continue
        text = p.read_text()
        n = text.count(search)
        if n != 1:
            # tolerate trailing-whitespace differences only
            stripped = "\n".join(l.rstrip() for l in text.split("\n"))
            s2 = "\n".join(l.rstrip() for l in search.split("\n"))
            if stripped.count(s2) == 1:
                text, search = stripped, s2
            else:
                first = search.strip().splitlines()[0][:80] if search.strip() else ""
                res["edit_failed"].append(f"{rel}: search matched {n}x, starts '{first}'")
                continue
        new_text = text.replace(search, replace, 1)
        refusal = stray_tags(rel, text, new_text)
        if refusal:
            res["refused"].append(refusal)
            continue
        p.write_text(new_text)
        edit_counts[rel] = edit_counts.get(rel, 0) + 1
    res["edited"] = [f"{rel} ({n} edit{'s' if n > 1 else ''})" for rel, n in edit_counts.items()]
    return res


def _run_checks(checks: list[str], test_filter: list[str]) -> tuple[bool, str]:
    """Run npm scripts; return (all_passed, trimmed error output of failing ones)."""
    failures = []
    for name in checks:
        cmd = ["npm", "run", "-s", name]
        if name == "test" and test_filter:
            cmd += ["--", *test_filter]
        r = subprocess.run(cmd, cwd=ROOT, capture_output=True, text=True, timeout=600)
        out = (r.stdout + r.stderr).strip()
        # lint warnings count as failures so the model cleans them up too
        failed = r.returncode != 0 or (name == "lint" and "warning" in out)
        if failed:
            lines = [l for l in out.splitlines() if l.strip() and "node_modules" not in l]
            failures.append(f"### npm run {name}\n" + "\n".join(lines[-60:]))
    return not failures, "\n\n".join(failures)


def _error_signature(errors: str) -> frozenset[str]:
    """Normalise check output so 'same failure again' can be detected across rounds."""
    sig = set()
    for line in errors.splitlines():
        line = re.sub(r"\(\d+,\d+\)|:\d+:\d+|\d+(\.\d+)?m?s\b|Start at.*|Duration.*", "", line).strip()
        if re.search(r"error|fail|×|warning|expected", line, re.I):
            sig.add(line)
    return frozenset(sig)


def _git_changed() -> set[str]:
    """Return repo-relative paths from git status --porcelain."""
    try:
        proc = subprocess.run(
            ["git", "status", "--porcelain"],
            capture_output=True,
            text=True,
            timeout=30,
            cwd=ROOT,
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


def _anchor_texts(anchors: list[str]) -> dict[str, str]:
    """Current text of every file named in anchors ("" when missing)."""
    out: dict[str, str] = {}
    for a in anchors:
        rel = a.split(": ", 1)[0].strip()
        p = _safe_path(rel)
        out[rel] = p.read_text(errors="replace") if p.is_file() else ""
    return out


def _tooling_problems(report: str, anchors: list[str], originals: dict[str, str]) -> str:
    """Failed edits, refused writes and untouched anchors as check output ("" if none)."""
    lines = [x for x in round_problems(report).split("\n") if x]
    lines += [f"error: {m}" for m in untouched_anchors(originals, _anchor_texts(anchors), anchors)]
    return "### tooling\n" + "\n".join(lines) if lines else ""


def _checks_with_tooling(
    checks: list[str], test_filter: list[str], report: str, anchors: list[str], originals: dict[str, str]
) -> tuple[bool, str]:
    """_run_checks, but a round also fails on tooling problems (listed first)."""
    ok, errors = _run_checks(checks, test_filter)
    tooling = _tooling_problems(report, anchors, originals)
    if not tooling:
        return ok, errors
    return False, tooling + ("\n\n" + errors if errors else "")


def _fix_rounds(
    task: str,
    target_files: list[str],
    context_files: list[str] | None,
    checks: list[str],
    test_filter: list[str],
    anchors: list[str],
    originals: dict[str, str],
    report: str,
    rounds: range,
    model: str | None,
    log: list[str],
    history: list[str],
) -> tuple[str, str, str]:
    """Check/fix loop over `rounds` with `model` (None = configured); returns (status, errors, last report)."""
    prev_sig: frozenset[str] | None = None
    errors = ""
    for rnd in rounds:
        ok, errors = _checks_with_tooling(checks, test_filter, report, anchors, originals)
        if ok:
            log.append(f"round {rnd}: all checks pass ({', '.join(checks)})")
            return "PASSED", errors, report
        sig = _error_signature(errors)
        if prev_sig is not None and sig == prev_sig:
            log.append(f"round {rnd}: same failures as last round; stopping")
            return "STUCK (same failures two rounds in a row)", errors, report
        prev_sig = sig
        earlier = (
            "\n\nEarlier rounds (your previous fixes did NOT solve these; try a different approach):\n"
            + "\n".join(history[-3:])
            if history
            else ""
        )
        fix_task = (
            f"{task}\n\n---\nThe target files currently fail these checks. Fix the root cause, using <edit> blocks "
            f"for small changes. Do not weaken or delete tests unless the test contradicts the spec (then say so "
            f"in <notes>). Add any missing imports.{earlier}\n\nCurrent failures (round {rnd}):\n{errors}"
        )
        report = local_code(fix_task, target_files, context_files, model=model)
        notes = report.split("notes: ", 1)[-1].split("\nlog: ")[0][:400]
        history.append(f"- round {rnd}: {len(sig)} failing lines, e.g. {sorted(sig)[:3]}; your notes: {notes}")
        log.append(f"round {rnd}: failures\n{errors[:1500]}\n-- fix:\n{report}")
    ok, errors = _checks_with_tooling(checks, test_filter, report, anchors, originals)
    return ("PASSED" if ok else "STILL FAILING after max_rounds"), errors, report


def _escalate(task: str, target_files: list[str], errors: str) -> dict:
    """Hand the remaining failures to Claude Code and parse its response."""
    before = _git_changed()
    prompt = _escalation_prompt(task, target_files, errors)
    cmd = _escalation_cmd(prompt, target_files)
    try:
        proc = subprocess.run(cmd, capture_output=True, text=True, timeout=ESCALATE_TIMEOUT_S, cwd=ROOT)
    except (FileNotFoundError, subprocess.TimeoutExpired) as e:
        return {"ok": False, "summary": str(e), "cost_usd": 0.0, "turns": 0, "outside": []}

    res = _parse_claude_json(proc.stdout)
    after = _git_changed()
    outside = _outside_changes(before, after, target_files)
    res["outside"] = outside
    _metric("escalate", {}, {"task": task[:120], "ok": res.get("ok"), "cost_usd": res.get("cost_usd"), "turns": res.get("turns")})
    return res


@mcp.tool()
def local_iterate(
    task: str,
    target_files: list[str],
    context_files: list[str] | None = None,
    max_rounds: int = 4,
    checks: list[str] | None = None,
    test_filter: list[str] | None = None,
    skip_first_write: bool = False,
    anchors: list[str] | None = None,
    fallback: bool = True,
    escalate: bool = True,
) -> str:
    """Write files with the local LLM, then loop: run checks, feed failures back, fix — until green.

    checks: npm scripts to run (default lint, typecheck, test). test_filter: vitest path filters.
    skip_first_write: True to start by checking the files already on disk (fix-only mode).
    anchors: "path: exact existing line" spots the task must change; a round fails while one is untouched,
    and so does a round whose edits failed to apply or whose whole-file write was refused.
    fallback: on STUCK / STILL FAILING, give the configured fallback model FALLBACK_ROUNDS more rounds first.
    escalate: on STUCK / STILL FAILING, hand the remaining failures to Claude Code (claude -p) once, then re-check.
    Each fix round sees the earlier rounds' errors and notes. If the same failure comes back twice in a row,
    the loop stops early with STUCK so Claude can step in instead of burning rounds.
    """
    checks = checks or ["lint", "typecheck", "test"]
    test_filter = test_filter or []
    anchors = anchors or []
    originals = _anchor_texts(anchors)
    report = ""
    log: list[str] = []
    history: list[str] = []

    t0 = time.time()
    if not skip_first_write:
        report = local_code(task, target_files, context_files)
        log.append("round 0 (write):\n" + report)
    status, errors, report = _fix_rounds(
        task, target_files, context_files, checks, test_filter, anchors, originals, report,
        range(1, max_rounds + 1), None, log, history,
    )
    s = _settings()
    fb = s.get("fallback_model", "")
    if not status.startswith("PASSED") and fallback and fb and fb != s["model"]:
        log.append(f"fallback: {status} with {s['model']}; handing over to {fb}")
        try:
            fb_status, errors, report = _fix_rounds(
                task, target_files, context_files, checks, test_filter, anchors, originals, report,
                range(max_rounds + 1, max_rounds + 1 + FALLBACK_ROUNDS), fb, log, history,
            )
            status = f"PASSED (fallback model {fb})" if fb_status == "PASSED" else f"{fb_status} (also with {fb})"
        except httpx.HTTPError as e:
            log.append(f"fallback failed ({fb}): {e}")
    if not status.startswith("PASSED") and escalate and ESCALATE:
        esc = _escalate(task, target_files, errors)
        ok, errors = _checks_with_tooling(checks, test_filter, "", anchors, originals)
        status = "PASSED (escalated to Claude)" if ok else "STILL FAILING after escalation to Claude"
        log.append(
            f"escalation: model={ESCALATE_MODEL} cost=${esc['cost_usd']:.2f} turns={esc['turns']} "
            f"summary: {esc['summary']}"
        )
        if esc["outside"]:
            log.append("WARNING edited outside target_files: " + ", ".join(esc["outside"]))
    _metric("iterate", {"_wall_s": round(time.time() - t0, 1)}, {"task": task[:120], "status": status, "rounds": len(log)})
    tail = "" if status.startswith("PASSED") else f"\n\nremaining:\n{errors}"
    return f"{status}\n\n" + "\n\n".join(log) + tail


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
    data = _chat(REVIEW_SYSTEM, prompt, fmt=REVIEW_SCHEMA, temperature=0.2, num_predict=4096)
    log = _log("review", prompt, data)
    content = data.get("message", {}).get("content", "")
    kept, dropped = _check_evidence(content)
    confirmed, rejected = _verify_findings(kept, focus)
    _metric("review", data, {"raw": len(kept) + len(dropped), "confirmed": len(confirmed)})
    return (
        f"{_stats(data)}\nlog: {log}\n"
        f"dropped {len(dropped)} finding(s) whose evidence line is not in the file: "
        f"{'; '.join(dropped) or '-'}\n"
        f"rejected {len(rejected)} finding(s) on re-check: {'; '.join(rejected) or '-'}\n"
        + json.dumps({"findings": confirmed}, indent=2)
    )


VERIFY_SYSTEM = """You check one code-review claim against the real file. Most review claims are wrong:
they say an import is missing when it is present, or misread the spec. Read the whole file carefully,
trace the code path in the claim, and decide whether the defect really exists in the code as written.
Answer valid=true only if you can point to the exact behaviour that fails."""

VERIFY_SCHEMA = {
    "type": "object",
    "properties": {"valid": {"type": "boolean"}, "reason": {"type": "string", "maxLength": 400}},
    "required": ["reason", "valid"],
}


def _verify_findings(findings: list[dict], focus: str) -> tuple[list[dict], list[str]]:
    """Second pass: re-check each finding against the full file it cites."""
    confirmed, rejected = [], []
    for f in findings:
        if "raw" in f:
            confirmed.append(f)
            continue
        file_text = _read_files([f["file"]])
        claim = {k: f.get(k) for k in ("line", "evidence", "summary", "failure_scenario")}
        user = (
            (f"<spec>\n{focus}\n</spec>\n\n" if focus else "")
            + f"{file_text}\n\n<claim>\n{json.dumps(claim, indent=2)}\n</claim>"
        )
        data = _chat(VERIFY_SYSTEM, user, fmt=VERIFY_SCHEMA, temperature=0.1, num_predict=1024)
        try:
            verdict = json.loads(data.get("message", {}).get("content", ""))
        except json.JSONDecodeError:
            verdict = {"valid": True, "reason": "verifier returned invalid JSON; kept"}
        if verdict.get("valid"):
            confirmed.append({**f, "verifier": verdict.get("reason", "")})
        else:
            rejected.append(f"{f['file']}:{f.get('line')}: {f.get('summary')} — {verdict.get('reason', '')}")
    return confirmed, rejected


def _norm(line: str) -> str:
    return " ".join(line.split())


def _check_evidence(content: str) -> tuple[list[dict], list[str]]:
    """Keep findings whose quoted evidence line really exists in the named file."""
    try:
        findings = json.loads(content).get("findings", [])
    except json.JSONDecodeError:
        return [{"file": "-", "summary": "reviewer returned invalid JSON", "raw": content[:500]}], []
    kept, dropped = [], []
    for f in findings:
        try:
            text = _safe_path(f.get("file", "")).read_text(errors="replace")
        except (ValueError, OSError):
            dropped.append(f"{f.get('file')}: {f.get('summary')} (file not found)")
            continue
        ev = _norm(f.get("evidence", "").lstrip("+- "))
        if ev and ev in _norm(text):
            kept.append(f)
        else:
            dropped.append(f"{f.get('file')}:{f.get('line')}: {f.get('summary')}")
    return kept, dropped


@mcp.tool()
def local_ask(prompt: str, context_files: list[str] | None = None) -> str:
    """Ask the local LLM a free-form question, optionally with repo files as context."""
    ctx = _read_files(context_files) if context_files else ""
    user = f"{ctx}\n\n{prompt}" if ctx else prompt
    data = _chat("You are a concise, expert software engineer.", user, temperature=0.5)
    _log("ask", user, data)
    return f"{_stats(data)}\n\n{data.get('message', {}).get('content', '')}"


def _vram_lines() -> list[str]:
    """Per-card VRAM from amdgpu sysfs (rocm-smi is not installed on this box)."""
    out = []
    for dev in sorted(Path("/sys/class/drm").glob("card[0-9]*/device")):
        used, total = dev / "mem_info_vram_used", dev / "mem_info_vram_total"
        if used.exists() and total.exists():
            t = int(total.read_text())
            if t > 8e9:  # skip the iGPU
                out.append(f"{dev.parent.name}: {int(used.read_text()) / 1e9:.1f} / {t / 1e9:.1f} GB")
    return out


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
    vram = "\n".join(_vram_lines()) or "(no amdgpu VRAM counters found)"
    s = _settings()
    fb = s.get("fallback_model") or "off"
    state = "present" if SETTINGS_FILE.exists() else "absent"
    return (
        f"configured model: {s['model']} num_ctx={s['num_ctx']} fallback={fb}\nsettings: {SETTINGS_FILE} ({state})\n"
        + "\n".join(models) + "\n" + vram
    )


if __name__ == "__main__":
    mcp.run()
