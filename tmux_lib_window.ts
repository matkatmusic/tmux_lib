import { tmux_lib } from "./tmux_lib.ts";
import { type RunResult } from "./tmux_lib_internal.ts";

export const tmux_lib_window = {
  // Creates a tmux window <window_name> in <session_name>; extra args pass through after `-t <s> -n <w>`.
  tmux_newWindow(session_name: string, window_name: string, ...extra_args: string[]): number {
    const cmd: string[] = ["tmux", "new-window", "-t", session_name, "-n", window_name, ...extra_args];
    const result: RunResult = tmux_lib.run(cmd, { capture_output: true, text: true, check: false });
    if (result.returncode !== 0) {
      const caller: string = tmux_lib.callerName();
      const combined: string = (result.stdout || "") + (result.stderr || "");
      tmux_lib.stderrWrite(`[${caller}] command '${cmd.join(" ")}' failed: ${combined}\n`);
    }
    else if (result.stdout) {
      tmux_lib.stdoutWrite(result.stdout);
    }
    return result.returncode;
  },

  // Kills the tmux window identified by `window_target` via `tmux kill-window -t <target>`.
  tmux_killWindow(window_target: string): number {
    const cmd: string[] = ["tmux", "kill-window", "-t", window_target];
    const result: RunResult = tmux_lib.run(cmd, { capture_output: true, text: true, check: false });
    if (result.returncode !== 0) {
      const caller: string = tmux_lib.callerName();
      const combined: string = (result.stdout || "") + (result.stderr || "");
      tmux_lib.stderrWrite(`[${caller}] command '${cmd.join(" ")}' failed: ${combined}\n`);
    }
    return result.returncode;
  },

  // Lists a session's windows as "<index> <name>"; extra arguments replace that default format.
  tmux_listWindows(session_name: string, ...extra_args: string[]): string[] {
    let cmd: string[];
    if (extra_args.length === 0) {
      cmd = ["tmux", "list-windows", "-t", session_name, "-F", "#{window_index} #{window_name}"];
    }
    else {
      cmd = ["tmux", "list-windows", "-t", session_name, ...extra_args];
    }
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

  // Probes whether session has a window with EXACT given name; returns 0 if exists, 1 if not.
  tmux_windowExists(session_name: string, window_name: string): number {
    const windows: string[] = tmux_lib.tmux_listWindows(session_name, "-F", "#{window_name}");
    return windows.includes(window_name) ? 0 : 1;
  },
};
