# tmux_lib

A Bun/TypeScript port of `tmux_lib.py`. It has helper functions that start tmux sessions, send keys to panes, and check what runs in them.

## Install

```
./installer.sh
```

Then open a new terminal (and restart Claude Code).

The script adds `export BUN_JSC_useTailCalls=0` to `~/.zshrc` or `~/.bashrc`.

## Why the variable is needed

`tmux_lib.ts` throws at import if `BUN_JSC_useTailCalls` is not `0`.

Bun (JavaScriptCore) drops the stack frame of a function that ends with `return f()`. Then `callerName()` names the wrong caller in error lines. Python never drops frames.

Bun reads this variable only at process start. A `.env` file is read too late, so it does not work.

Every Bun program started from that shell gets the variable. The cost: Bun does not remove tail calls. This matters only for very deep recursion.

## Run tests

```
bun run test
```

Plain `bun test` also works once the variable is set. `bun run test:unit` and `bun run test:live` run subsets.
