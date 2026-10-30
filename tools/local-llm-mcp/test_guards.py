"""Contract tests for guards.py (run: npm run test:tools)."""

import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).parent))
import guards  # noqa: E402


# --- FILE_RE / EDIT_RE --------------------------------------------------------

def test_file_block_keeps_literal_closing_tag_inside_body():
    body = 'PROMPT = """example:\n<file path="x.ts">\n...\n</file>\n\nmore prompt text\n"""\nTAIL = 1'
    out = f'<file path="server.py">\n{body}\n</file>\n<notes>\n- done\n</notes>'
    assert guards.FILE_RE.findall(out) == [("server.py", body)]


def test_file_block_at_end_of_output_and_several_blocks():
    out = '<file path="a.ts">\nA\n</file>\n\n<file path="b.ts">\nB1\nB2\n</file>'
    assert guards.FILE_RE.findall(out) == [("a.ts", "A"), ("b.ts", "B1\nB2")]


def test_file_block_followed_by_edit_or_need():
    out = '<file path="a.ts">\nA\n</file>\n<edit path="b.ts">\n<search>\nx\n</search>\n<replace>\ny\n</replace>\n</edit>'
    assert guards.FILE_RE.findall(out) == [("a.ts", "A")]
    assert guards.EDIT_RE.findall(out) == [("b.ts", "x", "y")]


def test_unterminated_file_block_is_not_matched():
    assert guards.FILE_RE.findall('<file path="a.ts">\nA\nB') == []


def test_edit_block_keeps_literal_tags_inside_replace():
    replace = 'FORMAT = """\n<replace>\nnew lines\n</replace>\n</edit>\n\n3. next rule\n"""'
    out = (
        f'<edit path="server.py">\n<search>\nFORMAT = old\n</search>\n<replace>\n{replace}\n</replace>\n</edit>\n'
        "<notes>\n- n\n</notes>"
    )
    assert guards.EDIT_RE.findall(out) == [("server.py", "FORMAT = old", replace)]


def test_two_edit_blocks():
    one = '<edit path="a.ts">\n<search>\na\n</search>\n<replace>\nb\n</replace>\n</edit>'
    two = '<edit path="a.ts">\n<search>\nc\n</search>\n<replace>\nd\n</replace>\n</edit>'
    assert guards.EDIT_RE.findall(f"{one}\n\n{two}\n") == [("a.ts", "a", "b"), ("a.ts", "c", "d")]


# --- shrink_refusal -----------------------------------------------------------

def _lines(n: int) -> str:
    return "\n".join(f"line {i}" for i in range(n))


def test_shrink_refusal_refuses_losing_half_of_a_big_file():
    msg = guards.shrink_refusal("server.py", _lines(100), _lines(49))
    assert msg == "server.py: refused whole-file write (100 -> 49 lines); use <edit> blocks for changes to existing files"


def test_shrink_refusal_allows_half_small_files_and_new_files():
    assert guards.shrink_refusal("a.py", _lines(100), _lines(50)) is None
    assert guards.shrink_refusal("a.py", _lines(19), _lines(1)) is None
    assert guards.shrink_refusal("a.py", "", _lines(5)) is None
    assert guards.shrink_refusal("a.py", _lines(20), _lines(300)) is None


# --- parse_anchor ---------------------------------------------------------------

def test_parse_anchor_splits_on_first_colon_space():
    assert guards.parse_anchor("src/a.ts:   const x = { a: 1 };  ") == ("src/a.ts", "const x = { a: 1 };")


@pytest.mark.parametrize("bad", ["src/a.ts", ": line", "src/a.ts: ", "src/a.ts:line"])
def test_parse_anchor_rejects_bad_format(bad):
    with pytest.raises(ValueError, match="bad anchor"):
        guards.parse_anchor(bad)


# --- untouched_anchors -----------------------------------------------------------

OLD = "\n".join(f"line {i}" for i in range(30))


def _replace_line(text: str, idx: int, new: str) -> str:
    rows = text.split("\n")
    rows[idx] = new
    return "\n".join(rows)


def test_anchor_edited_on_the_line_itself_or_nearby():
    a = ["f.ts: line 10"]
    assert guards.untouched_anchors({"f.ts": OLD}, {"f.ts": _replace_line(OLD, 10, "changed")}, a) == []
    assert guards.untouched_anchors({"f.ts": OLD}, {"f.ts": _replace_line(OLD, 13, "changed")}, a) == []
    assert guards.untouched_anchors({"f.ts": OLD}, {"f.ts": _replace_line(OLD, 7, "changed")}, a) == []


def test_anchor_with_insert_after_it_counts():
    rows = OLD.split("\n")
    new = "\n".join(rows[:11] + ["inserted"] + rows[11:])
    assert guards.untouched_anchors({"f.ts": OLD}, {"f.ts": new}, ["f.ts: line 10"]) == []


def test_anchor_untouched_when_edit_is_far_away_or_file_unchanged():
    far = _replace_line(OLD, 20, "changed")
    assert guards.untouched_anchors({"f.ts": OLD}, {"f.ts": far}, ["f.ts: line 10"]) == [
        "f.ts: not edited near anchor: line 10"
    ]
    assert guards.untouched_anchors({"f.ts": OLD}, {"f.ts": OLD}, ["f.ts: line 3"]) == [
        "f.ts: not edited near anchor: line 3"
    ]


def test_anchor_matches_stripped_lines_and_reports_missing():
    old = "def f():\n    return 1\n"
    new = "def f():\n    return 2\n"
    assert guards.untouched_anchors({"f.py": old}, {"f.py": new}, ["f.py: return 1"]) == []
    assert guards.untouched_anchors({"f.py": old}, {"f.py": new}, ["f.py: nope"]) == [
        "f.py: anchor not found in the original file: nope"
    ]


def test_several_anchors_reported_in_order():
    new = _replace_line(OLD, 2, "x")
    got = guards.untouched_anchors({"f.ts": OLD}, {"f.ts": new}, ["f.ts: line 25", "f.ts: line 2", "f.ts: line 15"])
    assert got == ["f.ts: not edited near anchor: line 25", "f.ts: not edited near anchor: line 15"]


# --- round_problems -----------------------------------------------------------------

def test_round_problems_turns_failed_edits_and_refusals_into_errors():
    report = (
        "tokens: 10\nwritten: NONE\nedited: a.ts (1 edit)\n"
        "EDITS FAILED (search text not found once): a.ts: search matched 0x, starts 'x'\n"
        "REFUSED: server.py: refused whole-file write (100 -> 10 lines); use <edit> blocks\nnotes: n"
    )
    assert guards.round_problems(report) == (
        "error: EDITS FAILED (search text not found once): a.ts: search matched 0x, starts 'x'\n"
        "error: REFUSED: server.py: refused whole-file write (100 -> 10 lines); use <edit> blocks"
    )


def test_round_problems_empty_for_clean_report():
    assert guards.round_problems("written: a.ts (3 lines)\nnotes: fine") == ""


# --- trim_conventions ---------------------------------------------------------------

AGENTS = """# Conventions

Game spec: docs/Market_mock.md.

## Stack
- Next.js

## Workflow
- Claude writes specs.
  See skill.

## Style
- Small functions.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know
Read node_modules docs.
<!-- END:nextjs-agent-rules -->
"""


def test_trim_conventions_drops_workflow_spec_pointer_and_nextjs_block():
    got = guards.trim_conventions(AGENTS, ["src/a.ts"])
    assert got == "# Conventions\n\n## Stack\n- Next.js\n\n## Style\n- Small functions.\n"


def test_trim_conventions_empty_for_non_typescript_targets():
    assert guards.trim_conventions(AGENTS, ["tools/local-llm-mcp/server.py", "docs/x.md"]) == ""
    assert guards.trim_conventions(AGENTS, ["tools/x.py", "src/b.tsx"]) != ""


def test_trim_conventions_on_real_agents_md_keeps_rules():
    text = (Path(__file__).resolve().parents[2] / "AGENTS.md").read_text()
    got = guards.trim_conventions(text, ["src/game/game.ts"])
    assert "## Local model pitfalls" in got and "## Style" in got
    assert "nextjs-agent-rules" not in got and "## Workflow" not in got and "Game spec:" not in got
    assert len(got) < len(text)


# --- malformed_blocks (PR 25) ------------------------------------------------------

MALFORMED_MSG = (
    "MALFORMED: {n} block(s) could not be read; close each <file> with </file>, and each <edit> with "
    "</search>, </replace>, </edit> in that order"
)


def test_malformed_edit_closed_with_wrong_tag():
    out = '<edit path="a.ts">\n<search>\nx\n</search>\n<replace>\ny\n</search>\n</edit>\n<notes>\n- n\n</notes>'
    assert guards.malformed_blocks(out) == MALFORMED_MSG.format(n=1)


def test_malformed_counts_unterminated_file_and_ignores_good_blocks():
    good = '<edit path="b.ts">\n<search>\na\n</search>\n<replace>\nb\n</replace>\n</edit>'
    out = f'{good}\n<file path="a.ts">\nA\nB'
    assert guards.malformed_blocks(out) == MALFORMED_MSG.format(n=1)
    assert guards.malformed_blocks(good + "\n<notes>\n- n\n</notes>") is None
    assert guards.malformed_blocks("<notes>\n- nothing to do\n</notes>") is None


def test_malformed_ignores_example_tags_inside_a_good_file_block():
    body = 'PROMPT = """\n<edit path="x.ts">\n<search>\n...\n</search>\n"""'
    assert guards.malformed_blocks(f'<file path="server.py">\n{body}\n</file>') is None


def test_round_problems_includes_malformed():
    assert guards.round_problems("MALFORMED: 2 block(s) could not be read; x") == (
        "error: MALFORMED: 2 block(s) could not be read; x"
    )


# --- stray_tags (PR 25) ---------------------------------------------------------------

def test_stray_tags_refuses_new_tag_lines():
    old = "def f():\n    return 1\n"
    new = "def f():\n</search>\n<replace>\n    return 2\n"
    assert guards.stray_tags("a.py", old, new) == (
        "a.py: refused: the change adds output-format tag lines (</search>, <replace>); "
        "a block was probably not closed properly"
    )


def test_stray_tags_allows_existing_tag_lines_and_indented_text():
    old = 'P = """\n<search>\nx\n</search>\n"""\n'
    assert guards.stray_tags("s.py", old, old.replace("x", "y")) is None
    assert guards.stray_tags("a.ts", "", "  </file>\nconst t = '<replace>';\n") is None
    assert guards.stray_tags("a.ts", "", "") is None


def test_stray_tags_counts_occurrences():
    old = "<search>\n"
    assert guards.stray_tags("s.py", old, "<search>\n<search>\n") == (
        "s.py: refused: the change adds output-format tag lines (<search>); a block was probably not closed properly"
    )
