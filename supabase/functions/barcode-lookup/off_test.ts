import { assert, assertEquals } from "jsr:@std/assert@^1.0.0";
import { barcodeCandidates, type FoodRow, toFood } from "./off.ts";

const cola = {
  product_name: "Coca-Cola Original Taste",
  brands: "Coca-Cola, The Coca-Cola Company",
  product_quantity_unit: "ml",
  serving_size: "250 ml",
  serving_quantity: 250,
  nutriments: {
    "energy-kcal_100g": 42,
    proteins_100g: 0,
    carbohydrates_100g: 10.6,
    fat_100g: 0,
  },
};

function ok(result: ReturnType<typeof toFood>): FoodRow {
  assert(!("reason" in result), JSON.stringify(result));
  return result as FoodRow;
}

Deno.test("maps a complete product to a shared off row", () => {
  const food = ok(toFood(cola, "5449000000996"));
  assertEquals(food.id, "off:5449000000996");
  assertEquals(food.origin, "off");
  assertEquals(food.brand, "Coca-Cola");
  assertEquals(food.basis, "ml");
  assertEquals(food.kcal, 42);
  assertEquals(food.carbs, 10.6);
  assertEquals(food.serving_grams, 250);
  assertEquals(food.serving_name, "250 ml");
  assertEquals(food.kcal_estimated, false);
  assertEquals(food.missing_fields, ["fiber"]);
});

Deno.test("converts kJ when kcal is missing", () => {
  const food = ok(toFood({
    product_name: "Biscuiți",
    nutriments: {
      "energy-kj_100g": 2092,
      proteins_100g: 7,
      carbohydrates_100g: 70,
      fat_100g: 20,
      fiber_100g: 2,
    },
  }, "59412345"));
  assertEquals(food.kcal, 500);
  assertEquals(food.kcal_estimated, false);
  assertEquals(food.basis, "g");
});

Deno.test("estimates kcal from macros when no energy is given", () => {
  const food = ok(toFood({
    product_name: "Iaurt",
    nutriments: { proteins_100g: 4, carbohydrates_100g: 5, fat_100g: 3 },
  }, "5940000000001"));
  assertEquals(food.kcal, 63);
  assertEquals(food.kcal_estimated, true);
  assert(food.missing_fields.includes("kcal"));
});

Deno.test("falls back to the English or Romanian name", () => {
  const food = ok(toFood({
    product_name: "  ",
    product_name_ro: "Lapte  integral",
    nutriments: { "energy-kcal_100g": 64 },
  }, "5940000000002"));
  assertEquals(food.name, "Lapte integral");
  assertEquals(food.missing_fields, ["protein", "carbs", "fat", "fiber"]);
});

Deno.test("rejects products the foods table would refuse", () => {
  assertEquals(
    toFood({ nutriments: { "energy-kcal_100g": 10 } }, "12345678"),
    { reason: "product has no name" },
  );
  assertEquals(
    toFood({ product_name: "x", nutriments: {} }, "12345678"),
    { reason: "product has no nutrition data" },
  );
  assert(
    "reason" in toFood({
      product_name: "x",
      nutriments: { "energy-kcal_100g": 950 },
    }, "12345678"),
  );
  assert(
    "reason" in toFood({
      product_name: "x",
      nutriments: {
        "energy-kcal_100g": 400,
        proteins_100g: 60,
        carbohydrates_100g: 60,
        fat_100g: 0,
      },
    }, "12345678"),
  );
  assert("reason" in toFood(cola, "abc"));
});

Deno.test("detects liquids from any unit field", () => {
  const base = { product_name: "x", nutriments: { "energy-kcal_100g": 40 } };
  assertEquals(
    ok(toFood({ ...base, quantity: "1,5 L" }, "12345678")).basis,
    "ml",
  );
  assertEquals(
    ok(toFood({ ...base, serving_quantity_unit: "ml" }, "12345678")).basis,
    "ml",
  );
  assertEquals(
    ok(toFood({ ...base, quantity: "400 g" }, "12345678")).basis,
    "g",
  );
  assertEquals(ok(toFood(base, "12345678")).basis, "g");
});

Deno.test("ignores out-of-range servings", () => {
  const food = ok(toFood({ ...cola, serving_quantity: 0.001 }, "12345678"));
  assertEquals(food.serving_grams, null);
  assertEquals(food.serving_name, null);
});

Deno.test("UPC-A and EAN-13 forms are both tried", () => {
  assertEquals(barcodeCandidates("012345678905"), [
    "012345678905",
    "0012345678905",
  ]);
  assertEquals(barcodeCandidates("0012345678905"), [
    "0012345678905",
    "012345678905",
  ]);
  assertEquals(barcodeCandidates("5449000000996"), ["5449000000996"]);
});
