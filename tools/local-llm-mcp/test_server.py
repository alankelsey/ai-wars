"""Contract tests for the pure helpers in server.py (run: npm run test:tools)."""

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import server  # noqa: E402


# --- _settings ---------------------------------------------------------------

def test_settings_defaults_without_file_or_env(tmp_path, monkeypatch):
    monkeypatch.delenv("LOCAL_MODEL", raising=False)
    monkeypatch.delenv("LOCAL_NUM_CTX", raising=False)
    s = server._settings(tmp_path / "missing.json")
    assert s == {"model": "qwen3-coder-next:q4_K_M", "num_ctx": 262144}


def test_settings_env_overrides_defaults(tmp_path, monkeypatch):
    monkeypatch.setenv("LOCAL_MODEL", "env-model")
    monkeypatch.setenv("LOCAL_NUM_CTX", "65536")
    assert server._settings(tmp_path / "missing.json") == {"model": "env-model", "num_ctx": 65536}


def test_settings_file_wins_and_missing_keys_fall_back(tmp_path, monkeypatch):
    monkeypatch.setenv("LOCAL_NUM_CTX", "65536")
    monkeypatch.delenv("LOCAL_MODEL", raising=False)
    f = tmp_path / "local-llm.json"
    f.write_text(json.dumps({"model": "qwen3.5:122b-a10b"}))
    assert server._settings(f) == {"model": "qwen3.5:122b-a10b", "num_ctx": 65536}


def test_settings_num_ctx_is_int_and_bad_json_ignored(tmp_path, monkeypatch):
    monkeypatch.delenv("LOCAL_MODEL", raising=False)
    monkeypatch.delenv("LOCAL_NUM_CTX", raising=False)
    f = tmp_path / "local-llm.json"
    f.write_text(json.dumps({"num_ctx": "131072"}))
    assert server._settings(f)["num_ctx"] == 131072
    f.write_text("{not json")
    assert server._settings(f) == {"model": "qwen3-coder-next:q4_K_M", "num_ctx": 262144}


def test_old_constants_removed():
    assert not hasattr(server, "MODEL")
    assert not hasattr(server, "NUM_CTX")


# --- escalation --------------------------------------------------------------

def test_escalation_prompt_contains_parts_in_order():
    p = server._escalation_prompt("SPEC TEXT", ["src/a.ts", "src/a.test.ts"], "ERR TEXT")
    parts = [
        "A local model could not make these checks pass. Fix the root cause with the smallest change.",
        "Edit only these files: src/a.ts, src/a.test.ts",
        "Do not weaken or delete tests. If a test contradicts the spec, fix the test and say so.",
        "<spec>\nSPEC TEXT\n</spec>",
        "<failures>\nERR TEXT\n</failures>",
        "Finish with 1-3 lines: root cause, what you changed.",
    ]
    idx = [p.index(x) for x in parts]
    assert idx == sorted(idx)


def test_escalation_prompt_keeps_last_8000_chars_of_errors():
    errors = "A" * 5000 + "B" * 8000
    p = server._escalation_prompt("t", ["x.ts"], errors)
    assert "<failures>\n" + "B" * 8000 + "\n</failures>" in p
    assert "A" not in p.split("<failures>")[1]


def test_escalation_cmd_shape():
    cmd = server._escalation_cmd("PROMPT", ["src/a.ts", "src/b.ts"])
    assert cmd == [
        "claude", "-p", "PROMPT",
        "--model", server.ESCALATE_MODEL,
        "--output-format", "json",
        "--max-budget-usd", str(server.ESCALATE_BUDGET_USD),
        "--permission-mode", "default",
        "--allowedTools", "Read", "Grep", "Glob", "Edit(./src/a.ts)", "Edit(./src/b.ts)",
    ]


def test_parse_claude_json_success():
    out = json.dumps({"is_error": False, "result": "fixed import", "total_cost_usd": 0.12, "num_turns": 4})
    assert server._parse_claude_json(out) == {"ok": True, "summary": "fixed import", "cost_usd": 0.12, "turns": 4}


def test_parse_claude_json_error_flag_and_truncation():
    out = json.dumps({"is_error": True, "result": "x" * 1000})
    r = server._parse_claude_json(out)
    assert r["ok"] is False
    assert r["summary"] == "x" * 600
    assert r["cost_usd"] == 0.0 and r["turns"] == 0


def test_parse_claude_json_invalid():
    assert server._parse_claude_json("boom") == {"ok": False, "summary": "boom", "cost_usd": 0.0, "turns": 0}
    assert server._parse_claude_json("[1, 2]")["ok"] is False


def test_outside_changes():
    before = {"README.md"}
    after = {"README.md", "src/a.ts", "src/other.ts", "docs/x.md"}
    assert server._outside_changes(before, after, ["src/a.ts"]) == ["docs/x.md", "src/other.ts"]
    assert server._outside_changes(after, after, []) == []


def test_local_iterate_has_escalate_param():
    import inspect

    params = inspect.signature(server.local_iterate).parameters
    assert list(params)[-1] == "escalate"
    assert params["escalate"].default is True


# --- local_iterate escalation path (model, checks and claude are faked) ------

def _fake_loop(monkeypatch, check_results, esc_result):
    results = iter(check_results)
    calls = {"escalate": 0}
    monkeypatch.setattr(server, "ESCALATE", True)
    monkeypatch.setattr(server, "local_code", lambda *a, **k: "written: x\nnotes: n\nlog: l")
    monkeypatch.setattr(server, "_run_checks", lambda checks, tf: next(results))
    monkeypatch.setattr(server, "_metric", lambda *a, **k: None)

    def fake_escalate(task, target_files, errors):
        calls["escalate"] += 1
        return esc_result

    monkeypatch.setattr(server, "_escalate", fake_escalate)
    return calls


ESC_OK = {"ok": True, "summary": "fixed it", "cost_usd": 0.25, "turns": 3, "outside": []}


def test_iterate_escalates_when_stuck_and_passes(monkeypatch):
    # write, round1 fail, round2 same fail -> STUCK -> escalate -> re-check passes
    calls = _fake_loop(monkeypatch, [(False, "Error: boom"), (False, "Error: boom"), (True, "")], ESC_OK)
    out = server.local_iterate("task", ["src/a.ts"], max_rounds=4, checks=["test"])
    assert calls["escalate"] == 1
    assert out.startswith("PASSED (escalated to Claude)")
    assert "escalation: model=" in out and "cost=$0.25 turns=3 summary: fixed it" in out
    assert "remaining:" not in out


def test_iterate_reports_failure_after_escalation(monkeypatch):
    esc = {**ESC_OK, "ok": False, "outside": ["src/other.ts"]}
    calls = _fake_loop(monkeypatch, [(False, "Error: boom"), (False, "Error: boom"), (False, "Error: still")], esc)
    out = server.local_iterate("task", ["src/a.ts"], max_rounds=4, checks=["test"])
    assert calls["escalate"] == 1
    assert out.startswith("STILL FAILING after escalation to Claude")
    assert "WARNING edited outside target_files: src/other.ts" in out
    assert "remaining:\nError: still" in out


def test_iterate_no_escalation_when_passing_or_disabled(monkeypatch):
    calls = _fake_loop(monkeypatch, [(True, "")], ESC_OK)
    assert server.local_iterate("task", ["src/a.ts"], checks=["test"]).startswith("PASSED\n")
    assert calls["escalate"] == 0
    calls = _fake_loop(monkeypatch, [(False, "Error: boom"), (False, "Error: boom")], ESC_OK)
    out = server.local_iterate("task", ["src/a.ts"], checks=["test"], escalate=False)
    assert out.startswith("STUCK") and calls["escalate"] == 0
