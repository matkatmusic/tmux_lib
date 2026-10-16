import { expect, test } from "bun:test";
import { decodeText, validateArgv } from "./tmux_lib_internal_decode.ts";
import { ValueError } from "./tmux_lib_internal_errors.ts";
import { UnicodeDecodeError, UnicodeEncodeError } from "./tmux_lib_internal_unicode.ts";

test("decodeText_converts_carriage_returns_to_newlines", (): void => {
  expect(decodeText(new TextEncoder().encode("a\r\nb\rc"))).toBe("a\nb\nc");
});

test("decodeText_throws_UnicodeDecodeError_for_invalid_utf8", (): void => {
  expect((): string => decodeText(new Uint8Array([0xff]))).toThrow(UnicodeDecodeError);
});

test("validateArgv_throws_for_a_lone_surrogate_and_for_a_null_byte", (): void => {
  expect((): void => validateArgv(["\ud800"])).toThrow(UnicodeEncodeError);
  expect((): void => validateArgv(["a\0b"])).toThrow(ValueError);
  expect((): void => validateArgv(["ok", "fine"])).not.toThrow();
});
