import { tmux_lib_internal } from "./tmux_lib_internal.ts";

// ponytail: code points Bun assigns but Python 3.14 does not. Regenerate when Unicode updates.
const PY_UNASSIGNED: string = String.raw`\u{88F}\u{C5C}\u{CDC}\u{1ACF}-\u{1ADD}\u{1AE0}-\u{1AEB}\u{20C1}\u{2B96}\u{A7CE}-\u{A7CF}\u{A7D2}\u{A7D4}\u{A7F1}\u{FBC3}-\u{FBD2}\u{FD90}-\u{FD91}\u{FDC8}-\u{FDCE}\u{10940}-\u{10959}\u{10EC5}-\u{10EC7}\u{10ED0}-\u{10ED8}\u{10EFA}-\u{10EFB}\u{11B60}-\u{11B67}\u{11DB0}-\u{11DDB}\u{11DE0}-\u{11DE9}\u{16EA0}-\u{16EB8}\u{16EBB}-\u{16ED3}\u{16FF2}-\u{16FF6}\u{187F8}-\u{187FF}\u{18D09}-\u{18D1E}\u{18D80}-\u{18DF2}\u{1CCFA}-\u{1CCFC}\u{1CEBA}-\u{1CED0}\u{1CEE0}-\u{1CEF0}\u{1E6C0}-\u{1E6DE}\u{1E6E0}-\u{1E6F5}\u{1E6FE}-\u{1E6FF}\u{1F6D8}\u{1F777}-\u{1F77A}\u{1F8D0}-\u{1F8D8}\u{1FA54}-\u{1FA57}\u{1FA8A}\u{1FA8E}\u{1FAC8}\u{1FACD}\u{1FAEA}\u{1FAEF}\u{1FBFA}\u{2B73A}-\u{2B73F}\u{2CEA2}-\u{2CEAD}\u{323B0}-\u{33479}`;
const PY_NOT_PRINTABLE: RegExp = new RegExp(`^[\\p{C}\\p{Z}${PY_UNASSIGNED}]$`, "u");
const PY_DIGIT_CLASS: string = `[\\p{Nd}--[${PY_UNASSIGNED}]]`;
const PY_DIGIT: RegExp = new RegExp(`^${PY_DIGIT_CLASS}$`, "v");

export const tmux_lib_py = {
  _TMUX_VERSION_RE: new RegExp(`(${PY_DIGIT_CLASS}+)\\.(${PY_DIGIT_CLASS}+)`, "v") as RegExp,

  // Stand-in for sys._getframe(1).f_code.co_name: the name of the caller of the function calling callerName().
  callerName(): string {
    // stack lines: "Error", callerName, the tmux_* function, its caller
    const frame: string = new Error().stack!.split("\n")[3]!.trim();
    const constructorFrame: RegExp = /^at new \S+ \(/;
    const isConstructor: boolean = constructorFrame.test(frame);
    if (isConstructor) {
      return "__init__";
    }
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
    const digitCount: number = Array.from(digits).length;
    if (digitCount > 4300)
      throw new tmux_lib_internal.ValueError(`Exceeds the limit (4300 digits) for integer string conversion: value has ${digitCount} digits; use sys.set_int_max_str_digits() to increase the limit`);
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
};
