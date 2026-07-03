"""Tests for tmux_lib Communicate bucket: sendKeys, sendEnter, sendCtrlC,
sendAndSubmit, cancelAndSend + live."""
from __future__ import annotations

import os
import subprocess
import time

import pytest

import tmux_lib as _tmux_lib_mod
from tmux_lib import (
    tmux_killSession,
    tmux_newSession,
)

# Bind module alias used throughout the test bodies.
mod = _tmux_lib_mod


# === Bucket: Communicate ===


def _make_fake_run(rc: int, stdout: str = "", stderr: str = "", calls: list | None = None):
    """Builds a fake subprocess.run with controllable rc/stdout/stderr."""
    def _fake(cmd, *args, **kwargs):
        if calls is not None:
            calls.append(cmd)
        return subprocess.CompletedProcess(args=cmd, returncode=rc, stdout=stdout, stderr=stderr)
    return _fake


@pytest.fixture
def live_tmux_session():
    # Setup: create a unique detached tmux session for the test, yield its name, then tear down.
    session = f"tmux-sh-send-test-{os.getpid()}-{time.time_ns()}"
    rc = tmux_newSession(session)
    if rc != 0:
        pytest.skip("tmux_newSession failed; tmux likely unavailable")
    try:
        yield session
    finally:
        tmux_killSession(session)
