// Same cases as ai/tests/test_macros.py. Keep them in sync.
import { test } from "node:test";
import assert from "node:assert/strict";
import { macrosFor, sumMacros, type Nutrients } from "./macros.ts";

const EGGS: Nutrients = { kcal: 148, protein: 10.0, carbs: 1.6, fat: 11.0 };
const RICE: Nutrients = { kcal: 130, protein: 2.7, carbs: 28.0, fat: 0.3 };

function close(actual: Nutrients, expected: Nutrients) {
  for (const k of ["kcal", "protein", "carbs", "fat"] as const) {
    assert.ok(Math.abs(actual[k] - expected[k]) < 1e-9, `${k}: ${actual[k]} != ${expected[k]}`);
  }
}

test("0 g is all zeros", () => {
  close(macrosFor(EGGS, 0), { kcal: 0, protein: 0, carbs: 0, fat: 0 });
});

test("100 g equals per_100g", () => {
  close(macrosFor(EGGS, 100), EGGS);
});

test("250 g scales by 2.5", () => {
  close(macrosFor(EGGS, 250), { kcal: 370, protein: 25, carbs: 4, fat: 27.5 });
});

test("sum of several items", () => {
  const total = sumMacros([
    { per_100g: EGGS, grams: 120 },
    { per_100g: RICE, grams: 200 },
    { per_100g: EGGS, grams: 0 },
  ]);
  close(total, { kcal: 437.6, protein: 17.4, carbs: 57.92, fat: 13.8 });
});

test("sum of nothing is zeros", () => {
  close(sumMacros([]), { kcal: 0, protein: 0, carbs: 0, fat: 0 });
});
