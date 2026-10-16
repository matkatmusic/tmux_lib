import { tmux_lib_internal, type BytesRunOptions, type RunFn, type TextRunOptions } from "./tmux_lib_internal.ts";
import { tmux_lib_layout } from "./tmux_lib_layout.ts";
import { tmux_lib_options } from "./tmux_lib_options.ts";
import { tmux_lib_pane } from "./tmux_lib_pane.ts";
import { tmux_lib_py } from "./tmux_lib_py.ts";
import { tmux_lib_send } from "./tmux_lib_send.ts";
import { tmux_lib_session } from "./tmux_lib_session.ts";
import { tmux_lib_wait } from "./tmux_lib_wait.ts";
import { tmux_lib_window } from "./tmux_lib_window.ts";

if (process.env.BUN_JSC_useTailCalls !== "0") {
  throw new Error(
    "Start Bun with BUN_JSC_useTailCalls=0. Bun drops the stack frame of a function that ends with `return f()`, so callerName() would name the wrong caller.",
  );
}

export const tmux_lib = {
  ...tmux_lib_py,
  ...tmux_lib_options,
  ...tmux_lib_session,
  ...tmux_lib_window,
  ...tmux_lib_pane,
  ...tmux_lib_layout,
  ...tmux_lib_send,
  ...tmux_lib_wait,

  // Re-exports of tmux_lib_internal (Python: `from tmux_lib_internal import ...`).
  _tmux_default_runner: tmux_lib_internal._tmux_default_runner,
  _tmux_run: tmux_lib_internal._tmux_run,
  _tmux_session_exists: tmux_lib_internal._tmux_session_exists,
  _tmux_default_send: tmux_lib_internal._tmux_default_send,
  _tmux_live_pane_ids: tmux_lib_internal._tmux_live_pane_ids,
  _tmux_kill_pane: tmux_lib_internal._tmux_kill_pane,
  _tmux_paneCurrentCommand: tmux_lib_internal._tmux_paneCurrentCommand,
  _tmux_listLivePaneIds: tmux_lib_internal._tmux_listLivePaneIds,

  // Side-effect seams (Python: subprocess.run, time.sleep, print(file=sys.stderr), print).
  run: ((argv: string[], options: BytesRunOptions | TextRunOptions): unknown =>
    tmux_lib_internal.run(argv, options as BytesRunOptions)) as RunFn,
  sleep(seconds: number): void {
    Bun.sleepSync(seconds * 1000);
  },
  stderrWrite(text: string): void {
    process.stderr.write(text);
  },
  stdoutWrite(text: string): void {
    process.stdout.write(text);
  },

  // Stand-in for the Python call stack: running tmux_* function names, innermost last.
  // callStack: [] as string[],
  // Caller name reported when code outside this module calls a tmux_* function. Set it per test.
  // externalCaller: "<unknown>",
};

// // Track the running tmux_* function names in callStack so callerName() can report the caller.
// const members: Record<string, (...args: never[]) => unknown> = tmux_lib as unknown as Record<string, (...args: never[]) => unknown>;
// for (const name of Object.keys(members)) {
//   if (!name.startsWith("tmux_") && name !== "_tmux_backgroundKill")
//     continue;
//   const original: (...args: never[]) => unknown = members[name]!;
//   members[name] = (...args: never[]): unknown => {
//     tmux_lib.callStack.push(name);
//     try {
//       return original(...args);
//     }
//     finally {
//       tmux_lib.callStack.pop();
//     }
//   };
// }
