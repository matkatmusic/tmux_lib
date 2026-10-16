import { tmux_lib } from "./tmux_lib.ts";
import { type RunResult } from "./tmux_lib_internal.ts";

export const tmux_lib_session = {
  // Checks if a tmux session exists. Returns 0 or 1 silently; other codes log to stderr.
  tmux_hasSession(session_name: string): number {
    const cmd: string[] = ["tmux", "has-session", "-t", session_name];
    const result: RunResult = tmux_lib.run(cmd, { capture_output: true, text: true, check: false });
    const notZero: boolean = result.returncode !== 0;
    const notOne: boolean = result.returncode !== 1;
    const unexpectedCode: boolean = notZero && notOne;
    if (unexpectedCode) {
      const caller: string = tmux_lib.callerName();
      const combined: string = (result.stdout || "") + (result.stderr || "");
      tmux_lib.stderrWrite(`[${caller}] command '${cmd.join(" ")}' failed: ${combined}\n`);
    }
    return result.returncode;
  },

  // Creates a detached tmux session named <session_name>; extra args pass through after `-d -s <name>`.
  tmux_newSession(session_name: string, ...extra_args: string[]): number {
    const cmd: string[] = ["tmux", "new-session", "-d", "-s", session_name, ...extra_args];
    const result: RunResult = tmux_lib.run(cmd, { capture_output: true, text: true, check: false });
    if (result.returncode !== 0) {
      const caller: string = tmux_lib.callerName();
      const combined: string = (result.stdout || "") + (result.stderr || "");
      tmux_lib.stderrWrite(`[${caller}] command '${cmd.join(" ")}' failed: ${combined}\n`);
    }
    return result.returncode;
  },

  // Kills the tmux session named `session_name` via `tmux kill-session -t <name>`.
  tmux_killSession(session_name: string): number {
    const cmd: string[] = ["tmux", "kill-session", "-t", session_name];
    const result: RunResult = tmux_lib.run(cmd, { capture_output: true, text: true, check: false });
    if (result.returncode !== 0) {
      const caller: string = tmux_lib.callerName();
      const combined: string = (result.stdout || "") + (result.stderr || "");
      tmux_lib.stderrWrite(`[${caller}] command '${cmd.join(" ")}' failed: ${combined}\n`);
    }
    return result.returncode;
  },

  // Lists clients attached to a session, one per line; [] on failure, with a caller-named stderr log.
  tmux_listClients(session_name: string): string[] {
    const cmd: string[] = ["tmux", "list-clients", "-t", session_name];
    const result: RunResult = tmux_lib.run(cmd, { capture_output: true, text: true, check: false });
    if (result.returncode !== 0) {
      const caller: string = tmux_lib.callerName();
      const combined: string = (result.stdout || "") + (result.stderr || "");
      tmux_lib.stderrWrite(`[${caller}] command '${cmd.join(" ")}' failed: ${combined}\n`);
      return [];
    }
    const nonEmptyLines: string[] = [];
    for (const line of (result.stdout || "").split("\n")) {
      if (line !== "") {
        nonEmptyLines.push(line);
      }
    }
    return nonEmptyLines;
  },

  // Runs `tmux new-session -s <name>` attached to this terminal; blocks until it ends. Extra args pass through.
  tmux_newAttachedSession(session_name: string, ...extra_args: string[]): number {
    const cmd: string[] = ["tmux", "new-session", "-s", session_name, ...extra_args];
    const result: { returncode: number } = tmux_lib.run(cmd, { check: false });
    if (result.returncode !== 0) {
      const caller: string = tmux_lib.callerName();
      tmux_lib.stderrWrite(`[${caller}] command '${cmd.join(" ")}' failed\n`);
    }
    return result.returncode;
  },

  // Ensures the session and window exist with a titled keepalive pane; applies options on first creation.
  tmux_ensureSession(
    session: string,
    window: string,
    cwd: string,
    keepalive_cmd: string,
    keepalive_title: string,
  ): number {
    const hasSession: number = tmux_lib.tmux_hasSession(session);
    if (hasSession !== 0) {
      tmux_lib.tmux_newSession(session, "-n", window, "-c", cwd, keepalive_cmd);
      tmux_lib.tmux_setOptionForTarget(session, "remain-on-exit", "off");
      tmux_lib.tmux_setOptionForTarget(session, "mouse", "on");
      tmux_lib.tmux_setOptionForTarget(session, "pane-border-status", "top");
      tmux_lib.tmux_setOptionForTarget(session, "pane-border-format", " #{pane_title} ");
      tmux_lib.tmux_setPaneTitle(`${session}:${window}.0`, keepalive_title);
      return 0;
    }

    const windowExists: number = tmux_lib.tmux_windowExists(session, window);
    if (windowExists !== 0) {
      tmux_lib.tmux_newWindow(session, window, "-c", cwd, keepalive_cmd);
      tmux_lib.tmux_setPaneTitle(`${session}:${window}.0`, keepalive_title);
      return 0;
    }

    tmux_lib.tmux_ensureKeepalivePane(`${session}:${window}`, cwd, keepalive_cmd, keepalive_title);
    return 0;
  },
};
