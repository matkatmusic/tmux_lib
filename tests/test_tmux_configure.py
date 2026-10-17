"""Tests for tmux_lib Configure bucket: setOption family, selectPane,
setPaneTitle, selectLayout, retile + live."""
from __future__ import annotations

import os
import subprocess

import pytest

import tmux_lib as _tmux_lib_mod
from tmux_lib import (
    tmux_killSession,
    tmux_newPane,
    tmux_newSession,
    tmux_listPanes,
)

# Bind module alias used throughout the test bodies.
mod = _tmux_lib_mod


# === Bucket: Configure ===

# --- tmux_setOption ---


class _FakeCompleted:
    """Stand-in for subprocess.CompletedProcess used by tmux_setOption tests."""

    def __init__(self, returncode: int, stdout: str = "", stderr: str = "") -> None:
        self.returncode = returncode
        self.stdout = stdout
        self.stderr = stderr


def _make_fake_run(rc: int, stdout: str = "", stderr: str = "", calls: list | None = None):
    """Builds a fake subprocess.run with controllable rc/stdout/stderr."""
    def _fake(cmd, *args, **kwargs):
        if calls is not None:
            calls.append(cmd)
        return subprocess.CompletedProcess(args=cmd, returncode=rc, stdout=stdout, stderr=stderr)
    return _fake


@pytest.fixture
def tmux_session_opts():
    # Provide a unique, isolated tmux session for one test; tear it down on exit.
    name = f"tmux-py-opt-test-{os.getpid()}"
    subprocess.run(["tmux", "kill-session", "-t", name],
                   capture_output=True, check=False)
    rc = tmux_newSession(name)
    assert rc == 0, "fixture failed to create tmux session"
    yield name
    subprocess.run(["tmux", "kill-session", "-t", name],
                   capture_output=True, check=False)


@pytest.fixture
def tmux_session_panes():
    name = f"tmux-py-pane-test-{os.getpid()}"
    tmux_killSession(name)  # Setup: ensure no stale session of the same name
    rc = tmux_newSession(name)
    assert rc == 0, "fixture precondition: new session must succeed"
    yield name
    tmux_killSession(name)


def _first_pane_id(session: str) -> str:
    # Helper: returns the first pane id (e.g. "%0") in the session.
    rows = tmux_listPanes(session, "-F", "#{pane_id}")
    return rows[0] if rows else ""


@pytest.fixture
def layout_session():
    # Setup: create real detached tmux session with 3 panes for layout exercises.
    name = f"tmux-py-lay-test-{os.getpid()}"
    tmux_newSession(name)
    tmux_newPane(name)
    tmux_newPane(name)
    yield name
    # Teardown: best-effort kill regardless of test outcome.
    tmux_killSession(name)
