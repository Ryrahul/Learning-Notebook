/**
 * Production migration runner.
 *
 * `drizzle-kit migrate` needs the whole dev toolchain (drizzle-kit, esbuild,
 * a TS config), none of which belongs on a production box. This uses
 * drizzle-orm's own migrator directly against the committed `drizzle/` folder,
 * so the migrations and their bookkeeping table are byte-identical to what
 * `pnpm db:migrate` produces locally.
 *
 * Run from the release root:  node migrate.mjs
 * Requires: DATABASE_URL, plus ./drizzle and ./node_modules/{drizzle-orm,pg}
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";

const here = dirname(fileURLToPath(import.meta.url));
const migrationsFolder = join(here, "drizzle");

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("[migrate] DATABASE_URL is not set");
  process.exit(1);
}

// Fail fast rather than hanging the deploy if Postgres isn't reachable.
const pool = new pg.Pool({ connectionString, max: 1, connectionTimeoutMillis: 10_000 });

try {
  const journal = JSON.parse(
    readFileSync(join(migrationsFolder, "meta", "_journal.json"), "utf8"),
  );
  console.log(`[migrate] ${journal.entries.length} migration(s) in journal`);

  const db = drizzle(pool);
  const started = Date.now();
  await migrate(db, { migrationsFolder });
  console.log(`[migrate] up to date in ${Date.now() - started}ms`);
  process.exitCode = 0;
} catch (error) {
  console.error("[migrate] FAILED:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await pool.end();
}
