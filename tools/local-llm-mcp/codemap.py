"""Compact map of src/: one line per source file with its purpose and exports."""
import re
import sys
from pathlib import Path


def describe(text: str) -> str:
    lines = text.split("\n")

    for line in lines:
        stripped = line.strip()
        if not stripped:
            continue
        if stripped == '"use client";' or stripped == "'use client';":
            continue

        # First non-blank, non-use-client line
        if stripped.startswith("//"):
            return stripped[2:].strip()

        if stripped.startswith("/*") or stripped.startswith("/**"):
            # Remove leading /* or /**
            inner = stripped[3:] if stripped.startswith("/**") else stripped[2:]
            inner = inner.strip()
            if inner.endswith("*/"):
                inner = inner[:-2].strip()

            # If still empty, look at next non-empty line
            if not inner:
                j = lines.index(line) + 1
                while j < len(lines):
                    next_line = lines[j].strip()
                    if next_line:
                        # Strip leading * and trailing */
                        next_line = next_line.replace("*/", "").strip()
                        return next_line.lstrip("*").strip()
                    j += 1

            return inner.strip()

        return ""

    return ""


def exports(text: str) -> list[str]:
    pattern = re.compile(r"^export\s+(?:default\s+)?(?:async\s+)?(?:function|const|let|class|interface|type|enum)\s+([A-Za-z_$][\w$]*)", re.M)
    matches = pattern.findall(text)

    # Remove duplicates while preserving order
    seen = set()
    result = []
    for name in matches:
        if name not in seen:
            seen.add(name)
            result.append(name)

    return result


def source_files(root: Path) -> list[Path]:
    src_dir = root / "src"
    if not src_dir.exists():
        return []

    paths = []
    for p in src_dir.rglob("*"):
        if p.is_file():
            name = p.name
            # Exclude .test. and .d.ts
            if ".test." in name:
                continue
            if name.endswith(".d.ts"):
                continue
            if name.endswith(".ts") or name.endswith(".tsx"):
                paths.append(p)

    # Sort by relative path as posix string
    paths.sort(key=lambda p: p.relative_to(root).as_posix())
    return paths


def build_codemap(root: Path) -> str:
    files = source_files(root)
    if not files:
        return ""

    lines = []
    for p in files:
        rel = p.relative_to(root).as_posix()
        text = p.read_text()
        desc = describe(text) or "(no description)"
        names = exports(text)

        if names:
            line = f"{rel} — {desc} · {', '.join(names)}"
        else:
            line = f"{rel} — {desc}"
        lines.append(line)

    return "\n".join(lines) + "\n"


def missing_descriptions(root: Path) -> list[str]:
    files = source_files(root)
    missing = []

    for p in files:
        text = p.read_text()
        if describe(text) == "":
            rel = p.relative_to(root).as_posix()
            missing.append(rel)

    missing.sort()
    return missing


def main(argv: list[str], root: Path | None = None) -> int:
    if root is None:
        root = Path(__file__).resolve().parents[2]

    if "--check" in argv:
        missing = missing_descriptions(root)
        if missing:
            print("files without a one-line header comment:")
            for p in missing:
                print(f"  {p}")
            return 1
        else:
            print(f"codemap ok ({len(source_files(root))} files)")
            return 0
    else:
        print(build_codemap(root), end="")
        return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
