"""Contract tests for the pure helpers in server.py (run: npm run test:tools)."""

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import server  # noqa: E402


# --- _settings ---------------------------------------------------------------

def test_settings_defaults_without_file_or_env(tmp_path, monkeypatch):
    monkeypatch.delenv("LOCAL_FALLBACK_MODEL", raising=False)
    monkeypatch.delenv("LOCAL_MODEL", raising=False)
    monkeypatch.delenv("LOCAL_NUM_CTX", raising=False)
    s = server._settings(tmp_path / "missing.json")
    assert s == {"model": "qwen3-coder-next:q4_K_M", "num_ctx": 262144, "fallback_model": "qwen3.5:122b-a10b"}


def test_settings_env_overrides_defaults(tmp_path, monkeypatch):
    monkeypatch.setenv("LOCAL_MODEL", "env-model")
    monkeypatch.setenv("LOCAL_NUM_CTX", "65536")
    monkeypatch.setenv("LOCAL_FALLBACK_MODEL", "env-big")
    assert server._settings(tmp_path / "missing.json") == {
        "model": "env-model", "num_ctx": 65536, "fallback_model": "env-big"
    }


def test_settings_file_wins_and_missing_keys_fall_back(tmp_path, monkeypatch):
    monkeypatch.setenv("LOCAL_NUM_CTX", "65536")
    monkeypatch.delenv("LOCAL_MODEL", raising=False)
    f = tmp_path / "local-llm.json"
    monkeypatch.delenv("LOCAL_FALLBACK_MODEL", raising=False)
    f.write_text(json.dumps({"model": "qwen3.5:122b-a10b", "fallback_model": ""}))
    assert server._settings(f) == {"model": "qwen3.5:122b-a10b", "num_ctx": 65536, "fallback_model": ""}


def test_settings_num_ctx_is_int_and_bad_json_ignored(tmp_path, monkeypatch):
    monkeypatch.delenv("LOCAL_MODEL", raising=False)
    monkeypatch.delenv("LOCAL_NUM_CTX", raising=False)
    f = tmp_path / "local-llm.json"
    f.write_text(json.dumps({"num_ctx": "131072"}))
    assert server._settings(f)["num_ctx"] == 131072
    f.write_text("{not json")
    assert server._settings(f)["model"] == "qwen3-coder-next:q4_K_M"
    assert server._settings(f)["num_ctx"] == 262144


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
        "If a test expects something an existing shared component or helper does not do (a different label, name or "
        "signature), the test is likely wrong: report it in your summary instead of rewriting working code to fit it.",
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
        "--allowedTools", "Read", "Grep", "Glob", "Bash(npm run *)", "Bash(npm test *)",
        "Edit(./src/a.ts)", "Edit(./src/b.ts)",
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
    monkeypatch.setattr(server, "_settings", lambda *a: {"model": "m", "num_ctx": 1, "fallback_model": ""})

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


# --- PR 24 wiring: conventions, code map, shrink guard, anchors ----------------

def test_code_prompt_sends_trimmed_conventions_then_codemap_then_task():
    p = server._code_prompt("THE TASK", ["src/game/rng.ts"], [])
    assert "<codemap>\nsrc/" in p and "src/game/rng.ts — " in p
    assert "## Local model pitfalls" in p
    assert "nextjs-agent-rules" not in p and "## Workflow" not in p
    assert p.index("<conventions>") < p.index("<codemap>") < p.index("<task>\nTHE TASK")


def test_code_prompt_for_python_targets_has_codemap_but_no_conventions():
    # server.py's own source (sent as a target file) contains the text "<conventions>", so check the prompt start
    p = server._code_prompt("T", ["tools/local-llm-mcp/server.py"], [])
    assert p.startswith("<codemap>\nsrc/")
    assert "## Local model pitfalls" not in p


def _repo(tmp_path, monkeypatch, files: dict[str, str]):
    monkeypatch.setattr(server, "ROOT", tmp_path)
    for rel, text in files.items():
        (tmp_path / rel).parent.mkdir(parents=True, exist_ok=True)
        (tmp_path / rel).write_text(text)


BIG = "\n".join(f"line {i}" for i in range(40)) + "\n"


def test_apply_output_refuses_whole_file_write_that_loses_most_of_a_file(tmp_path, monkeypatch):
    _repo(tmp_path, monkeypatch, {"big.py": BIG})
    res = server._apply_output('<file path="big.py">\nline 0\nline 1\n</file>', ["big.py"], False)
    assert res["written"] == []
    assert res["refused"] == ["big.py: refused whole-file write (41 -> 3 lines); use <edit> blocks for changes to existing files"]
    assert (tmp_path / "big.py").read_text() == BIG


def test_apply_output_still_writes_new_and_growing_files(tmp_path, monkeypatch):
    _repo(tmp_path, monkeypatch, {"small.py": "a\n"})
    out = '<file path="new.py">\nx = 1\n</file>\n<file path="small.py">\na\nb\n</file>'
    res = server._apply_output(out, ["new.py", "small.py"], False)
    assert res["refused"] == []
    assert (tmp_path / "new.py").read_text() == "x = 1\n"
    assert (tmp_path / "small.py").read_text() == "a\nb\n"


def test_local_code_reports_refused_writes(tmp_path, monkeypatch):
    _repo(tmp_path, monkeypatch, {"big.py": BIG})
    reply = {"message": {"content": '<file path="big.py">\nx\n</file>\n<notes>\n- n\n</notes>'}}
    monkeypatch.setattr(server, "_chat", lambda *a, **k: reply)
    monkeypatch.setattr(server, "_log", lambda *a, **k: "log.md")
    monkeypatch.setattr(server, "_metric", lambda *a, **k: None)
    out = server.local_code("t", ["big.py"])
    assert "\nREFUSED: big.py: refused whole-file write (41 -> 2 lines)" in out


def test_local_iterate_has_anchors_param_before_escalate():
    import inspect

    params = list(inspect.signature(server.local_iterate).parameters)
    assert params[-3:] == ["anchors", "fallback", "escalate"]


def _fake_writes(monkeypatch, reports_and_writes, check_ok=True):
    """local_code fake: each call returns the next report and applies the next {path: text} write."""
    seq = iter(reports_and_writes)
    calls = {"code": 0, "escalate": 0}

    def fake_code(*a, **k):
        calls["code"] += 1
        report, writes = next(seq)
        for rel, text in writes.items():
            (server.ROOT / rel).write_text(text)
        return report

    monkeypatch.setattr(server, "ESCALATE", True)
    monkeypatch.setattr(server, "local_code", fake_code)
    monkeypatch.setattr(server, "_run_checks", lambda checks, tf: (check_ok, "" if check_ok else "Error: x"))
    monkeypatch.setattr(server, "_metric", lambda *a, **k: None)
    monkeypatch.setattr(server, "_settings", lambda *a: {"model": "m", "num_ctx": 1, "fallback_model": ""})

    def fake_escalate(*a, **k):
        calls["escalate"] += 1
        return {"ok": False, "summary": "s", "cost_usd": 0.0, "turns": 0, "outside": []}

    monkeypatch.setattr(server, "_escalate", fake_escalate)
    return calls


def test_iterate_fails_round_when_anchor_untouched_then_passes_once_edited(tmp_path, monkeypatch):
    _repo(tmp_path, monkeypatch, {"f.py": BIG})
    edited = BIG.replace("line 10\n", "line ten\n")
    calls = _fake_writes(monkeypatch, [("written: NONE\nnotes: n", {}), ("edited: f.py (1 edit)\nnotes: n", {"f.py": edited})])
    out = server.local_iterate("t", ["f.py"], checks=["test"], anchors=["f.py: line 10"])
    assert out.startswith("PASSED\n")
    assert calls["code"] == 2 and calls["escalate"] == 0
    assert "### tooling\nerror: f.py: not edited near anchor: line 10" in out


def test_iterate_fails_round_on_failed_edit_even_when_checks_pass(tmp_path, monkeypatch):
    _repo(tmp_path, monkeypatch, {"f.py": BIG})
    bad = "edited: NONE\nEDITS FAILED (search text not found once): f.py: search matched 0x, starts 'x'\nnotes: n"
    calls = _fake_writes(monkeypatch, [(bad, {}), ("edited: f.py (1 edit)\nnotes: n", {})])
    out = server.local_iterate("t", ["f.py"], checks=["test"])
    assert out.startswith("PASSED\n")
    assert calls["code"] == 2
    assert "error: EDITS FAILED (search text not found once): f.py" in out


def test_iterate_anchor_problems_reach_escalation(tmp_path, monkeypatch):
    _repo(tmp_path, monkeypatch, {"f.py": BIG})
    calls = _fake_writes(monkeypatch, [("written: NONE\nnotes: n", {})] * 3)
    out = server.local_iterate("t", ["f.py"], checks=["test"], anchors=["f.py: line 10"])
    assert out.startswith("STILL FAILING after escalation to Claude")
    assert calls["escalate"] == 1
    assert "remaining:\n### tooling\nerror: f.py: not edited near anchor: line 10" in out


# --- PR 25: malformed blocks, per-call model, fallback model ---------------------

def test_local_code_reports_malformed_blocks(tmp_path, monkeypatch):
    _repo(tmp_path, monkeypatch, {"a.ts": "x\n"})
    bad = '<edit path="a.ts">\n<search>\nx\n</search>\n<replace>\ny\n</search>\n</edit>\n<notes>\n- n\n</notes>'
    monkeypatch.setattr(server, "_chat", lambda *a, **k: {"message": {"content": bad}})
    monkeypatch.setattr(server, "_log", lambda *a, **k: "log.md")
    monkeypatch.setattr(server, "_metric", lambda *a, **k: None)
    out = server.local_code("t", ["a.ts"])
    assert "\nMALFORMED: 1 block(s) could not be read;" in out
    assert (tmp_path / "a.ts").read_text() == "x\n"


def test_chat_uses_model_override(monkeypatch):
    sent = {}

    class Resp:
        def raise_for_status(self):
            pass

        def json(self):
            return {"message": {"content": ""}}

    def fake_post(url, json, timeout):
        sent.update(json)
        return Resp()

    monkeypatch.setattr(server.httpx, "post", fake_post)
    monkeypatch.setattr(server, "_settings", lambda *a: {"model": "m", "num_ctx": 7, "fallback_model": ""})
    server._chat("sys", "user")
    assert sent["model"] == "m" and sent["options"]["num_ctx"] == 7
    server._chat("sys", "user", model="big")
    assert sent["model"] == "big"


def test_local_code_passes_model_to_chat_and_stats_show_it(tmp_path, monkeypatch):
    _repo(tmp_path, monkeypatch, {"a.ts": "x\n"})
    seen = {}

    def fake_chat(system, prompt, **k):
        seen.update(k)
        return {"model": k.get("model") or "m", "message": {"content": "<notes>\n- n\n</notes>"}}

    monkeypatch.setattr(server, "_chat", fake_chat)
    monkeypatch.setattr(server, "_log", lambda *a, **k: "log.md")
    monkeypatch.setattr(server, "_metric", lambda *a, **k: None)
    out = server.local_code("t", ["a.ts"], model="big")
    assert seen.get("model") == "big"
    assert out.startswith("model=big ")


def _fake_fallback(monkeypatch, check_results, fallback_model="big", fail_fallback=False):
    results = iter(check_results)
    calls = {"models": [], "escalate": 0}

    def fake_code(*a, **k):
        if fail_fallback and k.get("model"):
            raise server.httpx.HTTPError("model not found")
        calls["models"].append(k.get("model"))
        return "edited: a.ts (1 edit)\nnotes: n"

    monkeypatch.setattr(server, "ESCALATE", True)
    monkeypatch.setattr(server, "local_code", fake_code)
    monkeypatch.setattr(server, "_run_checks", lambda checks, tf: next(results))
    monkeypatch.setattr(server, "_metric", lambda *a, **k: None)
    monkeypatch.setattr(server, "_settings", lambda *a: {"model": "m", "num_ctx": 1, "fallback_model": fallback_model})

    def fake_escalate(*a, **k):
        calls["escalate"] += 1
        return {"ok": True, "summary": "s", "cost_usd": 0.1, "turns": 1, "outside": []}

    monkeypatch.setattr(server, "_escalate", fake_escalate)
    return calls


def test_iterate_hands_stuck_task_to_fallback_model_before_claude(monkeypatch):
    fail = (False, "Error: boom")
    # round 1 fail, round 2 same -> STUCK; fallback round 3 fail, fix with big, round 4 passes
    calls = _fake_fallback(monkeypatch, [fail, fail, fail, (True, "")])
    out = server.local_iterate("task", ["a.ts"], checks=["test"])
    assert out.startswith("PASSED (fallback model big)")
    assert calls["models"] == [None, None, "big"]
    assert calls["escalate"] == 0
    assert "fallback: STUCK (same failures two rounds in a row) with m; handing over to big" in out


def test_iterate_escalates_when_fallback_also_fails(monkeypatch):
    fail = (False, "Error: boom")
    calls = _fake_fallback(monkeypatch, [fail, fail, fail, fail, (True, "")])
    out = server.local_iterate("task", ["a.ts"], checks=["test"])
    assert calls["models"] == [None, None, "big"]
    assert calls["escalate"] == 1
    assert out.startswith("PASSED (escalated to Claude)")


def test_iterate_skips_fallback_when_off_same_or_disabled(monkeypatch):
    fail = (False, "Error: boom")
    for fb, flag in [("", True), ("m", True), ("big", False)]:
        calls = _fake_fallback(monkeypatch, [fail, fail, (True, "")], fallback_model=fb)
        out = server.local_iterate("task", ["a.ts"], checks=["test"], fallback=flag)
        assert calls["models"] == [None, None], fb
        assert calls["escalate"] == 1 and "fallback:" not in out


def test_iterate_fallback_error_is_logged_and_claude_still_runs(monkeypatch):
    fail = (False, "Error: boom")
    calls = _fake_fallback(monkeypatch, [fail, fail, fail, (True, "")], fail_fallback=True)
    out = server.local_iterate("task", ["a.ts"], checks=["test"])
    assert "fallback failed (big): model not found" in out
    assert calls["escalate"] == 1
    assert out.startswith("PASSED (escalated to Claude)")


def test_apply_output_refuses_edit_that_adds_stray_tags(tmp_path, monkeypatch):
    _repo(tmp_path, monkeypatch, {"a.py": "x = 1\n"})
    out = '<edit path="a.py">\n<search>\nx = 1\n</search>\n<replace>\nx = 2\n</search>\n<replace>\nx = 3\n</replace>\n</edit>'
    res = server._apply_output(out, ["a.py"], False)
    assert res["edited"] == []
    assert res["refused"] == [
        "a.py: refused: the change adds output-format tag lines (</search>, <replace>); "
        "a block was probably not closed properly"
    ]
    assert (tmp_path / "a.py").read_text() == "x = 1\n"


def test_apply_output_refuses_file_write_with_stray_tags(tmp_path, monkeypatch):
    _repo(tmp_path, monkeypatch, {})
    res = server._apply_output('<file path="n.py">\nx = 1\n</edit>\ny = 2\n</file>', ["n.py"], False)
    assert res["written"] == [] and len(res["refused"]) == 1
    assert not (tmp_path / "n.py").exists()
