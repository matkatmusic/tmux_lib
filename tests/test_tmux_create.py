"""Tests for tmux_lib Create bucket: newSession, newPane, newWindow,
splitWindow, splitWorkerPane, ensureKeepalivePane, ensureSession + live."""
from __future__ import annotations

import os
import subprocess
from pathlib import Path

import pytest

import tmux_lib as _tmux_lib_mod
from tmux_lib import (
    tmux_killSession,
    tmux_newSession,
)

# Bind module alias used throughout the test bodies.
mod = _tmux_lib_mod


# === Bucket: Create ===


def _make_fake_run(rc: int, stdout: str = "", stderr: str = "", calls: list | None = None):
    """Builds a fake subprocess.run with controllable rc/stdout/stderr."""
    def _fake(cmd, *args, **kwargs):
        if calls is not None:
            calls.append(cmd)
        return subprocess.CompletedProcess(args=cmd, returncode=rc, stdout=stdout, stderr=stderr)
    return _fake


class _FakeCompleted:
    """Stand-in for subprocess.CompletedProcess used by tmux_splitWorkerPane tests."""

    def __init__(self, returncode: int, stdout: str = "", stderr: str = "") -> None:
        self.returncode = returncode
        self.stdout = stdout
        self.stderr = stderr


@pytest.fixture
def session_name():
    name = f"tmux-py-session-test-{os.getpid()}"
    tmux_killSession(name)  # Setup: clear any stale session from a prior run
    yield name
    tmux_killSession(name)  # Teardown: clean up in case the test left one behind


@pytest.fixture
def tmux_session_panes():
    name = f"tmux-py-pane-test-{os.getpid()}"
    tmux_killSession(name)  # Setup: ensure no stale session of the same name
    rc = tmux_newSession(name)
    assert rc == 0, "fixture precondition: new session must succeed"
    yield name
    tmux_killSession(name)


def _tmux_has_session(name: str) -> bool:
    # Setup helper: shell out to real tmux to check session existence.
    r = subprocess.run(
        ["tmux", "has-session", "-t", name],
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
    )
    return r.returncode == 0


def _tmux_window_exists(session: str, window: str) -> bool:
    # Setup helper: list windows and grep for an exact name match.
    r = subprocess.run(
        ["tmux", "list-windows", "-t", session, "-F", "#{window_name}"],
        capture_output=True, text=True,
    )
    if r.returncode != 0:
        return False
    return window in r.stdout.splitlines()


def _tmux_pane_has_title(target: str, title: str) -> bool:
    # Setup helper: query pane_title via display-message.
    r = subprocess.run(
        ["tmux", "display-message", "-p", "-t", target, "#{pane_title}"],
        capture_output=True, text=True,
    )
    return r.returncode == 0 and r.stdout.strip() == title


def _tmux_show_option(target: str, opt: str) -> str:
    # Setup helper: read tmux option value, empty string on miss.
    r = subprocess.run(
        ["tmux", "show-options", "-t", target, "-v", opt],
        capture_output=True, text=True,
    )
    return r.stdout.strip() if r.returncode == 0 else ""


def _kill(name: str) -> None:
    # Teardown helper: best-effort session kill.
    subprocess.run(
        ["tmux", "kill-session", "-t", name],
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
    )


@pytest.fixture
def tmux_session_clean():
    # Provide a unique session name and clean up after the test.
    name = f"tmux-sh-launcher-test-{os.getpid()}"
    _kill(name)
    yield name
    _kill(name)


def _writeSidecar(tmpdir_inv: Path, pane_id: str) -> None:
    (tmpdir_inv / "tmux_target").write_text(pane_id + "\n")


@pytest.fixture
def kill_calls(monkeypatch):
    # Test seam: capture pane-id + retile-target instead of touching tmux.
    calls: list[tuple[str, str]] = []

    def _fake_bg(pane_target: str, retile_target: str) -> None:
        calls.append((pane_target, retile_target))

    return calls, _fake_bg


@pytest.fixture
def fake_tmux(monkeypatch):
    """Patch `_tmux_live_pane_ids` to return a configurable set without tmux."""
    state: dict[str, set[str]] = {"live": set()}

    def _fake() -> set[str]:
        return set(state["live"])


    monkeypatch.setattr("tmux_lib._tmux_live_pane_ids", _fake)
    return state


def _make_tmpdir(tmp_path: Path, tmux_target: str = "%42") -> Path:
    """Write a minimal per-invocation tmpdir with tmux_target sidecar."""
    d = tmp_path / "todo.XXXX"
    d.mkdir()
    (d / "tmux_target").write_text(f"{tmux_target}\n")
    return d
