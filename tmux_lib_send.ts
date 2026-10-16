import { tmux_lib } from "./tmux_lib.ts";
import { tmux_lib_internal, type RunResult } from "./tmux_lib_internal.ts";

export const tmux_lib_send = {
  // Sends <text> as keystrokes via `tmux send-keys -t <target> <text>`; does NOT append Enter.
  tmux_sendKeys(pane_target: string, text: string): number {
    const cmd: string[] = ["tmux", "send-keys", "-t", pane_target, text];
    const result: RunResult = tmux_lib.run(cmd, { capture_output: true, text: true, check: false });
    if (result.returncode !== 0) {
      const caller: string = tmux_lib.callerName();
      const combined: string = (result.stdout || "") + (result.stderr || "");
      tmux_lib.stderrWrite(`[${caller}] command '${cmd.join(" ")}' failed: ${combined}\n`);
    }
    return result.returncode;
  },

  // Sends the literal `Enter` keystroke token to a pane via `tmux send-keys -t <target> Enter`.
  tmux_sendEnter(pane_target: string): number {
    const cmd: string[] = ["tmux", "send-keys", "-t", pane_target, "Enter"];
    const result: RunResult = tmux_lib.run(cmd, { capture_output: true, text: true, check: false });
    if (result.returncode !== 0) {
      const caller: string = tmux_lib.callerName();
      const combined: string = (result.stdout || "") + (result.stderr || "");
      tmux_lib.stderrWrite(`[${caller}] command '${cmd.join(" ")}' failed: ${combined}\n`);
    }
    return result.returncode;
  },

  // Sends the literal `C-c` (Ctrl-C) token to a pane via `tmux send-keys -t <target> C-c`.
  tmux_sendCtrlC(pane_target: string): number {
    const cmd: string[] = ["tmux", "send-keys", "-t", pane_target, "C-c"];
    const result: RunResult = tmux_lib.run(cmd, { capture_output: true, text: true, check: false });
    if (result.returncode !== 0) {
      const caller: string = tmux_lib.callerName();
      const combined: string = (result.stdout || "") + (result.stderr || "");
      tmux_lib.stderrWrite(`[${caller}] command '${cmd.join(" ")}' failed: ${combined}\n`);
    }
    return result.returncode;
  },

  // True if the pane's input box still holds unsubmitted text: a visible line reading `❯ <content>`.
  tmux_inputBoxHoldsText(pane_target: string): boolean {
    const content: string = tmux_lib.tmux_capturePane(pane_target);
    for (const line of tmux_lib_internal.splitlines(content)) {
      const stripped: string = tmux_lib_internal.strip(line);
      const startsWithGlyph: boolean = stripped.startsWith("❯");
      if (startsWithGlyph) {
        const rest: string = tmux_lib_internal.strip(stripped.slice(1));
        if (rest) {
          return true;
        }
      }
    }
    return false;
  },

  // Sends text, then Enter; resends Enter up to 4 times while text remains. Returns first failure code.
  tmux_sendAndSubmit(pane_target: string, text: string): number {
    const rc1: number = tmux_lib.tmux_sendKeys(pane_target, text);
    if (rc1 !== 0) {
      return rc1;
    }
    tmux_lib.sleep(0.5);
    let rc: number = tmux_lib.tmux_sendEnter(pane_target);
    for (let i: number = 0; i < 4; i++) {
      tmux_lib.sleep(1.0);
      const holdsText: boolean = tmux_lib.tmux_inputBoxHoldsText(pane_target);
      if (!holdsText) {
        break;
      }
      rc = tmux_lib.tmux_sendEnter(pane_target);
    }
    return rc;
  },

  // Sends Ctrl-C up to 5 times until the pane shows 'Ctrl-C', then submits text; logs label when retried.
  tmux_cancelAndSend(pane_target: string, text: string, label: string | undefined = undefined): number {
    const MAX_ATTEMPTS: number = 5;
    let attempts: number = 0;
    for (let i: number = 1; i <= MAX_ATTEMPTS; i++) {
      attempts = i;
      tmux_lib.tmux_sendCtrlC(pane_target);
      tmux_lib.sleep(0.2);
      const screen: string = tmux_lib.tmux_capturePane(pane_target);
      const showsCtrlC: boolean = screen.includes("Ctrl-C");
      if (showsCtrlC) {
        break;
      }
    }
    const wasRetried: boolean = attempts > 1;
    const hasLabel: boolean = Boolean(label);
    const shouldLog: boolean = wasRetried && hasLabel;
    if (shouldLog) {
      tmux_lib.stdoutWrite(`[tmux] cancelled in-progress work: ${label} (${attempts} Ctrl-C's)\n`);
    }
    return tmux_lib.tmux_sendAndSubmit(pane_target, text);
  },
};
