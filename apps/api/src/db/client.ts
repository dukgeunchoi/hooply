import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema/index";

const connectionString =
  process.env.DATABASE_URL ?? "postgres://hooply:hooply@localhost:5432/hooply";

export const pool = new Pool({ connectionString });
export const db = drizzle(pool, { schema });
