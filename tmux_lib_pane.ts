import { writeFileSync } from "node:fs";
import { tmux_lib } from "./tmux_lib.ts";
import { type RunResult } from "./tmux_lib_internal.ts";

export const tmux_lib_pane = {
  // Splits <target> with split-window; passes extra args. Prints stdout on success, logs stderr on failure.
  tmux_newPane(target: string, ...extra_args: string[]): number {
    const cmd: string[] = ["tmux", "split-window", "-t", target, ...extra_args];
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

  // Kills the tmux pane identified by `pane_target` via `tmux kill-pane -t <target>`.
  tmux_killPane(pane_target: string): number {
    const cmd: string[] = ["tmux", "kill-pane", "-t", pane_target];
    const result: RunResult = tmux_lib.run(cmd, { capture_output: true, text: true, check: false });
    if (result.returncode !== 0) {
      const caller: string = tmux_lib.callerName();
      const combined: string = (result.stdout || "") + (result.stderr || "");
      tmux_lib.stderrWrite(`[${caller}] command '${cmd.join(" ")}' failed: ${combined}\n`);
    }
    return result.returncode;
  },

  // Captures a pane's visible text; scrollback_lines adds history via `-S -<lines>`. Returns "" on failure.
  tmux_capturePane(pane_target: string, scrollback_lines: number | undefined = undefined): string {
    const cmd: string[] = ["tmux", "capture-pane", "-p", "-t", pane_target];
    if (scrollback_lines !== undefined) {
      cmd.push("-S", `-${scrollback_lines}`);
    }
    const result: RunResult = tmux_lib.run(cmd, { capture_output: true, text: true, check: false });
    if (result.returncode !== 0) {
      const caller: string = tmux_lib.callerName();
      const combined: string = (result.stdout || "") + (result.stderr || "");
      tmux_lib.stderrWrite(`[${caller}] command '${cmd.join(" ")}' failed: ${combined}\n`);
      return "";
    }
    return result.stdout || "";
  },

  // Lists panes for a target: default "<pane_id> <pane_title>" per pane; extras replace -F verbatim.
  tmux_listPanes(target: string, ...extra_args: string[]): string[] {
    let cmd: string[];
    if (extra_args.length === 0) {
      cmd = ["tmux", "list-panes", "-t", target, "-F", "#{pane_id} #{pane_title}"];
    }
    else {
      cmd = ["tmux", "list-panes", "-t", target, ...extra_args];
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

  // Selects a pane via `tmux select-pane -t <target>`; returns the exit code, logging failure with the caller name.
  tmux_selectPane(pane_target: string): number {
    const cmd: string[] = ["tmux", "select-pane", "-t", pane_target];
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

  // Sets a pane's title via `tmux select-pane -t <target> -T <title>`.
  tmux_setPaneTitle(pane_target: string, title: string): number {
    const cmd: string[] = ["tmux", "select-pane", "-t", pane_target, "-T", title];
    const result: RunResult = tmux_lib.run(cmd, { capture_output: true, text: true, check: false });
    if (result.returncode !== 0) {
      const caller: string = tmux_lib.callerName();
      const combined: string = (result.stdout || "") + (result.stderr || "");
      tmux_lib.stderrWrite(`[${caller}] command '${cmd.join(" ")}' failed: ${combined}\n`);
    }
    return result.returncode;
  },

  // Probes whether ANY pane in target has the EXACT given title; returns 0 if exists, 1 if not.
  tmux_paneHasTitle(target: string, title: string): number {
    const titles: string[] = tmux_lib.tmux_listPanes(target, "-F", "#{pane_title}");
    return titles.includes(title) ? 0 : 1;
  },

  // Kills every pane in the target's window except the target, via `tmux kill-pane -a -t <target>`.
  tmux_killOtherPanes(pane_target: string): number {
    const cmd: string[] = ["tmux", "kill-pane", "-a", "-t", pane_target];
    const result: RunResult = tmux_lib.run(cmd, { capture_output: true, text: true, check: false });
    if (result.returncode !== 0) {
      const caller: string = tmux_lib.callerName();
      const combined: string = (result.stdout || "") + (result.stderr || "");
      tmux_lib.stderrWrite(`[${caller}] command '${cmd.join(" ")}' failed: ${combined}\n`);
    }
    return result.returncode;
  },

  // True if tmux still finds the pane.
  tmux_paneExists(pane_target: string): boolean {
    return tmux_lib.tmux_hasSession(pane_target) === 0;
  },

  // Writes the pane's visible text to `path`.
  tmux_capturePaneToFile(pane_target: string, path: string): void {
    writeFileSync(path, tmux_lib.tmux_capturePane(pane_target));
  },
};
