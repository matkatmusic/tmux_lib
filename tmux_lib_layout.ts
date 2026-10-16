import { tmux_lib } from "./tmux_lib.ts";
import { tmux_lib_internal, type RunResult } from "./tmux_lib_internal.ts";

export const tmux_lib_layout = {
  // Splits target horizontally (-h) or vertically (-v); throws for any other direction.
  tmux_splitWindow(target: string, direction: string): number {
    const notHorizontal: boolean = direction !== "h";
    const notVertical: boolean = direction !== "v";
    const isInvalidDirection: boolean = notHorizontal && notVertical;
    if (isInvalidDirection) {
      throw new tmux_lib_internal.ValueError(`direction must be 'h' or 'v', got ${tmux_lib._pyRepr(direction)}`);
    }
    const cmd: string[] = ["tmux", "split-window", `-${direction}`, "-t", target];
    const result: RunResult = tmux_lib.run(cmd, { capture_output: true, text: true, check: false });
    if (result.returncode !== 0) {
      const caller: string = tmux_lib.callerName();
      const combined: string = (result.stdout || "") + (result.stderr || "");
      tmux_lib.stderrWrite(`[${caller}] command '${cmd.join(" ")}' failed: ${combined}\n`);
    }
    return result.returncode;
  },

  // Calls `tmux select-layout -t <target> <layout>`; returns the exit code, logging failure with the caller name.
  tmux_selectLayout(target: string, layout: string): number {
    const cmd: string[] = ["tmux", "select-layout", "-t", target, layout];
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

  // Re-applies the `tiled` layout to the target tmux window via tmux_selectLayout.
  tmux_retile(target: string): number {
    let rc: number;
    rc = tmux_lib.tmux_selectLayout(target, "tiled");
    return rc;
  },

  // Splits target in cwd, running cmd; returns the new pane id, or undefined on failure.
  tmux_splitWorkerPane(target: string, cwd: string, cmd: string): string | undefined {
    const argv: string[] = ["tmux", "split-window", "-t", target, "-c", cwd, "-P", "-F", "#{pane_id}", cmd];
    const result: RunResult = tmux_lib.run(argv, { capture_output: true, text: true, check: false });
    if (result.returncode !== 0) {
      const caller: string = tmux_lib.callerName();
      const combined: string = (result.stdout || "") + (result.stderr || "");
      tmux_lib.stderrWrite(`[${caller}] command '${argv.join(" ")}' failed: ${combined}\n`);
      return undefined;
    }
    const pane_id: string = tmux_lib_internal.strip(result.stdout || "");
    if (!pane_id) {
      return undefined;
    }
    return pane_id;
  },

  // Creates a keepalive pane with the title if absent, then retiles.
  tmux_ensureKeepalivePane(target: string, cwd: string, keepalive_cmd: string, title: string): void {
    const titleCode: number = tmux_lib.tmux_paneHasTitle(target, title);
    if (titleCode === 0) {
      return;
    }
    const ka_id: string | undefined = tmux_lib.tmux_splitWorkerPane(target, cwd, keepalive_cmd);
    if (ka_id) {
      tmux_lib.tmux_setPaneTitle(ka_id, title);
    }
    tmux_lib.tmux_retile(target);
  },

  _tmux_backgroundKill(pane_target: string, retile_target: string = "jot:jots"): void {
    tmux_lib.tmux_killPane(pane_target);
    tmux_lib.tmux_retile(retile_target);
  },
};
