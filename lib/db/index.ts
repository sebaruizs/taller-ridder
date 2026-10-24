import { drizzle as drizzlePg } from "drizzle-orm/postgres-js";
import { migrate as migratePg } from "drizzle-orm/postgres-js/migrator";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { migrate as migratePglite } from "drizzle-orm/pglite/migrator";
import postgres from "postgres";
import { PGlite } from "@electric-sql/pglite";
import path from "node:path";
import fs from "node:fs";
import * as schema from "./schema";
import { env } from "../env";

type Db = ReturnType<typeof drizzlePg<typeof schema>>;

const globalDb = globalThis as unknown as { __db?: Db; __dbReady?: Promise<void> };

function crear(): { db: Db; listo: Promise<void> } {
  const url = env().DATABASE_URL;
  const migrationsFolder = path.join(process.cwd(), "drizzle");
  // pglite:// es para desarrollo local sin instalar Postgres.
  if (url.startsWith("pglite://")) {
    const dir = path.resolve(url.slice("pglite://".length));
    fs.mkdirSync(dir, { recursive: true });
    const client = new PGlite(dir);
    const db = drizzlePglite(client, { schema });
    return { db: db as unknown as Db, listo: migratePglite(db, { migrationsFolder }) };
  }
  const client = postgres(url, { max: 5 });
  const db = drizzlePg(client, { schema });
  return { db, listo: migratePg(db, { migrationsFolder }) };
}

export async function getDb(): Promise<Db> {
  if (!globalDb.__db) {
    const { db, listo } = crear();
    globalDb.__db = db;
    globalDb.__dbReady = listo.catch((e) => {
      globalDb.__db = undefined;
      throw e;
    });
  }
  await globalDb.__dbReady;
  return globalDb.__db!;
}

export { schema };
