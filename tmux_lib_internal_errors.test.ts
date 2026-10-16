import { expect, test } from "bun:test";
import { CalledProcessError, FileNotFoundError, IndexError, LookupError, OSError, buildOsError, formatPyStr } from "./tmux_lib_internal_errors.ts";

test("buildOsError_maps_known_codes_to_Python_subclasses", (): void => {
  const missing: OSError = buildOsError("ENOENT", "x");
  expect(missing).toBeInstanceOf(FileNotFoundError);
  expect(String(missing)).toBe("FileNotFoundError: [Errno 2] No such file or directory: 'x'");
  expect(buildOsError("ENOEXEC", "x").name).toBe("OSError");
});

test("IndexError_chain_matches_Python_Exception_LookupError_IndexError", (): void => {
  expect(Object.getPrototypeOf(IndexError)).toBe(LookupError);
  expect(Object.getPrototypeOf(LookupError)).toBe(Error);
});

test("formatPyStr_escapes_like_Python_repr", (): void => {
  expect(formatPyStr("a'b")).toBe(`"a'b"`);
  expect(formatPyStr("a\tb\x01")).toBe("'a\\tb\\x01'");
});

test("CalledProcessError_message_quotes_each_argument", (): void => {
  expect(String(new CalledProcessError(2, ["a", "b c"], null, null))).toBe("CalledProcessError: Command '['a', 'b c']' returned non-zero exit status 2.");
});
