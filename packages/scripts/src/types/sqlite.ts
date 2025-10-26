import type { Database as SqliteDatabase } from "sqlite";
import type sqlite3 from "sqlite3";

type SQLStatement = [sql: string, values: any[]];

type Database = SqliteDatabase<sqlite3.Database, sqlite3.Statement>;

export type { Database, SQLStatement };
