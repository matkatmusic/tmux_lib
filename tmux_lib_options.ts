import { tmux_lib } from "./tmux_lib.ts";
import { tmux_lib_internal, type RunResult } from "./tmux_lib_internal.ts";

export const tmux_lib_options = {
  // Returns 0 if the tmux version meets `minimum` (format "M.m"), else 1 with a stderr diagnostic.
  tmux_requireVersion(minimum: string): number {
    let proc: RunResult;
    try {
      proc = tmux_lib.run(["tmux", "-V"], { capture_output: true, text: true, check: false });
    }
    catch (e: unknown) {
      if (e instanceof tmux_lib_internal.FileNotFoundError) {
        tmux_lib.stderrWrite("[tmux] tmux is not installed\n");
        return 1;
      }
      throw e;
    }

    const match: RegExpMatchArray | null = (proc.stdout || "").match(tmux_lib._TMUX_VERSION_RE);
    if (!match) {
      tmux_lib.stderrWrite("[tmux] tmux is not installed\n");
      return 1;
    }
    const installed: [bigint, bigint] = [tmux_lib._pyInt(match[1]!), tmux_lib._pyInt(match[2]!)];

    const req_match: RegExpMatchArray | null = minimum.match(tmux_lib._TMUX_VERSION_RE);
    if (!req_match) {
      tmux_lib.stderrWrite(`[tmux] invalid minimum version: ${minimum}\n`);
      return 1;
    }
    const required: [bigint, bigint] = [tmux_lib._pyInt(req_match[1]!), tmux_lib._pyInt(req_match[2]!)];

    const majorLower: boolean = installed[0] < required[0];
    const majorEqual: boolean = installed[0] === required[0];
    const minorLower: boolean = installed[1] < required[1];
    const belowRequired: boolean = majorLower || (majorEqual && minorLower);
    if (belowRequired) {
      const found: string = `${installed[0]}.${installed[1]}`;
      tmux_lib.stderrWrite(`[tmux] tmux ${minimum}+ required (found ${found})\n`);
      return 1;
    }
    return 0;
  },

  // Runs `tmux set-option` with the args; returns the exit code and logs failure with the caller name.
  tmux_setOption(...args: string[]): number {
    const cmd: string[] = ["tmux", "set-option", ...args];
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

  // Sets a tmux option scoped to a target (session, window, or pane) via the -t flag.
  tmux_setOptionForTarget(target: string, name: string, value: string): number {
    let rc: number;
    rc = tmux_lib.tmux_setOption("-t", target, name, value); // not a tail call: keeps this frame for callerName
    return rc;
  },

  // Sets a tmux option in the global scope via the -g flag.
  tmux_setOptionGlobally(name: string, value: string): number {
    let rc: number;
    rc = tmux_lib.tmux_setOption("-g", name, value);
    return rc;
  },

  // Sets a window-scoped tmux option on the given window target via the -w -t flags.
  tmux_setOptionForWindow(window_target: string, name: string, value: string): number {
    let rc: number;
    rc = tmux_lib.tmux_setOption("-w", "-t", window_target, name, value);
    return rc;
  },
};
