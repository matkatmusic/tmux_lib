import { ValueError } from "./tmux_lib_internal_errors.ts";
import { UnicodeDecodeError, UnicodeEncodeError } from "./tmux_lib_internal_unicode.ts";

const UTF8_STRICT: TextDecoder = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });

// Finds the first bad UTF-8 sequence the way CPython does and builds its UnicodeDecodeError.
function buildDecodeError(bytes: Uint8Array): UnicodeDecodeError {
  let start: number = 0;
  while (start < bytes.length) {
    const lead: number = bytes[start]!;
    let continuations: number = 0;
    const isTwoByteLead: boolean = lead >= 0xc2 && lead <= 0xdf;
    const isThreeByteLead: boolean = lead >= 0xe0 && lead <= 0xef;
    const isFourByteLead: boolean = lead >= 0xf0 && lead <= 0xf4;
    if (isTwoByteLead) {
      continuations = 1;
    }
    else if (isThreeByteLead) {
      continuations = 2;
    }
    else if (isFourByteLead) {
      continuations = 3;
    }
    else if (lead >= 0x80) {
      return new UnicodeDecodeError("utf-8", bytes, start, start + 1, "invalid start byte");
    }
    for (let offset: number = 1; offset <= continuations; offset++) {
      if (start + offset >= bytes.length) {
        return new UnicodeDecodeError("utf-8", bytes, start, bytes.length, "unexpected end of data");
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
        return new UnicodeDecodeError("utf-8", bytes, start, start + offset, "invalid continuation byte");
      }
    }
    start += continuations + 1;
  }
  throw new Error("strict UTF-8 decode failed but no bad sequence was found");
}

export function decodeText(bytes: Uint8Array): string {
  let text: string;
  try {
    text = UTF8_STRICT.decode(bytes);
  }
  catch {
    throw buildDecodeError(bytes);
  }
  return text.replace(/\r\n?/g, "\n");
}

// Finds the first code-point run that os.fsencode rejects: lone surrogates other than U+DC80..U+DCFF.
function findUnencodableRange(text: string): { start: number; end: number } | null {
  let position: number = 0;
  let start: number = -1;
  for (const ch of text) {
    const cp: number = ch.codePointAt(0)!;
    const isSurrogate: boolean = cp >= 0xd800 && cp <= 0xdfff;
    const isEscapable: boolean = cp >= 0xdc80 && cp <= 0xdcff;
    const isBadSurrogate: boolean = isSurrogate && !isEscapable;
    const startsRun: boolean = start === -1 && isBadSurrogate;
    if (startsRun)
      start = position;
    const endsRun: boolean = start !== -1 && !isSurrogate;
    if (endsRun)
      return { start, end: position };
    position++;
  }
  if (start === -1)
    return null;
  return { start, end: position };
}

export function validateArgv(argv: string[]): void {
  for (const arg of argv) {
    const unencodable: { start: number; end: number } | null = findUnencodableRange(arg);
    if (unencodable !== null)
      throw new UnicodeEncodeError("utf-8", arg, unencodable.start, unencodable.end, "surrogates not allowed");
    const hasNullByte: boolean = arg.includes("\0");
    if (hasNullByte)
      throw new ValueError("embedded null byte");
  }
}
