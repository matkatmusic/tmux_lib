import { expect, test } from "bun:test";
import { tmux_lib_internal, type RunResult } from "./tmux_lib_internal.ts";
import { installTestHooks } from "./tests/test_tmux_lib_helpers_c.ts";
import { collectRunError, type DecodeError, type OsError } from "./tests/test_tmux_lib_internal_helpers.ts";

installTestHooks();

test("OSError_is_an_Error_and_FileNotFoundError_is_an_OSError", (): void => {
  const missing: Error = new tmux_lib_internal.FileNotFoundError("x");
  expect(new tmux_lib_internal.OSError("x")).toBeInstanceOf(Error);
  expect(missing).toBeInstanceOf(tmux_lib_internal.OSError);
});

test("UnicodeError_sits_between_ValueError_and_UnicodeDecodeError", (): void => {
  const decodeError: Error = new tmux_lib_internal.UnicodeDecodeError("utf-8", new Uint8Array([0xff]), 0, 1, "invalid start byte");
  expect(decodeError).toBeInstanceOf(tmux_lib_internal.UnicodeError);
  expect(new tmux_lib_internal.UnicodeError("x")).toBeInstanceOf(tmux_lib_internal.ValueError);
});

test("IndexError_extends_LookupError_and_LookupError_extends_Error", (): void => {
  const indexError: Error = new tmux_lib_internal.IndexError("x");
  expect(indexError).toBeInstanceOf(tmux_lib_internal.LookupError);
  expect(new tmux_lib_internal.LookupError("x")).toBeInstanceOf(Error);
  expect(new tmux_lib_internal.LookupError("x")).not.toBeInstanceOf(tmux_lib_internal.IndexError);
  expect(String(new tmux_lib_internal.LookupError("x"))).toBe("LookupError: x");
});

test("run_in_text_mode_returns_code_and_decoded_streams", (): void => {
  const argv: string[] = ["sh", "-c", "echo out; echo err >&2; exit 2"];
  const result: RunResult = tmux_lib_internal.run(argv, { capture_output: true, text: true });
  expect(result).toEqual({ returncode: 2, stdout: "out\n", stderr: "err\n" });
});

test("run_of_a_missing_program_throws_FileNotFoundError_with_Python_message_and_fields", (): void => {
  for (const program of ["nope", "/no/such/prog"]) {
    const error: OsError = collectRunError([program]) as OsError;
    expect(error).toBeInstanceOf(tmux_lib_internal.FileNotFoundError);
    expect(String(error)).toBe(`FileNotFoundError: [Errno 2] No such file or directory: '${program}'`);
    expect([error.errno, error.strerror, error.filename]).toEqual([2, "No such file or directory", program]);
  }
});

test("run_of_empty_argv_throws_IndexError", (): void => {
  const error: Error = collectRunError([]);
  expect(error).toBeInstanceOf(tmux_lib_internal.IndexError);
  expect(error).toBeInstanceOf(tmux_lib_internal.LookupError);
  expect(String(error)).toBe("IndexError: list index out of range");
});

test("CalledProcessError_extends_SubprocessError_and_aliases_output_to_stdout", (): void => {
  const error: InstanceType<typeof tmux_lib_internal.CalledProcessError> = new tmux_lib_internal.CalledProcessError(1, ["a"], "out", "err");
  expect(error).toBeInstanceOf(tmux_lib_internal.SubprocessError);
  expect(error.output).toBe("out");
  error.output = "changed";
  expect(error.stdout).toBe("changed");
  expect(String(error)).toBe("CalledProcessError: Command '['a']' returned non-zero exit status 1.");
});

test("UnicodeDecodeError_carries_encoding_object_start_end_and_reason", (): void => {
  const error: DecodeError = collectRunError(["printf", "a\\377"], true) as DecodeError;
  expect([error.encoding, error.start, error.end, error.reason]).toEqual(["utf-8", 1, 2, "invalid start byte"]);
  expect(error.object).toEqual(new Uint8Array([0x61, 0xff]));
});

test("every_error_class_sets_name_to_its_Python_class_name", (): void => {
  const { OSError, FileNotFoundError, PermissionError, NotADirectoryError, LookupError, IndexError, ValueError, UnicodeError, SubprocessError } = tmux_lib_internal;
  for (const errorClass of [OSError, FileNotFoundError, PermissionError, NotADirectoryError, LookupError, IndexError, ValueError, UnicodeError, SubprocessError]) {
    expect(String(new errorClass("x"))).toBe(`${errorClass.name}: x`);
  }
  expect(new OSError("x").errno).toBeNull();
});
