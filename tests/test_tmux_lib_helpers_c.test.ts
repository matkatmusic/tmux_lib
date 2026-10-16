import { expect, test } from "bun:test";
import { buildPyLambda } from "./test_tmux_lib_helpers_c.ts";

test("buildPyLambda_passes_arguments_through_when_the_count_fits", (): void => {
  const add: (a: number, b: number) => number = buildPyLambda(2, 2, (a: number, b: number): number => a + b);
  expect(add(1, 2)).toBe(3);
});

test("buildPyLambda_throws_TypeError_when_the_count_is_wrong", (): void => {
  const one: (a: number) => number = buildPyLambda(1, 1, (a: number): number => a);
  expect((): number => (one as unknown as () => number)()).toThrow(TypeError);
});
