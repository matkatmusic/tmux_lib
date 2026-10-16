import { expect, test } from "bun:test";
import { tmux_lib } from "./tmux_lib.ts";
import { tmux_lib_py } from "./tmux_lib_py.ts";

test("_pyInt_parses_ascii_and_unicode_decimal_digits", (): void => {
  expect(tmux_lib_py._pyInt("42")).toBe(42n);
  expect(tmux_lib_py._pyInt("٣٤")).toBe(34n);
});

test("_pyRepr_picks_the_quote_the_way_Python_does", (): void => {
  expect(tmux_lib_py._pyRepr("a'b")).toBe(`"a'b"`);
  expect(tmux_lib_py._pyRepr("a\nb")).toBe("'a\\nb'");
});

test("callerName_names_the_function_that_called_the_caller", (): void => {
  function outerCaller(): string {
    const name: string = innerFunction();
    return name;
  }
  function innerFunction(): string {
    const name: string = tmux_lib.callerName();
    return name;
  }
  expect(outerCaller()).toBe("outerCaller");
});

test("tmux_lib_exposes_every_tmux_lib_py_member", (): void => {
  expect(tmux_lib._pyInt).toBe(tmux_lib_py._pyInt);
  expect(tmux_lib.callerName).toBe(tmux_lib_py.callerName);
});
