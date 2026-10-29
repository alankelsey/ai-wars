"""Contract tests for codemap.py (run: npm run test:tools)."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import codemap  # noqa: E402


def test_describe_line_comment_after_use_client():
    assert codemap.describe('\n"use client";\n\n// Main game screen.\nimport x from "y";') == "Main game screen."
    assert codemap.describe("'use client';\n//   Spaces trimmed  \n") == "Spaces trimmed"


def test_describe_block_comments():
    assert codemap.describe("/** Seeded RNG. */\nexport const a = 1;") == "Seeded RNG."
    assert codemap.describe("/**\n * Pallet events.\n */\n") == "Pallet events."


def test_describe_missing():
    assert codemap.describe('import type { A } from "./a";\n// later comment') == ""
    assert codemap.describe("") == ""


def test_exports_in_order_without_duplicates():
    text = (
        "export interface DifficultyDef {}\n"
        "export const DEFAULT_DIFFICULTY = 1;\n"
        "export default function Page() {}\n"
        "export async function load() {}\n"
        "export type Difficulty = 'a';\n"
        "const local = 2;\n"
        "  export const indented = 3;\n"
        "export function load() {}\n"
    )
    assert codemap.exports(text) == ["DifficultyDef", "DEFAULT_DIFFICULTY", "Page", "load", "Difficulty"]


def _tree(tmp_path: Path) -> Path:
    files = {
        "src/game/rng.ts": "// Seeded RNG.\nexport function makeRng() {}\nexport type Rng = number;\n",
        "src/game/rng.test.ts": "// tests\n",
        "src/app/page.tsx": "import x from 'y';\nexport default function Home() {}\n",
        "src/components/Note.tsx": '"use client";\n// Shows a note.\n',
        "src/types.d.ts": "// ambient\n",
        "src/styles.module.css": "/* css */\n",
    }
    for rel, text in files.items():
        p = tmp_path / rel
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(text)
    return tmp_path


def test_source_files_and_build_codemap(tmp_path):
    root = _tree(tmp_path)
    assert [p.relative_to(root).as_posix() for p in codemap.source_files(root)] == [
        "src/app/page.tsx",
        "src/components/Note.tsx",
        "src/game/rng.ts",
    ]
    assert codemap.build_codemap(root) == (
        "src/app/page.tsx — (no description) · Home\n"
        "src/components/Note.tsx — Shows a note.\n"
        "src/game/rng.ts — Seeded RNG. · makeRng, Rng\n"
    )


def test_missing_descriptions_and_main_check(tmp_path, capsys):
    root = _tree(tmp_path)
    assert codemap.missing_descriptions(root) == ["src/app/page.tsx"]
    assert codemap.main(["--check"], root=root) == 1
    assert capsys.readouterr().out == "files without a one-line header comment:\n  src/app/page.tsx\n"
    (root / "src/app/page.tsx").write_text("// Landing page.\nexport default function Home() {}\n")
    assert codemap.main(["--check"], root=root) == 0
    assert capsys.readouterr().out == "codemap ok (3 files)\n"


def test_main_prints_map(tmp_path, capsys):
    root = _tree(tmp_path)
    assert codemap.main([], root=root) == 0
    assert capsys.readouterr().out == codemap.build_codemap(root)
