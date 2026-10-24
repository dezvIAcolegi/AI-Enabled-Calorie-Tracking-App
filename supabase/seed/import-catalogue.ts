// Imports the caltracker food catalogue CSV into the shared `foods` table.
// The CSV stays outside the repo (10 MB, ODbL data). Safe to re-run: rows are
// upserted by id. Rows that break the schema's checks are skipped and listed in
// <csv>.dropped.txt.
//
//   deno run --allow-read --allow-write --allow-net --allow-env \
//     --env-file=supabase/.env.dev supabase/seed/import-catalogue.ts <path-to-csv>
//
// --dry-run cleans and counts the rows without connecting to any database.

import { parse } from "jsr:@std/csv@^1.0.0/parse";
import { createClient } from "npm:@supabase/supabase-js@2";

type CsvRow = Record<
  | "source"
  | "source_ref"
  | "code"
  | "name"
  | "brand"
  | "basis"
  | "kcal"
  | "protein"
  | "carbs"
  | "fat"
  | "fiber"
  | "serving_name"
  | "serving_grams"
  | "kcal_estimated",
  string
>;

type FoodRow = {
  id: string;
  origin: "usda" | "off" | "ciqual" | "ro";
  name: string;
  brand: string | null;
  barcode: string | null;
  basis: "g" | "ml";
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
  kcal_estimated: boolean;
  serving_name: string | null;
  serving_grams: number | null;
};

const BATCH_SIZE = 1000;
const REF_PATTERN = /^[A-Za-z0-9._-]{1,56}$/;
const BARCODE_PATTERN = /^[0-9]{8,14}$/;

const ENTITIES: Record<string, string> = {
  amp: "&",
  quot: '"',
  apos: "'",
  lt: "<",
  gt: ">",
  nbsp: " ",
};

function decodeEntities(text: string): string {
  return text.replace(/&(#x?[0-9a-fA-F]+|[a-z]+);/g, (match, code: string) => {
    if (code.startsWith("#x")) {
      return String.fromCodePoint(parseInt(code.slice(2), 16));
    }
    if (code.startsWith("#")) {
      return String.fromCodePoint(Number(code.slice(1)));
    }
    return ENTITIES[code] ?? match;
  });
}

function clean(text: string, maxLength: number): string | null {
  const value = decodeEntities(text).replace(/\s+/g, " ").trim();
  return value === "" ? null : value.slice(0, maxLength);
}

function foodId(source: string, ref: string): string | null {
  if (!REF_PATTERN.test(ref)) return null;
  switch (source) {
    case "usda":
      return `fdc:${ref}`;
    case "off":
      return `off:${ref}`;
    case "ciqual":
      return `manual:ciqual-${ref}`;
    case "ro":
      return `manual:ro-${ref}`;
    default:
      return null;
  }
}

// Returns the row to insert, or the reason it was dropped.
function toFood(row: CsvRow): FoodRow | string {
  const id = foodId(row.source, row.source_ref);
  if (!id) return `unknown source or bad id: ${row.source}/${row.source_ref}`;

  const name = clean(row.name, 300);
  if (!name) return "empty name";

  const [kcal, protein, carbs, fat, fiber] = [
    row.kcal,
    row.protein,
    row.carbs,
    row.fat,
    row.fiber || "0",
  ].map(Number);
  if (
    [kcal, protein, carbs, fat, fiber].some((v) => !Number.isFinite(v) || v < 0)
  ) {
    return "missing or negative macro";
  }
  if (kcal > 900) return `kcal ${kcal} > 900 per 100 g`;
  if (protein + carbs + fat + fiber > 100.5) {
    return "macros add up to more than 100 g";
  }

  // The column keeps 2 decimals, so a serving like 0.004 g would round to 0.
  const servingGrams = Math.round(Number(row.serving_grams) * 100) / 100;
  const hasServing = row.serving_grams !== "" && servingGrams > 0 &&
    servingGrams <= 5000;

  return {
    id,
    origin: row.source as FoodRow["origin"],
    name,
    brand: clean(row.brand, 200),
    barcode: BARCODE_PATTERN.test(row.code) ? row.code : null,
    basis: row.basis === "ml" ? "ml" : "g",
    kcal,
    protein,
    carbs,
    fat,
    fiber,
    kcal_estimated: row.kcal_estimated === "1",
    serving_name: hasServing ? clean(row.serving_name, 100) : null,
    serving_grams: hasServing ? servingGrams : null,
  };
}

const dryRun = Deno.args.includes("--dry-run");
const csvPath = Deno.args.find((arg) => !arg.startsWith("--"));
if (!csvPath) {
  console.error(
    "Usage: import-catalogue.ts [--dry-run] <path-to-caltracker-food-catalog.csv>",
  );
  Deno.exit(1);
}

const url = Deno.env.get("SUPABASE_URL");
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
if (!dryRun && (!url || !serviceKey)) {
  console.error(
    "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set (use --env-file).",
  );
  Deno.exit(1);
}

const text = (await Deno.readTextFile(csvPath)).replace(/^﻿/, "");
const rows = parse(text, { skipFirstRow: true }) as CsvRow[];

const foods: FoodRow[] = [];
const dropped: string[] = [];
for (const row of rows) {
  const result = toFood(row);
  if (typeof result === "string") {
    dropped.push(`${row.source}/${row.source_ref}\t${row.name}\t${result}`);
  } else {
    foods.push(result);
  }
}

const droppedPath = `${csvPath}.dropped.txt`;
await Deno.writeTextFile(droppedPath, dropped.join("\n") + "\n");

console.log(`Target: ${dryRun ? "none (dry run)" : url}`);
console.log(
  `Read ${rows.length} rows: ${foods.length} to import, ${dropped.length} dropped (listed in ${droppedPath}).`,
);
if (dryRun) Deno.exit(0);

const supabase = createClient(url!, serviceKey!, {
  auth: { persistSession: false },
});

for (let start = 0; start < foods.length; start += BATCH_SIZE) {
  const batch = foods.slice(start, start + BATCH_SIZE);
  const { error } = await supabase.from("foods").upsert(batch, {
    onConflict: "id",
  });
  if (error) {
    console.error(`Batch starting at row ${start} failed: ${error.message}`);
    Deno.exit(1);
  }
  console.log(
    `  ${Math.min(start + BATCH_SIZE, foods.length)} / ${foods.length}`,
  );
}

console.log("Done.");
