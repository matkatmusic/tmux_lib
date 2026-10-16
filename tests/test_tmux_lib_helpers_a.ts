import { spyOn, test as bunTest } from "bun:test";
import { tmux_lib } from "../tmux_lib.ts";
import type { RunFn, RunResult } from "../tmux_lib_internal.ts";
import { pyLambda } from "./test_tmux_lib_helpers_c.ts";

export const tmuxInstalled: boolean = Bun.which("tmux") !== null;
export const test: typeof bunTest = (tmuxInstalled ? bunTest : bunTest.skip) as typeof bunTest;

export const LIVE_TIMEOUT_MS: number = 60000;
export const READY_GLYPH: string = "❯";

// Types a text-mode fake as the overloaded run seam.
export function fakeRun(impl: (argv: string[], options: object) => RunResult): RunFn {
  return impl as unknown as RunFn;
}

// Fakes the tmux_lib.run seam: records each argv in `calls` and returns the canned result.
export function makeFakeRun(
  rc: number,
  stdout: string = "",
  stderr: string = "",
  calls: string[][] | undefined = undefined,
): RunFn {
  return fakeRun(pyLambda(1, Infinity, (argv: string[]): RunResult => {
    if (calls !== undefined) {
      calls.push(argv);
    }
    return { returncode: rc, stdout: stdout, stderr: stderr };
  }));
}

export function stubRun(rc: number, stdout: string = "", stderr: string = "", calls: string[][] | undefined = undefined): void {
  spyOn(tmux_lib, "run").mockImplementation(makeFakeRun(rc, stdout, stderr, calls));
}

// Stands in for Python iter()/next(): throws when exhausted (StopIteration).
export function makeIter<T>(items: T[]): () => T {
  let index: number = 0;
  return (): T => {
    if (index >= items.length) {
      throw new Error("StopIteration");
    }
    const item: T = items[index]!;
    index += 1;
    return item;
  };
}

// Runs the real tmux binary directly, bypassing every tmux_lib seam.
export function realTmux(...args: string[]): RunResult {
  const proc: Bun.SyncSubprocess<"pipe", "pipe"> = Bun.spawnSync(["tmux", ...args], { stdout: "pipe", stderr: "pipe" });
  return { returncode: proc.exitCode ?? -1, stdout: proc.stdout.toString(), stderr: proc.stderr.toString() };
}

export function uniqueSuffix(): string {
  return `${process.pid}-${process.hrtime.bigint()}`;
}
