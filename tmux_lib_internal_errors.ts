import { constants } from "node:os";

export const OS_ERROR_TEXT: Record<string, string> = {
  ENOENT: "No such file or directory",
  EACCES: "Permission denied",
  ENOTDIR: "Not a directory",
  ENOEXEC: "Exec format error",
};

export class OSError extends Error {
  override name: string = "OSError";
  errno: number | null;
  strerror: string | null;
  filename: string | null;

  constructor(messageOrErrno: string | number, strerror: string | null = null, filename: string | null = null) {
    let message: string = String(messageOrErrno);
    if (typeof messageOrErrno === "number") {
      message = `[Errno ${messageOrErrno}] ${strerror}`;
      if (filename !== null)
        message += `: ${formatPyStr(filename)}`;
    }
    super(message);
    this.errno = typeof messageOrErrno === "number" ? messageOrErrno : null;
    this.strerror = strerror;
    this.filename = filename;
  }
}
export class FileNotFoundError extends OSError {
  override name: string = "FileNotFoundError";
}
export class PermissionError extends OSError {
  override name: string = "PermissionError";
}
export class NotADirectoryError extends OSError {
  override name: string = "NotADirectoryError";
}
export class LookupError extends Error {
  override name: string = "LookupError";
}
export class IndexError extends LookupError {
  override name: string = "IndexError";
}
export class ValueError extends Error {
  override name: string = "ValueError";
}

export function buildOsError(code: string, filename: string): OSError {
  const errno: number = constants.errno[code as keyof typeof constants.errno];
  const strerror: string = OS_ERROR_TEXT[code]!;
  if (code === "ENOENT")
    return new FileNotFoundError(errno, strerror, filename);
  if (code === "EACCES")
    return new PermissionError(errno, strerror, filename);
  if (code === "ENOTDIR")
    return new NotADirectoryError(errno, strerror, filename);
  return new OSError(errno, strerror, filename);
}

// ponytail: simple str repr, ASCII escapes only. The full one, tmux_lib._pyRepr, would make an import cycle.
export function formatPyStr(text: string): string {
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

export class SubprocessError extends Error {
  override name: string = "SubprocessError";
}

// Stand-in for subprocess.CalledProcessError.
export class CalledProcessError extends SubprocessError {
  override name: string = "CalledProcessError";
  returncode: number;
  cmd: string[];
  stdout: string | Uint8Array | null;
  stderr: string | Uint8Array | null;

  constructor(returncode: number, cmd: string[], stdout: string | Uint8Array | null, stderr: string | Uint8Array | null) {
    const quotedArgs: string[] = [];
    for (const arg of cmd) {
      quotedArgs.push(formatPyStr(arg));
    }
    super(`Command '[${quotedArgs.join(", ")}]' returned non-zero exit status ${returncode}.`);
    this.returncode = returncode;
    this.cmd = cmd;
    this.stdout = stdout;
    this.stderr = stderr;
  }

  get output(): string | Uint8Array | null {
    return this.stdout;
  }

  set output(value: string | Uint8Array | null) {
    this.stdout = value;
  }
}
