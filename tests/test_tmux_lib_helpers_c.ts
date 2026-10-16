import { afterEach, beforeEach, mock, spyOn } from "bun:test";
import { format } from "node:util";
import { tmux_lib_internal } from "../tmux_lib_internal.ts";

let capturedOut: string = "";
let capturedErr: string = "";

function getChunkText(chunk: unknown): string {
  return typeof chunk === "string" ? chunk : Buffer.from(chunk as Uint8Array).toString();
}

// Stands in for pytest default capture: nothing reaches the real stdout/stderr during a test.
function initCapture(): void {
  capturedOut = "";
  capturedErr = "";
  spyOn(process.stdout, "write").mockImplementation((chunk: unknown): boolean => {
    capturedOut += getChunkText(chunk);
    return true;
  });
  spyOn(process.stderr, "write").mockImplementation((chunk: unknown): boolean => {
    capturedErr += getChunkText(chunk);
    return true;
  });
  spyOn(console, "log").mockImplementation((...args: unknown[]): void => {
    capturedOut += format(...args) + "\n";
  });
  spyOn(console, "error").mockImplementation((...args: unknown[]): void => {
    capturedErr += format(...args) + "\n";
  });
}

// Stands in for pytest capsys/capfd: reads the capture that every test already has.
export function getCaptureStreams(): { out: () => string; err: () => string } {
  return { out: (): string => capturedOut, err: (): string => capturedErr };
}

const teardowns: Array<() => void> = [];

// Stands in for the code after `yield` in a pytest fixture.
export function addTeardown(teardown: () => void): void {
  teardowns.push(teardown);
}

// Python: subprocess.run(["tmux", "kill-session", "-t", name], capture_output=True, check=False)
export function stopRealSession(name: string): void {
  tmux_lib_internal.run(["tmux", "kill-session", "-t", name], { capture_output: true, check: false });
}

// Python: subprocess.run(["tmux", "kill-session", "-t", name], stdout=DEVNULL, stderr=DEVNULL)
export function stopSessionQuietly(name: string): void {
  tmux_lib_internal.run(["tmux", "kill-session", "-t", name], { stdout: "DEVNULL", stderr: "DEVNULL" });
}

// Teardown runs after the test's mocks are restored, still under capture, in reverse setup order.
function executeTeardowns(): void {
  mock.restore();
  initCapture();
  while (teardowns.length > 0) {
    teardowns.pop()!();
  }
  mock.restore();
}

export function installTestHooks(): void {
  beforeEach(initCapture);
  afterEach(executeTeardowns);
}

// Stands in for a Python lambda/def with a fixed parameter list: a wrong argument count raises TypeError.
export function buildPyLambda<F extends (...args: never[]) => unknown>(min: number, max: number, fn: F): F {
  return ((...args: unknown[]): unknown => {
    const isTooFew: boolean = args.length < min;
    const isTooMany: boolean = args.length > max;
    const hasBadCount: boolean = isTooFew || isTooMany;
    if (hasBadCount) {
      throw new TypeError(`takes ${min} to ${max} positional arguments but ${args.length} were given`);
    }
    return (fn as unknown as (...a: unknown[]) => unknown)(...args);
  }) as unknown as F;
}
