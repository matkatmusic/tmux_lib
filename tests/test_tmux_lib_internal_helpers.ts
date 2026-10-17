import { spyOn } from "bun:test";
import { chmodSync, mkdirSync, writeFileSync } from "node:fs";
import { tmux_lib_internal, type RunResult } from "../tmux_lib_internal.ts";
import { wrapFakeRun } from "./test_tmux_lib_helpers_a.ts";

export type OsError = InstanceType<typeof tmux_lib_internal.OSError>;
export type EncodeError = InstanceType<typeof tmux_lib_internal.UnicodeEncodeError>;
export type DecodeError = InstanceType<typeof tmux_lib_internal.UnicodeDecodeError>;

export function setInternalRunStub(rc: number, stdout: string = "", stderr: string = "", calls: string[][] = []): void {
  spyOn(tmux_lib_internal, "run").mockImplementation(wrapFakeRun((argv: string[]): RunResult => {
    calls.push(argv);
    return { returncode: rc, stdout: stdout, stderr: stderr };
  }));
}

export function setInternalRunThrow(error: Error): void {
  spyOn(tmux_lib_internal, "run").mockImplementation((): never => {
    throw error;
  });
}

export function collectRunError(argv: string[], text: boolean = false): Error {
  try {
    if (text)
      tmux_lib_internal.run(argv, { capture_output: true, text: true });
    else
      tmux_lib_internal.run(argv, { capture_output: true });
  }
  catch (e: unknown) {
    return e as Error;
  }
  throw new Error("run did not throw");
}

export function createProgram(dir: string, name: string, mode: number): string {
  mkdirSync(dir, { recursive: true });
  const path: string = `${dir}/${name}`;
  writeFileSync(path, "#!/bin/sh\necho ran\n");
  chmodSync(path, mode);
  return path;
}
