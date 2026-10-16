import { expect, test } from "bun:test";
import { mkdtempSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { collectRunError, createProgram } from "./test_tmux_lib_internal_helpers.ts";

test("createProgram_writes_an_executable_script_in_the_directory", (): void => {
  const path: string = createProgram(`${mkdtempSync(`${tmpdir()}/tmux_lib_helper_`)}/d`, "prog", 0o755);
  expect(statSync(path).mode & 0o777).toBe(0o755);
});

test("collectRunError_returns_the_error_run_throws", (): void => {
  expect(collectRunError([]).name).toBe("IndexError");
});
