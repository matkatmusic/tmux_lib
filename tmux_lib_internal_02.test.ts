import { expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { tmux_lib_internal, type RunResult } from "./tmux_lib_internal.ts";
import { installTestHooks } from "./tests/test_tmux_lib_helpers_c.ts";
import { collectRunError, createProgram, type EncodeError, type OsError } from "./tests/test_tmux_lib_internal_helpers.ts";

installTestHooks();

test("run_throws_PermissionError_for_non_executable_file_folder_and_PATH_entry", (): void => {
  const root: string = mkdtempSync(`${tmpdir()}/tmux_lib_perm_`);
  const plain: string = createProgram(`${root}/plain`, "tmux", 0o644);
  const good: string = createProgram(`${root}/good`, "tmux", 0o755);
  for (const path of [plain, root]) {
    const error: OsError = collectRunError([path]) as OsError;
    expect(error).toBeInstanceOf(tmux_lib_internal.PermissionError);
    expect(error).toBeInstanceOf(tmux_lib_internal.OSError);
    expect(String(error)).toBe(`PermissionError: [Errno 13] Permission denied: '${path}'`);
    expect([error.errno, error.strerror, error.filename]).toEqual([13, "Permission denied", path]);
  }
  const savedPath: string | undefined = process.env.PATH;
  try {
    process.env.PATH = `${root}/plain`;
    expect(String(collectRunError(["tmux"]))).toBe("PermissionError: [Errno 13] Permission denied: 'tmux'");
    process.env.PATH = `${root}/plain:${root}/missing`;
    expect(String(collectRunError(["tmux"]))).toBe("PermissionError: [Errno 13] Permission denied: 'tmux'");
    process.env.PATH = `${root}/plain:${root}/good`;
    const result: RunResult = tmux_lib_internal.run(["tmux"], { capture_output: true, text: true });
    expect(result.stdout).toBe("ran\n");
    process.env.PATH = `${root}/good:${root}/plain`;
    expect(tmux_lib_internal.run([good], { capture_output: true, text: true }).stdout).toBe("ran\n");
  }
  finally {
    process.env.PATH = savedPath;
  }
});

test("run_throws_NotADirectoryError_when_a_path_goes_through_a_file", (): void => {
  const plain: string = createProgram(`${mkdtempSync(`${tmpdir()}/tmux_lib_notdir_`)}/d`, "f", 0o755);
  const error: OsError = collectRunError([`${plain}/x`]) as OsError;
  expect(String(error)).toBe(`NotADirectoryError: [Errno 20] Not a directory: '${plain}/x'`);
  expect(error.errno).toBe(20);
});

test("run_throws_UnicodeEncodeError_for_a_lone_surrogate_in_argv", (): void => {
  const cases: Array<[string, string, number, number]> = [
    ["\ud800", "'utf-8' codec can't encode character '\\ud800' in position 0: surrogates not allowed", 0, 1],
    ["\ud800\ud801", "'utf-8' codec can't encode characters in position 0-1: surrogates not allowed", 0, 2],
    ["a😀\ud800", "'utf-8' codec can't encode character '\\ud800' in position 2: surrogates not allowed", 2, 3],
  ];
  for (const [arg, message, start, end] of cases) {
    const error: EncodeError = collectRunError(["echo", arg]) as EncodeError;
    expect(error).toBeInstanceOf(tmux_lib_internal.UnicodeError);
    expect(String(error)).toBe(`UnicodeEncodeError: ${message}`);
    expect([error.encoding, error.object, error.start, error.end, error.reason]).toEqual(["utf-8", arg, start, end, "surrogates not allowed"]);
  }
  expect(String(collectRunError(["\ud800", "a\0b"]))).toStartWith("UnicodeEncodeError:");
  expect(String(collectRunError(["a\0b", "\ud800"]))).toBe("ValueError: embedded null byte");
});
