import { ValueError } from "./tmux_lib_internal_errors.ts";

export class UnicodeError extends ValueError {
  override name: string = "UnicodeError";
}

export class UnicodeDecodeError extends UnicodeError {
  override name: string = "UnicodeDecodeError";
  encoding: string;
  object: Uint8Array;
  start: number;
  end: number;
  reason: string;

  constructor(encoding: string, object: Uint8Array, start: number, end: number, reason: string) {
    const where: string = end - start === 1
      ? `byte 0x${object[start]!.toString(16).padStart(2, "0")} in position ${start}`
      : `bytes in position ${start}-${end - 1}`;
    super(`'${encoding}' codec can't decode ${where}: ${reason}`);
    this.encoding = encoding;
    this.object = object;
    this.start = start;
    this.end = end;
    this.reason = reason;
  }
}

export class UnicodeEncodeError extends UnicodeError {
  override name: string = "UnicodeEncodeError";
  encoding: string;
  object: string;
  start: number;
  end: number;
  reason: string;

  constructor(encoding: string, object: string, start: number, end: number, reason: string) {
    let where: string = `characters in position ${start}-${end - 1}`;
    if (end - start === 1) {
      const cp: number = Array.from(object)[start]!.codePointAt(0)!;
      const hex: string = cp.toString(16);
      const escaped: string = cp <= 0xff ? "\\x" + hex.padStart(2, "0") : cp <= 0xffff ? "\\u" + hex.padStart(4, "0") : "\\U" + hex.padStart(8, "0");
      where = `character '${escaped}' in position ${start}`;
    }
    super(`'${encoding}' codec can't encode ${where}: ${reason}`);
    this.encoding = encoding;
    this.object = object;
    this.start = start;
    this.end = end;
    this.reason = reason;
  }
}
