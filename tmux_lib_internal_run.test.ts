import { expect, test } from "bun:test";
import { IndexError } from "./tmux_lib_internal_errors.ts";
import { executeRun, type RunResult } from "./tmux_lib_internal_run.ts";

test("executeRun_returns_the_exit_code_and_text_streams", (): void => {
  const result: RunResult = executeRun(["sh", "-c", "echo out; exit 3"], { capture_output: true, text: true }) as RunResult;
  expect(result).toEqual({ returncode: 3, stdout: "out\n", stderr: "" });
});

test("executeRun_throws_IndexError_for_empty_argv", (): void => {
  expect((): unknown => executeRun([], { capture_output: true })).toThrow(IndexError);
});
