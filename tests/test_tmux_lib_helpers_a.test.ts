import { expect, test } from "bun:test";
import { buildIter, buildFakeRun, generateUniqueSuffix } from "./test_tmux_lib_helpers_a.ts";

test("buildIter_returns_items_in_order_then_throws_StopIteration", (): void => {
  const next: () => number = buildIter([1, 2]);
  expect([next(), next()]).toEqual([1, 2]);
  expect(next).toThrow("StopIteration");
});

test("buildFakeRun_records_argv_and_returns_the_canned_result", (): void => {
  const calls: string[][] = [];
  const fake: ReturnType<typeof buildFakeRun> = buildFakeRun(4, "out", "err", calls);
  expect(fake(["a"], { capture_output: true, text: true })).toEqual({ returncode: 4, stdout: "out", stderr: "err" });
  expect(calls).toEqual([["a"]]);
});

test("generateUniqueSuffix_starts_with_the_process_id", (): void => {
  expect(generateUniqueSuffix().startsWith(`${process.pid}-`)).toBe(true);
});
