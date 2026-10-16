import { constants } from "node:os";

// Keyword args of Python subprocess.run that the call sites pass.
export type BytesRunOptions = { capture_output?: true; check?: boolean; stdout?: "DEVNULL"; stderr?: "DEVNULL" };
export type TextRunOptions = { capture_output: true; text: true; check?: boolean };
export type RunResult = { returncode: number; stdout: string; stderr: string };
export type BytesRunResult = { returncode: number; stdout: Uint8Array | null; stderr: Uint8Array | null };
export type RunFn = {
  (argv: string[], options: BytesRunOptions): BytesRunResult;
  (argv: string[], options: TextRunOptions): RunResult;
};

class OSError extends Error {}
class FileNotFoundError extends OSError {}
class ValueError extends Error {}
class UnicodeError extends ValueError {}
class UnicodeDecodeError extends UnicodeError {}

// ponytail: simple Python str repr (ASCII escapes only). tmux_lib._pyRepr is the full one, but importing it here makes a cycle.
function quotePyStr(text: string): string {
  const quote: string = text.includes("'") && !text.includes('"') ? '"' : "'";
  let repr: string = "";
  for (const ch of text) {
    const cp: number = ch.codePointAt(0)!;
    const isQuote: boolean = ch === quote;
    const isBackslash: boolean = ch === "\\";
    const needsBackslash: boolean = isQuote || isBackslash;
    const isControl: boolean = cp < 0x20 || cp === 0x7f;
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
    else if (isControl) {
      repr += "\\x" + cp.toString(16).padStart(2, "0");
    }
    else {
      repr += ch;
    }
  }
  return quote + repr + quote;
}

// Stand-in for subprocess.CalledProcessError.
class CalledProcessError extends Error {
  returncode: number;
  cmd: string[];
  stdout: string | Uint8Array | null;
  stderr: string | Uint8Array | null;

  constructor(returncode: number, cmd: string[], stdout: string | Uint8Array | null, stderr: string | Uint8Array | null) {
    const quotedArgs: string[] = [];
    for (const arg of cmd) {
      quotedArgs.push(quotePyStr(arg));
    }
    super(`Command '[${quotedArgs.join(", ")}]' returned non-zero exit status ${returncode}.`);
    this.returncode = returncode;
    this.cmd = cmd;
    this.stdout = stdout;
    this.stderr = stderr;
  }
}

const LINE_BREAKS: RegExp = new RegExp("\\r\\n|[\\n\\r\\v\\f\\x1c-\\x1e\\x85\\u2028\\u2029]");
// Every char c where Python c.isspace() is True.
const PY_WHITESPACE: string = "\\t-\\r\\x1c-\\x20\\x85\\xa0\\u1680\\u2000-\\u200a\\u2028\\u2029\\u202f\\u205f\\u3000";
const PY_STRIP: RegExp = new RegExp(`^[${PY_WHITESPACE}]+|[${PY_WHITESPACE}]+$`, "g");
const UTF8_STRICT: TextDecoder = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });

function formatDecodeError(bytes: Uint8Array, start: number, end: number, reason: string): string {
  const prefix: string = "'utf-8' codec can't decode";
  if (end - start === 1) {
    return `${prefix} byte 0x${bytes[start]!.toString(16).padStart(2, "0")} in position ${start}: ${reason}`;
  }
  return `${prefix} bytes in position ${start}-${end - 1}: ${reason}`;
}

// Finds the first bad UTF-8 sequence the way CPython does and builds its UnicodeDecodeError message.
function buildDecodeErrorMessage(bytes: Uint8Array): string {
  let start: number = 0;
  while (start < bytes.length) {
    const lead: number = bytes[start]!;
    let continuations: number = 0;
    if (lead >= 0xc2 && lead <= 0xdf) {
      continuations = 1;
    }
    else if (lead >= 0xe0 && lead <= 0xef) {
      continuations = 2;
    }
    else if (lead >= 0xf0 && lead <= 0xf4) {
      continuations = 3;
    }
    else if (lead >= 0x80) {
      return formatDecodeError(bytes, start, start + 1, "invalid start byte");
    }
    for (let offset: number = 1; offset <= continuations; offset++) {
      if (start + offset >= bytes.length) {
        return formatDecodeError(bytes, start, bytes.length, "unexpected end of data");
      }
      let low: number = 0x80;
      let high: number = 0xbf;
      if (offset === 1) {
        if (lead === 0xe0) {
          low = 0xa0;
        }
        else if (lead === 0xed) {
          high = 0x9f;
        }
        else if (lead === 0xf0) {
          low = 0x90;
        }
        else if (lead === 0xf4) {
          high = 0x8f;
        }
      }
      const next: number = bytes[start + offset]!;
      const outOfRange: boolean = next < low || next > high;
      if (outOfRange) {
        return formatDecodeError(bytes, start, start + offset, "invalid continuation byte");
      }
    }
    start += continuations + 1;
  }
  throw new Error("strict UTF-8 decode failed but no bad sequence was found");
}

function decodeText(bytes: Uint8Array): string {
  let text: string;
  try {
    text = UTF8_STRICT.decode(bytes);
  }
  catch {
    throw new UnicodeDecodeError(buildDecodeErrorMessage(bytes));
  }
  return text.replace(/\r\n?/g, "\n");
}

// Stand-in for subprocess.run(argv, **options).
function executeRun(argv: string[], options: BytesRunOptions | TextRunOptions): BytesRunResult | RunResult {
  for (const arg of argv) {
    const hasNullByte: boolean = arg.includes("\0");
    if (hasNullByte)
      throw new ValueError("embedded null byte");
  }
  const selectRedirect = (stream: "DEVNULL" | undefined): "ignore" | "pipe" | "inherit" =>
    stream === "DEVNULL" ? "ignore" : options.capture_output ? "pipe" : "inherit";
  let proc: Bun.SyncSubprocess;
  try {
    proc = Bun.spawnSync(argv, {
      stdin: "inherit",
      stdout: selectRedirect((options as BytesRunOptions).stdout),
      stderr: selectRedirect((options as BytesRunOptions).stderr),
      env: process.env,
    });
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
  const collect = (bytes: Uint8Array | undefined): string | Uint8Array | null => {
    if (bytes === undefined)
      return null;
    return "text" in options ? decodeText(bytes) : bytes;
  };
  const stdout: string | Uint8Array | null = collect(proc.stdout);
  const stderr: string | Uint8Array | null = collect(proc.stderr);
  const failedWithCheck: boolean = options.check === true && returncode !== 0;
  if (failedWithCheck)
    throw new CalledProcessError(returncode, argv, stdout, stderr);
  return { returncode, stdout, stderr } as BytesRunResult | RunResult;
}

export const tmux_lib_internal = {
  OSError: OSError,
  FileNotFoundError: FileNotFoundError,
  ValueError: ValueError,
  UnicodeError: UnicodeError,
  UnicodeDecodeError: UnicodeDecodeError,
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
    return new Set<string>(
      tmux_lib_internal
        .splitlines(proc.stdout)
        .map((line: string): string => tmux_lib_internal.strip(line))
        .filter((line: string): boolean => line !== ""),
    );
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
    return new Set<string>(
      tmux_lib_internal
        .splitlines(out.stdout)
        .map((line: string): string => tmux_lib_internal.strip(line))
        .filter((line: string): boolean => line !== ""),
    );
  },
};
