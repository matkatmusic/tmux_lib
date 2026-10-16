import { constants } from "node:os";

export type RunResult = { returncode: number; stdout: string; stderr: string };

class OSError extends Error {}
class FileNotFoundError extends OSError {}

const LINE_BREAKS: RegExp = new RegExp("\\r\\n|[\\n\\r\\v\\f\\x1c-\\x1e\\x85\\u2028\\u2029]");

export const tmux_lib_internal = {
  OSError: OSError,
  FileNotFoundError: FileNotFoundError,

  // Stand-in for subprocess.run(argv, capture_output=True, text=True, check=False).
  run(argv: string[]): RunResult {
    let proc: Bun.SyncSubprocess<"pipe", "pipe">;
    try {
      proc = Bun.spawnSync(argv, { stdout: "pipe", stderr: "pipe" });
    }
    catch (e: unknown) {
      const code: unknown = (e as { code?: unknown }).code;
      const message: string = e instanceof Error ? e.message : String(e);
      if (code === "ENOENT")
        throw new FileNotFoundError(message);
      throw new OSError(message);
    }
    const returncode: number =
      proc.exitCode ?? -(constants.signals[proc.signalCode as keyof typeof constants.signals] as number);
    return { returncode, stdout: proc.stdout.toString(), stderr: proc.stderr.toString() };
  },

  // Stand-in for str.splitlines().
  splitlines(text: string): string[] {
    const lines: string[] = text.split(LINE_BREAKS);
    if (lines[lines.length - 1] === "")
      lines.pop();
    return lines;
  },

  _tmux_default_runner(argv: string[]): number {
    const proc: RunResult = tmux_lib_internal.run(argv);
    return proc.returncode;
  },

  _tmux_run(...args: string[]): string {
    try {
      const result: RunResult = tmux_lib_internal.run(["tmux", ...args]);
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
      const result: RunResult = tmux_lib_internal.run(["tmux", "has-session", "-t", session]);
      return result.returncode === 0;
    }
    catch (e: unknown) {
      if (e instanceof FileNotFoundError)
        return false;
      throw e;
    }
  },

  _tmux_default_send(pane: string, keys: string): void {
    tmux_lib_internal.run(["tmux", "send-keys", "-t", pane, keys]);
  },

  _tmux_live_pane_ids(): Set<string> {
    let proc: RunResult;
    try {
      proc = tmux_lib_internal.run(["tmux", "list-panes", "-a", "-F", "#{pane_id}"]);
    }
    catch (e: unknown) {
      if (e instanceof OSError)
        return new Set<string>();
      throw e;
    }
    if (proc.returncode !== 0)
      return new Set<string>();
    return new Set<string>(
      tmux_lib_internal
        .splitlines(proc.stdout)
        .map((line: string): string => line.trim())
        .filter((line: string): boolean => line !== ""),
    );
  },

  _tmux_kill_pane(pane_id: string): void {
    tmux_lib_internal.run(["tmux", "kill-pane", "-t", pane_id]);
  },

  _tmux_paneCurrentCommand(pane_id: string): string {
    let out: RunResult;
    try {
      out = tmux_lib_internal.run(["tmux", "display-message", "-p", "-t", pane_id, "#{pane_current_command}"]);
    }
    catch (e: unknown) {
      if (e instanceof OSError)
        return "";
      throw e;
    }
    if (out.returncode !== 0)
      return "";
    return out.stdout.trim();
  },

  _tmux_listLivePaneIds(window_target: string): Set<string> {
    let out: RunResult;
    try {
      out = tmux_lib_internal.run(["tmux", "list-panes", "-t", window_target, "-F", "#{pane_id}"]);
    }
    catch (e: unknown) {
      if (e instanceof OSError)
        return new Set<string>();
      throw e;
    }
    if (out.returncode !== 0)
      return new Set<string>();
    return new Set<string>(
      tmux_lib_internal
        .splitlines(out.stdout)
        .map((line: string): string => line.trim())
        .filter((line: string): boolean => line !== ""),
    );
  },
};
