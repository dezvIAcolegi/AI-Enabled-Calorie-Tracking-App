// Checks that contracts/db mirrors supabase/migrations file for file, and that
// every migration name has the Supabase CLI timestamp format. Runs in CI.
//
//   deno run --allow-read supabase/scripts/check-contracts-sync.ts
//   deno run --allow-read --allow-write supabase/scripts/check-contracts-sync.ts --write
//
// --write copies supabase/migrations into contracts/db instead of checking.

const MIGRATIONS_DIR = "supabase/migrations";
const CONTRACT_DIR = "contracts/db";
const NAME_PATTERN = /^\d{14}_[a-z0-9_]+\.sql$/;

async function readSqlFiles(dir: string): Promise<Map<string, string>> {
  const files = new Map<string, string>();
  try {
    for await (const entry of Deno.readDir(dir)) {
      if (entry.isFile && entry.name.endsWith(".sql")) {
        const text = await Deno.readTextFile(`${dir}/${entry.name}`);
        files.set(entry.name, text.replaceAll("\r\n", "\n"));
      }
    }
  } catch (err) {
    if (!(err instanceof Deno.errors.NotFound)) throw err;
  }
  return files;
}

const migrations = await readSqlFiles(MIGRATIONS_DIR);

if (Deno.args.includes("--write")) {
  await Deno.mkdir(CONTRACT_DIR, { recursive: true });
  for (const [name, text] of migrations) {
    await Deno.writeTextFile(`${CONTRACT_DIR}/${name}`, text);
  }
  console.log(`Copied ${migrations.size} migration(s) to ${CONTRACT_DIR}.`);
  Deno.exit(0);
}

const contract = await readSqlFiles(CONTRACT_DIR);
const problems: string[] = [];

for (const [name, text] of migrations) {
  if (!NAME_PATTERN.test(name)) {
    problems.push(
      `${MIGRATIONS_DIR}/${name}: name must look like 20261026120000_description.sql`,
    );
  }
  if (!contract.has(name)) {
    problems.push(`${CONTRACT_DIR}/${name}: missing copy of the migration`);
  } else if (contract.get(name) !== text) {
    problems.push(`${CONTRACT_DIR}/${name}: differs from ${MIGRATIONS_DIR}`);
  }
}
for (const name of contract.keys()) {
  if (!migrations.has(name)) {
    problems.push(`${CONTRACT_DIR}/${name}: no matching migration`);
  }
}

if (problems.length > 0) {
  console.error(
    "contracts/db is out of sync with supabase/migrations " +
      "(fix with --write):\n" +
      problems.map((p) => `  - ${p}`).join("\n"),
  );
  Deno.exit(1);
}
console.log(`contracts/db in sync (${migrations.size} migration file(s)).`);
