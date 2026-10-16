import { writeFileSync } from "node:fs";
import { tmux_lib_internal,type BytesRunOptions, type RunFn, type RunResult, type TextRunOptions } from "./tmux_lib_internal.ts";

if (process.env.BUN_JSC_useTailCalls !== "0") {
  throw new Error(
    "Start Bun with BUN_JSC_useTailCalls=0. Bun drops the stack frame of a function that ends with `return f()`, so callerName() would name the wrong caller.",
  );
}

// ponytail: the set Bun assigns but Python 3.14 (unicodedata 16.0.0) does not. Regenerate it when either side updates Unicode.
const PY_UNASSIGNED: string = String.raw`\u{88F}\u{C5C}\u{CDC}\u{1ACF}-\u{1ADD}\u{1AE0}-\u{1AEB}\u{20C1}\u{2B96}\u{A7CE}-\u{A7CF}\u{A7D2}\u{A7D4}\u{A7F1}\u{FBC3}-\u{FBD2}\u{FD90}-\u{FD91}\u{FDC8}-\u{FDCE}\u{10940}-\u{10959}\u{10EC5}-\u{10EC7}\u{10ED0}-\u{10ED8}\u{10EFA}-\u{10EFB}\u{11B60}-\u{11B67}\u{11DB0}-\u{11DDB}\u{11DE0}-\u{11DE9}\u{16EA0}-\u{16EB8}\u{16EBB}-\u{16ED3}\u{16FF2}-\u{16FF6}\u{187F8}-\u{187FF}\u{18D09}-\u{18D1E}\u{18D80}-\u{18DF2}\u{1CCFA}-\u{1CCFC}\u{1CEBA}-\u{1CED0}\u{1CEE0}-\u{1CEF0}\u{1E6C0}-\u{1E6DE}\u{1E6E0}-\u{1E6F5}\u{1E6FE}-\u{1E6FF}\u{1F6D8}\u{1F777}-\u{1F77A}\u{1F8D0}-\u{1F8D8}\u{1FA54}-\u{1FA57}\u{1FA8A}\u{1FA8E}\u{1FAC8}\u{1FACD}\u{1FAEA}\u{1FAEF}\u{1FBFA}\u{2B73A}-\u{2B73F}\u{2CEA2}-\u{2CEAD}\u{323B0}-\u{33479}`;
const PY_NOT_PRINTABLE: RegExp = new RegExp(`^[\\p{C}\\p{Z}${PY_UNASSIGNED}]$`, "u");
const PY_DIGIT_CLASS: string = `[\\p{Nd}--[${PY_UNASSIGNED}]]`;
const PY_DIGIT: RegExp = new RegExp(`^${PY_DIGIT_CLASS}$`, "v");

export const tmux_lib = {
  _TMUX_VERSION_RE: new RegExp(`(${PY_DIGIT_CLASS}+)\\.(${PY_DIGIT_CLASS}+)`, "v") as RegExp,

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
  run: ((argv: string[], options: BytesRunOptions | TextRunOptions): unknown =>
    tmux_lib_internal.run(argv, options as BytesRunOptions)) as RunFn,
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
  // callStack: [] as string[],
  // Caller name reported when code outside this module calls a tmux_* function. Set it per test.
  // externalCaller: "<unknown>",

  // Stand-in for sys._getframe(1).f_code.co_name: the name of the function that called the function calling callerName().
  callerName(): string {
    // stack lines: "Error", callerName, the tmux_* function, its caller
    const frame: string = new Error().stack!.split("\n")[3]!.trim();
    const named: RegExpMatchArray | null = frame.match(/^at (\S+) \(/);
    const frameName: string = named ? named[1]! : "<module>";
    if (frameName === "<anonymous>") {
      return "<lambda>";
    }
    return frameName;
  },

  // Stand-in for Python's repr() of a str.
  _pyRepr(text: string): string {
    const quote: string = text.includes("'") && !text.includes('"') ? '"' : "'";
    let repr: string = "";
    for (const ch of text) {
      const cp: number = ch.codePointAt(0)!;
      const isQuote: boolean = ch === quote;
      const isBackslash: boolean = ch === "\\";
      const needsBackslash: boolean = isQuote || isBackslash;
      const isSpace: boolean = ch === " ";
      const isNotPrintable: boolean = PY_NOT_PRINTABLE.test(ch);
      const needsHexEscape: boolean = !isSpace && isNotPrintable;
      if (needsBackslash) {
        repr += "\\" + ch;
      }
      else if (ch === "\n") {
        repr += "\\n";
      }
      else if (ch === "\r") {
        repr += "\\r";
      }
      else if (ch === "\t") {
        repr += "\\t";
      }
      else if (needsHexEscape) {
        const hex: string = cp.toString(16);
        if (cp <= 0xff) {
          repr += "\\x" + hex.padStart(2, "0");
        }
        else if (cp <= 0xffff) {
          repr += "\\u" + hex.padStart(4, "0");
        }
        else {
          repr += "\\U" + hex.padStart(8, "0");
        }
      }
      else {
        repr += ch;
      }
    }
    return quote + repr + quote;
  },

  // Stand-in for int() on a str of Unicode decimal digits.
  _pyInt(digits: string): bigint {
    let value: bigint = 0n;
    for (const ch of digits) {
      const cp: number = ch.codePointAt(0)!;
      let zero: number = cp;
      let previousIsDigit: boolean = PY_DIGIT.test(String.fromCodePoint(zero - 1));
      while (previousIsDigit) {
        zero -= 1;
        previousIsDigit = PY_DIGIT.test(String.fromCodePoint(zero - 1));
      }
      value = value * 10n + BigInt((cp - zero) % 10);
    }
    return value;
  },

  // Probe installed tmux binary version; return 0 if it meets/exceeds `minimum` (format "M.m"), else 1 with a stderr diagnostic.
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

  // Calls `tmux set-option` with the given args, returning the exit code; logs failure with caller name to stderr.
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

  // Sets a tmux option scoped to a specific target (session, window, or pane) via the -t flag.
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

  // Lists tmux clients attached to a session; returns string[] (one per client), [] on failure with caller-attributed stderr log.
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

  // Splits <target> with tmux split-window; passes extra args. Prints stdout on success, logs stderr on failure.
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

  // Captures a tmux pane's visible text; scrollback_lines adds history via `-S -<lines>`. Returns "" on failure.
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

  // Lists panes for a tmux target: default "<pane_id> <pane_title>" per pane; extras pass through verbatim, replacing -F.
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

  // Selects a tmux pane via `tmux select-pane -t <target>`; returns the exit code, logging failure with caller name.
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

  // Creates a new tmux window in <session_name> named <window_name>; extra args pass through after `-t <s> -n <w>`.
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

  // Probes whether ANY pane in target has the EXACT given title; returns 0 if exists, 1 if not.
  tmux_paneHasTitle(target: string, title: string): number {
    const titles: string[] = tmux_lib.tmux_listPanes(target, "-F", "#{pane_title}");
    return titles.includes(title) ? 0 : 1;
  },

  // Splits target horizontally (-h) or vertically (-v); throws for any other direction.
  tmux_splitWindow(target: string, direction: string): number {
    if (direction !== "h" && direction !== "v") {
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

  // Calls `tmux select-layout -t <target> <layout>`; returns the exit code, logging failure with caller name.
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

  // Sends <text> as keystrokes to a tmux pane via `tmux send-keys -t <target> <text>`; does NOT append Enter.
  tmux_sendKeys(pane_target: string, text: string): number {
    const cmd: string[] = ["tmux", "send-keys", "-t", pane_target, text];
    const result: RunResult = tmux_lib.run(cmd, { capture_output: true, text: true, check: false });
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
    const result: RunResult = tmux_lib.run(cmd, { capture_output: true, text: true, check: false });
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
    const result: RunResult = tmux_lib.run(cmd, { capture_output: true, text: true, check: false });
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
      const stripped: string = tmux_lib_internal.strip(line);
      if (stripped.startsWith("❯") && tmux_lib_internal.strip(stripped.slice(1))) {
        return true;
      }
    }
    return false;
  },

  // Sends text, then Enter; resends Enter up to 4 times while text remains. Returns first failure code.
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

  // Answers a trust or other "Esc to cancel" dialog shown in `screen`: Down if No is selected, else Enter. True if a dialog was shown.
  tmux_answerDialog(pane_target: string, screen: string): boolean {
    const lowered: string = screen.toLowerCase();
    const is_trust_prompt: boolean = lowered.includes("trust this folder") || lowered.includes("trust the files");
    const is_dialog: boolean = screen.includes("Esc to cancel") || is_trust_prompt;
    const is_no_selected: boolean = screen.includes("❯ No, exit");
    if (is_trust_prompt && is_no_selected) {
      tmux_lib.tmux_sendKeys(pane_target, "Down");
    }
    else if (is_dialog) {
      tmux_lib.tmux_sendEnter(pane_target);
    }
    return is_dialog;
  },

  // Polls the pane up to `polls` times for the ready glyph (❯), answering dialogs; throws if signed out. Returns 0 when ready, 1 on timeout.
  tmux_waitForClaudeReadiness(
    pane_id: string,
    polls: number = 120,
    poll_seconds: number = 1,
    dialog_wait_seconds: number = 2,
  ): number {
    for (let i: number = 0; i < polls; i++) {
      const content: string = tmux_lib.tmux_capturePane(pane_id);
      const lowered: string = content.toLowerCase();
      if (lowered.includes("login method") || lowered.includes("/login")) {
        throw new Error(`Claude is signed out in pane ${pane_id}. Sign in once, then try again.`);
      }
      if (tmux_lib.tmux_answerDialog(pane_id, content)) {
        tmux_lib.sleep(dialog_wait_seconds);
        continue;
      }
      if (content.includes("❯")) {
        return 0;
      }
      tmux_lib.sleep(poll_seconds);
    }
    tmux_lib.stderrWrite(
      `[tmux-launcher] tmux_waitForClaudeReadiness: timed out after ${polls} polls waiting for pane '${pane_id}'\n`,
    );
    return 1;
  },

  // Waits until the pane is not busy (per busy_regex) for settle_seconds after check_activity first reports activity. Returns the first watch_regex match.
  tmux_waitForTurnEnd(
    pane_target: string,
    busy_regex: RegExp,
    settle_seconds: number,
    timeout_seconds: number,
    check_activity: () => boolean,
    watch_regex: RegExp | undefined = undefined,
  ): string | undefined {
    let has_grown: boolean = false;
    let quiet_since: number | undefined = undefined;
    let watch_match: string | undefined = undefined;
    let screen: string = "";
    const deadline: number = Date.now() + timeout_seconds * 1000;
    while (Date.now() < deadline) {
      screen = tmux_lib.tmux_capturePane(pane_target);
      if (watch_regex !== undefined && watch_match === undefined) {
        const found: RegExpMatchArray | null = screen.match(watch_regex);
        if (found) {
          watch_match = found[0];
        }
      }
      if (check_activity()) {
        has_grown = true;
        quiet_since = undefined;
      }
      if (tmux_lib.tmux_answerDialog(pane_target, screen)) {
        quiet_since = undefined;
        tmux_lib.sleep(1);
        continue;
      }
      if (screen.search(busy_regex) !== -1) {
        quiet_since = undefined;
      }
      else if (has_grown && quiet_since === undefined) {
        quiet_since = Date.now();
      }
      if (quiet_since !== undefined && Date.now() - quiet_since >= settle_seconds * 1000) {
        return watch_match;
      }
      tmux_lib.sleep(0.5);
    }
    throw new Error(`turn did not end in pane ${pane_target}. Pane:\n${screen}`);
  },

  // True if tmux still finds the pane.
  tmux_paneExists(pane_target: string): boolean {
    return tmux_lib.tmux_hasSession(pane_target) === 0;
  },

  // Polls once a second until the pane is gone, answering dialogs. Returns true if it closed, false after timeout_seconds.
  tmux_waitForPaneClose(pane_target: string, timeout_seconds: number): boolean {
    const deadline: number = Date.now() + timeout_seconds * 1000;
    while (Date.now() < deadline) {
      if (!tmux_lib.tmux_paneExists(pane_target)) {
        return true;
      }
      tmux_lib.tmux_answerDialog(pane_target, tmux_lib.tmux_capturePane(pane_target));
      tmux_lib.sleep(1);
    }
    return false;
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

  // Runs `tmux new-session -s <name>` attached to this terminal; blocks until the session ends. Extra args pass through.
  tmux_newAttachedSession(session_name: string, ...extra_args: string[]): number {
    const cmd: string[] = ["tmux", "new-session", "-s", session_name, ...extra_args];
    const result: { returncode: number } = tmux_lib.run(cmd, { check: false });
    if (result.returncode !== 0) {
      const caller: string = tmux_lib.callerName();
      tmux_lib.stderrWrite(`[${caller}] command '${cmd.join(" ")}' failed\n`);
    }
    return result.returncode;
  },

  // Writes the pane's visible text to `path`.
  tmux_capturePaneToFile(pane_target: string, path: string): void {
    writeFileSync(path, tmux_lib.tmux_capturePane(pane_target));
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

// // Track the running tmux_* function names in callStack so callerName() can report the caller.
// const members: Record<string, (...args: never[]) => unknown> = tmux_lib as unknown as Record<string, (...args: never[]) => unknown>;
// for (const name of Object.keys(members)) {
//   if (!name.startsWith("tmux_") && name !== "_tmux_backgroundKill")
//     continue;
//   const original: (...args: never[]) => unknown = members[name]!;
//   members[name] = (...args: never[]): unknown => {
//     tmux_lib.callStack.push(name);
//     try {
//       return original(...args);
//     }
//     finally {
//       tmux_lib.callStack.pop();
//     }
//   };
// }
