import { constants } from "node:os";
import { decodeText, validateArgv } from "./tmux_lib_internal_decode.ts";
import { CalledProcessError, IndexError, OS_ERROR_TEXT, buildOsError } from "./tmux_lib_internal_errors.ts";

// Keyword args of Python subprocess.run that the call sites pass.
export type BytesRunOptions = { capture_output?: true; check?: boolean; stdout?: "DEVNULL"; stderr?: "DEVNULL" };
export type TextRunOptions = { capture_output: true; text: true; check?: boolean };
export type RunResult = { returncode: number; stdout: string; stderr: string };
export type BytesRunResult = { returncode: number; stdout: Uint8Array | null; stderr: Uint8Array | null };
export type RunFn = {
  (argv: string[], options: BytesRunOptions): BytesRunResult;
  (argv: string[], options: TextRunOptions): RunResult;
};

// execvp tries the program itself if it has a slash, else each PATH dir plus it.
function listExecCandidates(program: string): string[] {
  const hasSlash: boolean = program.includes("/");
  if (hasSlash)
    return [program];
  const candidates: string[] = [];
  for (const dir of (process.env.PATH ?? "/bin:/usr/bin").split(":")) {
    const needsSlash: boolean = dir !== "" && !dir.endsWith("/");
    candidates.push(needsSlash ? `${dir}/${program}` : dir + program);
  }
  return candidates;
}

// Stand-in for subprocess.run(argv, **options).
export function executeRun(argv: string[], options: BytesRunOptions | TextRunOptions): BytesRunResult | RunResult {
  if (argv.length === 0)
    throw new IndexError("list index out of range");
  validateArgv(argv);
  const selectRedirect = (stream: "DEVNULL" | undefined): "ignore" | "pipe" | "inherit" =>
    stream === "DEVNULL" ? "ignore" : options.capture_output ? "pipe" : "inherit";
  let proc: Bun.SyncSubprocess | undefined;
  let firstOtherCode: string | null = null;
  let lastCode: string = "ENOENT";
  for (const candidate of listExecCandidates(argv[0]!)) {
    const hasSlash: boolean = candidate.includes("/");
    if (candidate === "")
      continue;
    try {
      proc = Bun.spawnSync({
        cmd: [hasSlash ? candidate : `./${candidate}`, ...argv.slice(1)],
        argv0: argv[0],
        stdin: "inherit",
        stdout: selectRedirect((options as BytesRunOptions).stdout),
        stderr: selectRedirect((options as BytesRunOptions).stderr),
        env: process.env,
      });
      break;
    }
    catch (e: unknown) {
      const code: unknown = (e as { code?: unknown }).code;
      const isKnownCode: boolean = typeof code === "string" && code in OS_ERROR_TEXT;
      if (!isKnownCode)
        throw e;
      const isMissing: boolean = code === "ENOENT" || code === "ENOTDIR";
      const isFirstOther: boolean = !isMissing && firstOtherCode === null;
      if (isFirstOther)
        firstOtherCode = code as string;
      lastCode = code as string;
    }
  }
  if (proc === undefined)
    throw buildOsError(firstOtherCode ?? lastCode, argv[0]!);
  const returncode: number =
    proc.exitCode ?? -(constants.signals[proc.signalCode as keyof typeof constants.signals] as number);
  const collect = (bytes: Uint8Array | undefined): string | Uint8Array | null => {
    if (bytes === undefined)
      return null;
    return "text" in options ? decodeText(bytes) : bytes;
  };
  const stdout: string | Uint8Array | null = collect(proc.stdout);
  const stderr: string | Uint8Array | null = collect(proc.stderr);
  const failedWithCheck: boolean = options.check === true && returncode !== 0;
  if (failedWithCheck)
    throw new CalledProcessError(returncode, argv, stdout, stderr);
  return { returncode, stdout, stderr } as BytesRunResult | RunResult;
}
