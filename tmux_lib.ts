import { tmux_lib_internal, type RunResult } from "./tmux_lib_internal.ts";

export const tmux_lib = {
  _TMUX_VERSION_RE: /(\d+)\.(\d+)/ as RegExp,

  // Re-exports of tmux_lib_internal (Python: `from tmux_lib_internal import ...`).
  _tmux_default_runner: tmux_lib_internal._tmux_default_runner,
  _tmux_run: tmux_lib_internal._tmux_run,
  _tmux_session_exists: tmux_lib_internal._tmux_session_exists,
  _tmux_default_send: tmux_lib_internal._tmux_default_send,
  _tmux_live_pane_ids: tmux_lib_internal._tmux_live_pane_ids,
  _tmux_kill_pane: tmux_lib_internal._tmux_kill_pane,
  _tmux_paneCurrentCommand: tmux_lib_internal._tmux_paneCurrentCommand,
  _tmux_listLivePaneIds: tmux_lib_internal._tmux_listLivePaneIds,

  // Side-effect seams (Python: subprocess.run, time.sleep, print(file=sys.stderr), print).
  run(argv: string[]): RunResult {
    return tmux_lib_internal.run(argv);
  },
  sleep(seconds: number): void {
    Bun.sleepSync(seconds * 1000);
  },
  stderrWrite(text: string): void {
    process.stderr.write(text);
  },
  stdoutWrite(text: string): void {
    process.stdout.write(text);
  },

  // Stand-in for the Python call stack: running tmux_* function names, innermost last.
  callStack: [] as string[],
  // Caller name reported when code outside this module calls a tmux_* function. Set it per test.
  externalCaller: "<unknown>",

  // Stand-in for sys._getframe(1).f_code.co_name: the name of the function that called the function calling callerName().
  callerName(): string {
    const stack: string[] = tmux_lib.callStack;
    return stack.length >= 2 ? stack[stack.length - 2]! : tmux_lib.externalCaller;
  },

  // Stand-in for Python's repr() of a str.
  _pyRepr(text: string): string {
    const quote: string = text.includes("'") && !text.includes('"') ? '"' : "'";
    const escaped: string = text
      .replace(/\\/g, "\\\\")
      .replace(/\n/g, "\\n")
      .replace(/\r/g, "\\r")
      .replace(/\t/g, "\\t")
      .split(quote)
      .join("\\" + quote);
    return quote + escaped + quote;
  },

  // Probe installed tmux binary version; return 0 if it meets/exceeds `minimum` (format "M.m"), else 1 with a stderr diagnostic.
  tmux_requireVersion(minimum: string): number {
    let proc: RunResult;
    try {
      proc = tmux_lib.run(["tmux", "-V"]);
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
    const installed: [number, number] = [parseInt(match[1]!, 10), parseInt(match[2]!, 10)];

    const req_match: RegExpMatchArray | null = minimum.match(tmux_lib._TMUX_VERSION_RE);
    if (!req_match) {
      tmux_lib.stderrWrite(`[tmux] invalid minimum version: ${minimum}\n`);
      return 1;
    }
    const required: [number, number] = [parseInt(req_match[1]!, 10), parseInt(req_match[2]!, 10)];

    if (installed[0] < required[0] || (installed[0] === required[0] && installed[1] < required[1])) {
      const found: string = `${installed[0]}.${installed[1]}`;
      tmux_lib.stderrWrite(`[tmux] tmux ${minimum}+ required (found ${found})\n`);
      return 1;
    }
    return 0;
  },

  // Calls `tmux set-option` with the given args, returning the exit code; logs failure with caller name to stderr.
  tmux_setOption(...args: string[]): number {
    const cmd: string[] = ["tmux", "set-option", ...args];
    const result: RunResult = tmux_lib.run(cmd);
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

  // Sets a tmux option scoped to a specific target (session, window, or pane) via the -t flag.
  tmux_setOptionForTarget(target: string, name: string, value: string): number {
    return tmux_lib.tmux_setOption("-t", target, name, value);
  },

  // Sets a tmux option in the global scope via the -g flag.
  tmux_setOptionGlobally(name: string, value: string): number {
    return tmux_lib.tmux_setOption("-g", name, value);
  },

  // Sets a window-scoped tmux option on the given window target via the -w -t flags.
  tmux_setOptionForWindow(window_target: string, name: string, value: string): number {
    return tmux_lib.tmux_setOption("-w", "-t", window_target, name, value);
  },

  // Checks if a tmux session exists. Returns 0 or 1 silently; other codes log to stderr.
  tmux_hasSession(session_name: string): number {
    const cmd: string[] = ["tmux", "has-session", "-t", session_name];
    const result: RunResult = tmux_lib.run(cmd);
    if (result.returncode !== 0 && result.returncode !== 1) {
      const caller: string = tmux_lib.callerName();
      const combined: string = (result.stdout || "") + (result.stderr || "");
      tmux_lib.stderrWrite(`[${caller}] command '${cmd.join(" ")}' failed: ${combined}\n`);
    }
    return result.returncode;
  },

  // Creates a detached tmux session named <session_name>; extra args pass through after `-d -s <name>`.
  tmux_newSession(session_name: string, ...extra_args: string[]): number {
    const cmd: string[] = ["tmux", "new-session", "-d", "-s", session_name, ...extra_args];
    const result: RunResult = tmux_lib.run(cmd);
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
    const result: RunResult = tmux_lib.run(cmd);
    if (result.returncode !== 0) {
      const caller: string = tmux_lib.callerName();
      const combined: string = (result.stdout || "") + (result.stderr || "");
      tmux_lib.stderrWrite(`[${caller}] command '${cmd.join(" ")}' failed: ${combined}\n`);
    }
    return result.returncode;
  },

  // Lists tmux clients attached to a session; returns string[] (one per client), [] on failure with caller-attributed stderr log.
  tmux_listClients(session_name: string): string[] {
    const cmd: string[] = ["tmux", "list-clients", "-t", session_name];
    const result: RunResult = tmux_lib.run(cmd);
    if (result.returncode !== 0) {
      const caller: string = tmux_lib.callerName();
      const combined: string = (result.stdout || "") + (result.stderr || "");
      tmux_lib.stderrWrite(`[${caller}] command '${cmd.join(" ")}' failed: ${combined}\n`);
      return [];
    }
    return (result.stdout || "").split("\n").filter((line: string): boolean => line !== "");
  },

  // Splits <target> with tmux split-window; passes extra args. Prints stdout on success, logs stderr on failure.
  tmux_newPane(target: string, ...extra_args: string[]): number {
    const cmd: string[] = ["tmux", "split-window", "-t", target, ...extra_args];
    const result: RunResult = tmux_lib.run(cmd);
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
    const result: RunResult = tmux_lib.run(cmd);
    if (result.returncode !== 0) {
      const caller: string = tmux_lib.callerName();
      const combined: string = (result.stdout || "") + (result.stderr || "");
      tmux_lib.stderrWrite(`[${caller}] command '${cmd.join(" ")}' failed: ${combined}\n`);
    }
    return result.returncode;
  },

  // Captures the visible contents of a tmux pane; with scrollback_lines, includes that many lines of history via `-S -<lines>`. Returns "" on failure.
  tmux_capturePane(pane_target: string, scrollback_lines: number | undefined = undefined): string {
    const cmd: string[] = ["tmux", "capture-pane", "-p", "-t", pane_target];
    if (scrollback_lines !== undefined) {
      cmd.push("-S", `-${scrollback_lines}`);
    }
    const result: RunResult = tmux_lib.run(cmd);
    if (result.returncode !== 0) {
      const caller: string = tmux_lib.callerName();
      const combined: string = (result.stdout || "") + (result.stderr || "");
      tmux_lib.stderrWrite(`[${caller}] command '${cmd.join(" ")}' failed: ${combined}\n`);
      return "";
    }
    return result.stdout || "";
  },

  // Lists panes for a tmux target; with no extras returns "<pane_id> <pane_title>" per pane; with extras passes them through verbatim and omits the default -F.
  tmux_listPanes(target: string, ...extra_args: string[]): string[] {
    let cmd: string[];
    if (extra_args.length === 0) {
      cmd = ["tmux", "list-panes", "-t", target, "-F", "#{pane_id} #{pane_title}"];
    }
    else {
      cmd = ["tmux", "list-panes", "-t", target, ...extra_args];
    }
    const result: RunResult = tmux_lib.run(cmd);
    if (result.returncode !== 0) {
      const caller: string = tmux_lib.callerName();
      const combined: string = (result.stdout || "") + (result.stderr || "");
      tmux_lib.stderrWrite(`[${caller}] command '${cmd.join(" ")}' failed: ${combined}\n`);
      return [];
    }
    return (result.stdout || "").split("\n").filter((line: string): boolean => line !== "");
  },

  // Selects a tmux pane via `tmux select-pane -t <target>`; returns the exit code, logging failure with caller name.
  tmux_selectPane(pane_target: string): number {
    const cmd: string[] = ["tmux", "select-pane", "-t", pane_target];
    const result: RunResult = tmux_lib.run(cmd);
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
    const result: RunResult = tmux_lib.run(cmd);
    if (result.returncode !== 0) {
      const caller: string = tmux_lib.callerName();
      const combined: string = (result.stdout || "") + (result.stderr || "");
      tmux_lib.stderrWrite(`[${caller}] command '${cmd.join(" ")}' failed: ${combined}\n`);
    }
    return result.returncode;
  },

  // Creates a new tmux window in <session_name> named <window_name>; extra args pass through after `-t <s> -n <w>`.
  tmux_newWindow(session_name: string, window_name: string, ...extra_args: string[]): number {
    const cmd: string[] = ["tmux", "new-window", "-t", session_name, "-n", window_name, ...extra_args];
    const result: RunResult = tmux_lib.run(cmd);
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
    const result: RunResult = tmux_lib.run(cmd);
    if (result.returncode !== 0) {
      const caller: string = tmux_lib.callerName();
      const combined: string = (result.stdout || "") + (result.stderr || "");
      tmux_lib.stderrWrite(`[${caller}] command '${cmd.join(" ")}' failed: ${combined}\n`);
    }
    return result.returncode;
  },

  // Lists windows for a tmux session; with no extras returns "<window_index> <window_name>" per window; with extras passes them through verbatim and omits the default.
  tmux_listWindows(session_name: string, ...extra_args: string[]): string[] {
    let cmd: string[];
    if (extra_args.length === 0) {
      cmd = ["tmux", "list-windows", "-t", session_name, "-F", "#{window_index} #{window_name}"];
    }
    else {
      cmd = ["tmux", "list-windows", "-t", session_name, ...extra_args];
    }
    const result: RunResult = tmux_lib.run(cmd);
    if (result.returncode !== 0) {
      const caller: string = tmux_lib.callerName();
      const combined: string = (result.stdout || "") + (result.stderr || "");
      tmux_lib.stderrWrite(`[${caller}] command '${cmd.join(" ")}' failed: ${combined}\n`);
      return [];
    }
    return (result.stdout || "").split("\n").filter((line: string): boolean => line !== "");
  },

  // Probes whether session has a window with EXACT given name; returns 0 if exists, 1 if not.
  tmux_windowExists(session_name: string, window_name: string): number {
    const windows: string[] = tmux_lib.tmux_listWindows(session_name, "-F", "#{window_name}");
    return windows.includes(window_name) ? 0 : 1;
  },

  // Probes whether ANY pane in target has the EXACT given title; returns 0 if exists, 1 if not.
  tmux_paneHasTitle(target: string, title: string): number {
    const titles: string[] = tmux_lib.tmux_listPanes(target, "-F", "#{pane_title}");
    return titles.includes(title) ? 0 : 1;
  },

  // Splits target horizontally (-h) or vertically (-v); throws for any other direction.
  tmux_splitWindow(target: string, direction: string): number {
    if (direction !== "h" && direction !== "v") {
      throw new Error(`direction must be 'h' or 'v', got ${tmux_lib._pyRepr(direction)}`);
    }
    const cmd: string[] = ["tmux", "split-window", `-${direction}`, "-t", target];
    const result: RunResult = tmux_lib.run(cmd);
    if (result.returncode !== 0) {
      const caller: string = tmux_lib.callerName();
      const combined: string = (result.stdout || "") + (result.stderr || "");
      tmux_lib.stderrWrite(`[${caller}] command '${cmd.join(" ")}' failed: ${combined}\n`);
    }
    return result.returncode;
  },

  // Calls `tmux select-layout -t <target> <layout>`; returns the exit code, logging failure with caller name.
  tmux_selectLayout(target: string, layout: string): number {
    const cmd: string[] = ["tmux", "select-layout", "-t", target, layout];
    const result: RunResult = tmux_lib.run(cmd);
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
    return tmux_lib.tmux_selectLayout(target, "tiled");
  },

  // Sends <text> as keystrokes to a tmux pane via `tmux send-keys -t <target> <text>`; does NOT append Enter.
  tmux_sendKeys(pane_target: string, text: string): number {
    const cmd: string[] = ["tmux", "send-keys", "-t", pane_target, text];
    const result: RunResult = tmux_lib.run(cmd);
    if (result.returncode !== 0) {
      const caller: string = tmux_lib.callerName();
      const combined: string = (result.stdout || "") + (result.stderr || "");
      tmux_lib.stderrWrite(`[${caller}] command '${cmd.join(" ")}' failed: ${combined}\n`);
    }
    return result.returncode;
  },

  // Sends the literal `Enter` keystroke token to a tmux pane via `tmux send-keys -t <target> Enter`.
  tmux_sendEnter(pane_target: string): number {
    const cmd: string[] = ["tmux", "send-keys", "-t", pane_target, "Enter"];
    const result: RunResult = tmux_lib.run(cmd);
    if (result.returncode !== 0) {
      const caller: string = tmux_lib.callerName();
      const combined: string = (result.stdout || "") + (result.stderr || "");
      tmux_lib.stderrWrite(`[${caller}] command '${cmd.join(" ")}' failed: ${combined}\n`);
    }
    return result.returncode;
  },

  // Sends the literal `C-c` (Ctrl-C) token to a tmux pane via `tmux send-keys -t <target> C-c`.
  tmux_sendCtrlC(pane_target: string): number {
    const cmd: string[] = ["tmux", "send-keys", "-t", pane_target, "C-c"];
    const result: RunResult = tmux_lib.run(cmd);
    if (result.returncode !== 0) {
      const caller: string = tmux_lib.callerName();
      const combined: string = (result.stdout || "") + (result.stderr || "");
      tmux_lib.stderrWrite(`[${caller}] command '${cmd.join(" ")}' failed: ${combined}\n`);
    }
    return result.returncode;
  },

  // True if the pane's input box still holds unsubmitted text: a visible line reading `❯ <content>`.
  tmux_inputBoxHoldsText(pane_target: string): boolean {
    const content: string = tmux_lib.tmux_capturePane(pane_target);
    for (const line of tmux_lib_internal.splitlines(content)) {
      const stripped: string = line.trim();
      if (stripped.startsWith("❯") && stripped.slice(1).trim()) {
        return true;
      }
    }
    return false;
  },

  // Sends text to pane, sleeps 0.5s, then sends Enter; if the input box still shows text the Enter is resent (up to 4 retries, 1s apart). Returns first nonzero rc or rc of the last Enter send.
  tmux_sendAndSubmit(pane_target: string, text: string): number {
    const rc1: number = tmux_lib.tmux_sendKeys(pane_target, text);
    if (rc1 !== 0) {
      return rc1;
    }
    tmux_lib.sleep(0.5);
    let rc: number = tmux_lib.tmux_sendEnter(pane_target);
    for (let i: number = 0; i < 4; i++) {
      tmux_lib.sleep(1.0);
      if (!tmux_lib.tmux_inputBoxHoldsText(pane_target)) {
        break;
      }
      rc = tmux_lib.tmux_sendEnter(pane_target);
    }
    return rc;
  },

  // Repeatedly sends Ctrl-C (up to 5 times) until the pane buffer contains a 'Ctrl-C' marker, then submits the replacement text; logs label + Ctrl-C count when at least one retry was needed.
  tmux_cancelAndSend(pane_target: string, text: string, label: string | undefined = undefined): number {
    const MAX_ATTEMPTS: number = 5;
    let attempts: number = 0;
    for (let i: number = 1; i <= MAX_ATTEMPTS; i++) {
      attempts = i;
      tmux_lib.tmux_sendCtrlC(pane_target);
      tmux_lib.sleep(0.2);
      if (tmux_lib.tmux_capturePane(pane_target).includes("Ctrl-C")) {
        break;
      }
    }
    if (attempts > 1 && label) {
      tmux_lib.stdoutWrite(`[tmux] cancelled in-progress work: ${label} (${attempts} Ctrl-C's)\n`);
    }
    return tmux_lib.tmux_sendAndSubmit(pane_target, text);
  },

  // Splits target via tmux split-window with -c <cwd> -P -F '#{pane_id}', launching cmd; returns the resulting pane id. Returns undefined on tmux failure or empty pane id.
  tmux_splitWorkerPane(target: string, cwd: string, cmd: string): string | undefined {
    const argv: string[] = ["tmux", "split-window", "-t", target, "-c", cwd, "-P", "-F", "#{pane_id}", cmd];
    const result: RunResult = tmux_lib.run(argv);
    if (result.returncode !== 0) {
      const caller: string = tmux_lib.callerName();
      const combined: string = (result.stdout || "") + (result.stderr || "");
      tmux_lib.stderrWrite(`[${caller}] command '${argv.join(" ")}' failed: ${combined}\n`);
      return undefined;
    }
    const pane_id: string = (result.stdout || "").trim();
    if (!pane_id) {
      return undefined;
    }
    return pane_id;
  },

  // Polls pane content for the Claude TUI ready glyph (❯, U+276F) every 0.5s up to timeout*2 attempts; returns 0 on detect, 1 on timeout. Capture errors are swallowed.
  tmux_waitForClaudeReadiness(pane_id: string, timeout: number = 10): number {
    const max_attempts: number = Math.trunc(timeout) * 2;
    const ready_glyph: string = "❯";
    for (let i: number = 0; i < max_attempts; i++) {
      let content: string;
      try {
        content = tmux_lib.tmux_capturePane(pane_id, 5);
      }
      catch (e: unknown) {
        content = "";
      }
      if ((content || "").includes(ready_glyph)) {
        return 0;
      }
      tmux_lib.sleep(0.5);
    }
    tmux_lib.stderrWrite(
      `[tmux-launcher] tmux_waitForClaudeReadiness: timed out after ${timeout}s waiting for pane '${pane_id}'\n`,
    );
    return 1;
  },

  // Idempotently guarantees a keepalive pane with the requested title exists in a tmux window, creating and retiling only when absent.
  tmux_ensureKeepalivePane(target: string, cwd: string, keepalive_cmd: string, title: string): void {
    if (tmux_lib.tmux_paneHasTitle(target, title) === 0) {
      return;
    }
    const ka_id: string | undefined = tmux_lib.tmux_splitWorkerPane(target, cwd, keepalive_cmd);
    if (ka_id) {
      tmux_lib.tmux_setPaneTitle(ka_id, title);
    }
    tmux_lib.tmux_retile(target);
  },

  // Ensures the named tmux session and window exist with a titled keepalive pane, applying session options on first creation.
  tmux_ensureSession(
    session: string,
    window: string,
    cwd: string,
    keepalive_cmd: string,
    keepalive_title: string,
  ): number {
    if (tmux_lib.tmux_hasSession(session) !== 0) {
      tmux_lib.tmux_newSession(session, "-n", window, "-c", cwd, keepalive_cmd);
      tmux_lib.tmux_setOptionForTarget(session, "remain-on-exit", "off");
      tmux_lib.tmux_setOptionForTarget(session, "mouse", "on");
      tmux_lib.tmux_setOptionForTarget(session, "pane-border-status", "top");
      tmux_lib.tmux_setOptionForTarget(session, "pane-border-format", " #{pane_title} ");
      tmux_lib.tmux_setPaneTitle(`${session}:${window}.0`, keepalive_title);
      return 0;
    }

    if (tmux_lib.tmux_windowExists(session, window) !== 0) {
      tmux_lib.tmux_newWindow(session, window, "-c", cwd, keepalive_cmd);
      tmux_lib.tmux_setPaneTitle(`${session}:${window}.0`, keepalive_title);
      return 0;
    }

    tmux_lib.tmux_ensureKeepalivePane(`${session}:${window}`, cwd, keepalive_cmd, keepalive_title);
    return 0;
  },

  _tmux_backgroundKill(pane_target: string, retile_target: string = "jot:jots"): void {
    tmux_lib.tmux_killPane(pane_target);
    tmux_lib.tmux_retile(retile_target);
  },
};

// Track the running tmux_* function names in callStack so callerName() can report the caller.
const members: Record<string, (...args: never[]) => unknown> = tmux_lib as unknown as Record<string, (...args: never[]) => unknown>;
for (const name of Object.keys(members)) {
  if (!name.startsWith("tmux_") && name !== "_tmux_backgroundKill")
    continue;
  const original: (...args: never[]) => unknown = members[name]!;
  members[name] = (...args: never[]): unknown => {
    tmux_lib.callStack.push(name);
    try {
      return original(...args);
    }
    finally {
      tmux_lib.callStack.pop();
    }
  };
}
