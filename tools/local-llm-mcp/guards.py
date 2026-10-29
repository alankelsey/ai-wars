"""Pure helpers that keep local-model output from silently damaging files."""
import difflib
import re


_NEXT = r'(?=\s*(?:\Z|<file path=|<edit path=|<need path=|<notes>))'
FILE_RE = re.compile(r'<file path="([^"]+)">[ \t]*\n?(.*?)\n?^</file>[ \t]*' + _NEXT, re.S | re.M)
EDIT_RE = re.compile(
    r'<edit path="([^"]+)">\s*<search>\n?(.*?)\n?</search>\s*<replace>\n?(.*?)\n?</replace>\s*</edit>[ \t]*' + _NEXT,
    re.S,
)


def shrink_refusal(rel: str, old_text: str, new_text: str) -> str | None:
    old_lines = old_text.count("\n") + 1 if old_text else 0
    new_lines = new_text.count("\n") + 1 if new_text else 0
    if old_lines >= 20 and new_lines < old_lines * 0.5:
        return (
            f"{rel}: refused whole-file write ({old_lines} -> {new_lines} lines); "
            "use <edit> blocks for changes to existing files"
        )
    return None


def parse_anchor(anchor: str) -> tuple[str, str]:
    path, sep, line = anchor.partition(": ")
    path, line = path.strip(), line.strip()
    if not sep or not path or not line:
        raise ValueError(f"bad anchor (want 'path: line'): {anchor}")
    return path, line


def untouched_anchors(originals: dict[str, str], current: dict[str, str], anchors: list[str]) -> list[str]:
    problems: list[str] = []
    for a in anchors:
        path, line = parse_anchor(a)
        old = originals.get(path, "")
        new = current.get(path, "")
        old_lines = old.split("\n")
        new_lines = new.split("\n")
        i = next((n for n, l in enumerate(old_lines) if l.strip() == line), None)
        if i is None:
            problems.append(f"{path}: anchor not found in the original file: {line}")
            continue
        ops = difflib.SequenceMatcher(None, old_lines, new_lines, autojunk=False).get_opcodes()
        touched = any(
            tag != "equal" and i1 - 3 <= i <= max(i1, i2 - 1) + 3
            for tag, i1, i2, _j1, _j2 in ops
        )
        if not touched:
            problems.append(f"{path}: not edited near anchor: {line}")
    return problems


def round_problems(code_report: str) -> str:
    return "\n".join(
        f"error: {line}"
        for line in code_report.split("\n")
        if line.startswith("EDITS FAILED") or line.startswith("REFUSED")
    )


def trim_conventions(text: str, target_files: list[str]) -> str:
    if not any(f.endswith((".ts", ".tsx")) for f in target_files):
        return ""
    begin, end = "<!-- BEGIN:nextjs-agent-rules -->", "<!-- END:nextjs-agent-rules -->"
    s = text
    b, e = s.find(begin), s.find(end)
    if b != -1 and e != -1 and e > b:
        s = s[:b] + s[e + len(end):]
    out: list[str] = []
    skipping = False
    for line in s.split("\n"):
        if line == "## Workflow":
            skipping = True
            continue
        if skipping and line.startswith("## "):
            skipping = False
        if not skipping:
            out.append(line)
    s = "\n".join(out)
    s = re.sub(r"^Game spec:.*\n?", "", s, flags=re.M)
    s = re.sub(r"\n{3,}", "\n\n", s)
    return s.strip() + "\n"
