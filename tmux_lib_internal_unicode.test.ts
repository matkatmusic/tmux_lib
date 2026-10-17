import { expect, test } from "bun:test";
import { ValueError } from "./tmux_lib_internal_errors.ts";
import { UnicodeDecodeError, UnicodeEncodeError, UnicodeError } from "./tmux_lib_internal_unicode.ts";

test("UnicodeError_extends_ValueError", (): void => {
  expect(new UnicodeError("x")).toBeInstanceOf(ValueError);
});

test("UnicodeDecodeError_message_names_the_bad_byte", (): void => {
  const error: UnicodeDecodeError = new UnicodeDecodeError("utf-8", new Uint8Array([0x61, 0xff]), 1, 2, "invalid start byte");
  expect(String(error)).toBe("UnicodeDecodeError: 'utf-8' codec can't decode byte 0xff in position 1: invalid start byte");
});

test("UnicodeEncodeError_message_names_the_bad_character", (): void => {
  const error: UnicodeEncodeError = new UnicodeEncodeError("utf-8", "a\ud800", 1, 2, "surrogates not allowed");
  expect(String(error)).toBe("UnicodeEncodeError: 'utf-8' codec can't encode character '\\ud800' in position 1: surrogates not allowed");
});
