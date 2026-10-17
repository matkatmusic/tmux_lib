"""Tests for tmux_lib Read bucket: requireVersion, hasSession, listClients,
capturePane, listPanes, listWindows, windowExists, paneHasTitle, plus live tests."""
from __future__ import annotations

import io
import os
import subprocess
import sys

import pytest

import tmux_lib as _tmux_lib_mod
from tmux_lib import (
    tmux_killSession,
    tmux_listPanes,
    tmux_newSession,
)

# Bind module alias used throughout the test bodies.
mod = _tmux_lib_mod


def _stdin(monkeypatch: pytest.MonkeyPatch, payload: str) -> None:
    # Helper: replace sys.stdin with an in-memory buffer carrying the JSON payload.
    monkeypatch.setattr(sys, "stdin", io.StringIO(payload))


class _FakeProc:
    """Stand-in for subprocess.CompletedProcess used by version-probe tests."""

    def __init__(self, stdout: str = "", stderr: str = "", returncode: int = 0):
        self.stdout = stdout
        self.stderr = stderr
        self.returncode = returncode


def _make_fake_run(rc: int, stdout: str = "", stderr: str = "", calls: list | None = None):
    """Builds a fake subprocess.run with controllable rc/stdout/stderr."""
    def _fake(cmd, *args, **kwargs):
        if calls is not None:
            calls.append(cmd)
        return subprocess.CompletedProcess(args=cmd, returncode=rc, stdout=stdout, stderr=stderr)
    return _fake


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


def _first_pane_id(session: str) -> str:
    # Helper: returns the first pane id (e.g. "%0") in the session.
    rows = tmux_listPanes(session, "-F", "#{pane_id}")
    return rows[0] if rows else ""
