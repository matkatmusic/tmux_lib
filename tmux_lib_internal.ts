import {
  CalledProcessError,
  FileNotFoundError,
  IndexError,
  LookupError,
  NotADirectoryError,
  OSError,
  PermissionError,
  SubprocessError,
  ValueError,
} from "./tmux_lib_internal_errors.ts";
import { UnicodeDecodeError, UnicodeEncodeError, UnicodeError } from "./tmux_lib_internal_unicode.ts";
import { executeRun, type BytesRunResult, type RunFn, type RunResult } from "./tmux_lib_internal_run.ts";

export type { BytesRunOptions, BytesRunResult, RunFn, RunResult, TextRunOptions } from "./tmux_lib_internal_run.ts";

const LINE_BREAKS: RegExp = new RegExp("\\r\\n|[\\n\\r\\v\\f\\x1c-\\x1e\\x85\\u2028\\u2029]");
// Every char c where Python c.isspace() is True.
const PY_WHITESPACE: string = "\\t-\\r\\x1c-\\x20\\x85\\xa0\\u1680\\u2000-\\u200a\\u2028\\u2029\\u202f\\u205f\\u3000";
const PY_STRIP: RegExp = new RegExp(`^[${PY_WHITESPACE}]+|[${PY_WHITESPACE}]+$`, "g");

export const tmux_lib_internal = {
  OSError: OSError,
  FileNotFoundError: FileNotFoundError,
  PermissionError: PermissionError,
  NotADirectoryError: NotADirectoryError,
  LookupError: LookupError,
  IndexError: IndexError,
  ValueError: ValueError,
  UnicodeError: UnicodeError,
  UnicodeDecodeError: UnicodeDecodeError,
  UnicodeEncodeError: UnicodeEncodeError,
  SubprocessError: SubprocessError,
  CalledProcessError: CalledProcessError,

  run: executeRun as unknown as RunFn,

  // Stand-in for str.strip().
  strip(text: string): string {
    return text.replace(PY_STRIP, "");
  },

  // Stand-in for str.splitlines().
  splitlines(text: string): string[] {
    const lines: string[] = text.split(LINE_BREAKS);
    if (lines[lines.length - 1] === "")
      lines.pop();
    return lines;
  },

  _tmux_default_runner(argv: string[]): number {
    const proc: BytesRunResult = tmux_lib_internal.run(argv, { stdout: "DEVNULL", stderr: "DEVNULL", check: false });
    return proc.returncode;
  },

  _tmux_run(...args: string[]): string {
    try {
      const result: RunResult = tmux_lib_internal.run(["tmux", ...args], { capture_output: true, text: true });
      return (result.stdout + result.stderr).replace(/\n+$/, "");
    }
    catch (e: unknown) {
      if (e instanceof FileNotFoundError)
        return "(tmux not found)";
      throw e;
    }
  },

  _tmux_session_exists(session: string): boolean {
    try {
      const result: BytesRunResult = tmux_lib_internal.run(["tmux", "has-session", "-t", session], { capture_output: true });
      return result.returncode === 0;
    }
    catch (e: unknown) {
      if (e instanceof FileNotFoundError)
        return false;
      throw e;
    }
  },

  _tmux_default_send(pane: string, keys: string): void {
    tmux_lib_internal.run(["tmux", "send-keys", "-t", pane, keys], { stdout: "DEVNULL", stderr: "DEVNULL", check: false });
  },

  _tmux_live_pane_ids(): Set<string> {
    let proc: RunResult;
    try {
      proc = tmux_lib_internal.run(["tmux", "list-panes", "-a", "-F", "#{pane_id}"], { capture_output: true, text: true, check: false });
    }
    catch (e: unknown) {
      if (e instanceof OSError)
        return new Set<string>();
      throw e;
    }
    if (proc.returncode !== 0)
      return new Set<string>();
    const paneIds: Set<string> = new Set<string>();
    for (const line of tmux_lib_internal.splitlines(proc.stdout)) {
      const stripped: string = tmux_lib_internal.strip(line);
      const isNonEmpty: boolean = stripped !== "";
      if (isNonEmpty)
        paneIds.add(stripped);
    }
    return paneIds;
  },

  _tmux_kill_pane(pane_id: string): void {
    tmux_lib_internal.run(["tmux", "kill-pane", "-t", pane_id], { capture_output: true, check: false });
  },

  _tmux_paneCurrentCommand(pane_id: string): string {
    let out: RunResult;
    try {
      out = tmux_lib_internal.run(["tmux", "display-message", "-p", "-t", pane_id, "#{pane_current_command}"], { check: false, capture_output: true, text: true });
    }
    catch (e: unknown) {
      if (e instanceof OSError)
        return "";
      throw e;
    }
    if (out.returncode !== 0)
      return "";
    return tmux_lib_internal.strip(out.stdout);
  },

  _tmux_listLivePaneIds(window_target: string): Set<string> {
    let out: RunResult;
    try {
      out = tmux_lib_internal.run(["tmux", "list-panes", "-t", window_target, "-F", "#{pane_id}"], { check: false, capture_output: true, text: true });
    }
    catch (e: unknown) {
      if (e instanceof OSError)
        return new Set<string>();
      throw e;
    }
    if (out.returncode !== 0)
      return new Set<string>();
    const paneIds: Set<string> = new Set<string>();
    for (const line of tmux_lib_internal.splitlines(out.stdout)) {
      const stripped: string = tmux_lib_internal.strip(line);
      const isNonEmpty: boolean = stripped !== "";
      if (isNonEmpty)
        paneIds.add(stripped);
    }
    return paneIds;
  },
};
