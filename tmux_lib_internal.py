"""Low-level tmux plumbing helpers used by tmux_lib and its consumers.

Standalone subprocess wrappers that don't depend on the public tmux_lib API.
"""

import subprocess


def _tmux_default_runner(argv: list[str]) -> int:
    """Real tmux invocation: run `argv` and return the exit code.

    stdout/stderr suppressed because collisions are an expected control-flow
    signal, not an error condition the user should see (mirrors the bash
    `hide_errors` wrapper around the original tmux call).
    """
    proc = subprocess.run(
        argv,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        check=False,
    )
    return proc.returncode


def _tmux_run(*args: str) -> str:
    """Run a tmux subcommand; return stdout or error message on failure."""
    try:
        result = subprocess.run(
            ["tmux", *args],
            capture_output=True,
            text=True,
        )
        return (result.stdout + result.stderr).rstrip("\n")
    except FileNotFoundError:
        return "(tmux not found)"


def _tmux_session_exists(session: str) -> bool:
    try:
        result = subprocess.run(
            ["tmux", "has-session", "-t", session],
            capture_output=True,
        )
        return result.returncode == 0
    except FileNotFoundError:
        return False


# Default tmux send used when the caller does not inject one.
def _tmux_default_send(pane: str, keys: str) -> None:
    # Mirrors `tmux send-keys -t "$PANE" <keys> 2>/dev/null || true` --
    # callers swallow errors at the dispatch layer, but we also redirect
    # stderr here so a missing pane doesn't pollute the watcher's log.
    subprocess.run(
        ["tmux", "send-keys", "-t", pane, keys],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        check=False,
    )


def _tmux_live_pane_ids() -> set[str]:
    """Return the set of currently-live tmux pane ids ('%N').

    Failures (no tmux, no server, non-zero rc) are swallowed and yield
    an empty set, matching bash `hide_errors tmux list-panes ...`.
    """
    # Test action: query tmux for every pane across every session.
    try:
        proc = subprocess.run(
            ["tmux", "list-panes", "-a", "-F", "#{pane_id}"],
            capture_output=True,
            text=True,
            check=False,
        )
    except (FileNotFoundError, OSError):
        return set()
    if proc.returncode != 0:
        return set()
    return {line.strip() for line in proc.stdout.splitlines() if line.strip()}

def _tmux_kill_pane(pane_id: str) -> None:
    """Kill a tmux pane, silencing errors (mirrors bash `hide_errors tmux_kill_pane`)."""
    subprocess.run(
        ["tmux", "kill-pane", "-t", pane_id],
        capture_output=True,
        check=False,
    )


# Boundary seam: returns the pane's current foreground command (e.g. "gemini","codex","bash").
# Tests patch this.
def _tmux_paneCurrentCommand(pane_id: str) -> str:
    try:
        out = subprocess.run(
            ["tmux", "display-message", "-p", "-t", pane_id, "#{pane_current_command}"],
            check=False,
            capture_output=True,
            text=True,
        )
    except (OSError, subprocess.SubprocessError):
        return ""
    if out.returncode != 0:
        return ""
    return out.stdout.strip()


# Boundary seam: returns the set of live pane ids (e.g. {"%5","%7"}) in WINDOW_TARGET.
# Tests patch this; production callers pass `window_target` from the orchestrator.
def _tmux_listLivePaneIds(window_target: str) -> set[str]:
    try:
        out = subprocess.run(
            ["tmux", "list-panes", "-t", window_target, "-F", "#{pane_id}"],
            check=False,
            capture_output=True,
            text=True,
        )
    except (OSError, subprocess.SubprocessError):
        return set()
    if out.returncode != 0:
        return set()
    return {line.strip() for line in out.stdout.splitlines() if line.strip()}
