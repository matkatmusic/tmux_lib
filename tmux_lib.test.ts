import { expect } from "bun:test";
import { tmux_lib } from "./tmux_lib.ts";
import { tmux_lib_internal, type RunResult } from "./tmux_lib_internal.ts";
import { stubRun, test } from "./tests/test_tmux_lib_helpers_a.ts";
import { captureStreams, useTestHooks } from "./tests/test_tmux_lib_helpers_c.ts";

useTestHooks();

const TEXT_RUN: { capture_output: true; text: true; check: false } = { capture_output: true, text: true, check: false };
const CHECKED_TEXT_RUN: { capture_output: true; text: true; check: true } = { capture_output: true, text: true, check: true };
const DECODE_PREFIX: string = "'utf-8' codec can't decode ";

// Python 3.14 outputs for bytes.decode("utf-8"): [bytes, message after the prefix].
const DECODE_CASES: Array<[number[], string]> = [
  [[0x61, 0x62, 0xff], "byte 0xff in position 2: invalid start byte"],
  [[0xc3], "byte 0xc3 in position 0: unexpected end of data"],
  [[0x61, 0xe2, 0x82], "bytes in position 1-2: unexpected end of data"],
  [[0xf0, 0x9f, 0x98], "bytes in position 0-2: unexpected end of data"],
  [[0xe2, 0x28, 0xa1], "byte 0xe2 in position 0: invalid continuation byte"],
  [[0xc0, 0xaf], "byte 0xc0 in position 0: invalid start byte"],
  [[0xed, 0xa0, 0x80], "byte 0xed in position 0: invalid continuation byte"],
  [[0xf4, 0x90, 0x80, 0x80], "byte 0xf4 in position 0: invalid continuation byte"],
  [[0xe0, 0x80, 0x80], "byte 0xe0 in position 0: invalid continuation byte"],
  [[0xf0, 0x80], "byte 0xf0 in position 0: invalid continuation byte"],
  [[0x80], "byte 0x80 in position 0: invalid start byte"],
  [[0xe2, 0x82, 0x28], "bytes in position 0-1: invalid continuation byte"],
  [[0xf0, 0x9f, 0x98, 0x28], "bytes in position 0-2: invalid continuation byte"],
];

function toPrintfOctal(bytes: number[]): string {
  let escaped: string = "";
  for (const byte of bytes) {
    escaped += "\\" + byte.toString(8).padStart(3, "0");
  }
  return escaped;
}

test("callerName_names_an_outside_function_that_ends_with_return_of_a_tmux_call", (): void => {
  stubRun(1, "", "boom");
  const streams: { out: () => string; err: () => string } = captureStreams();
  function outsideTailCaller(): number {
    return tmux_lib.tmux_sendEnter("%1");
  }
  outsideTailCaller();
  expect(streams.err()).toContain("[outsideTailCaller] command");
});

test("callerName_reports_lambda_for_a_nameless_function", (): void => {
  stubRun(1, "", "boom");
  const streams: { out: () => string; err: () => string } = captureStreams();
  (function (): void {
    tmux_lib.tmux_sendEnter("%1");
  })();
  expect(streams.err()).toContain("[<lambda>] command");
});

test("decodeText_builds_Python_UnicodeDecodeError_messages", (): void => {
  for (const [bytes, message] of DECODE_CASES) {
    const run_invalid = (): RunResult => tmux_lib.run(["printf", toPrintfOctal(bytes)], TEXT_RUN);
    expect(run_invalid).toThrow(DECODE_PREFIX + message);
  }
});

test("pyRepr_escapes_a_character_Bun_assigns_but_Python_does_not", (): void => {
  expect(tmux_lib._pyRepr("\u{88f}")).toBe("'\\u088f'");
});

test("requireVersion_does_not_read_an_unassigned_Python_digit", (): void => {
  stubRun(0, "tmux \u{11de0}.1\n");
  const streams: { out: () => string; err: () => string } = captureStreams();
  expect(tmux_lib.tmux_requireVersion("3.1")).toBe(1);
  expect(streams.err()).toBe("[tmux] tmux is not installed\n");
});

test("run_with_check_true_throws_CalledProcessError_on_nonzero_exit", (): void => {
  const script: string = "echo out; echo err >&2; exit 3";
  const argv: string[] = ["sh", "-c", script];
  let thrown: unknown;
  try {
    tmux_lib_internal.run(argv, CHECKED_TEXT_RUN);
  }
  catch (e: unknown) {
    thrown = e;
  }
  const error: InstanceType<typeof tmux_lib_internal.CalledProcessError> = thrown as InstanceType<typeof tmux_lib_internal.CalledProcessError>;
  expect(error).toBeInstanceOf(tmux_lib_internal.CalledProcessError);
  expect(error).toBeInstanceOf(Error);
  expect(error.message).toBe(`Command '['sh', '-c', '${script}']' returned non-zero exit status 3.`);
  expect([error.returncode, error.cmd, error.stdout, error.stderr]).toEqual([3, argv, "out\n", "err\n"]);
});

test("run_with_check_true_returns_the_result_on_zero_exit", (): void => {
  const result: RunResult = tmux_lib_internal.run(["true"], CHECKED_TEXT_RUN);
  expect(result.returncode).toBe(0);
});
