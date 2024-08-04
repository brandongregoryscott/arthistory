import sqlite3 from "sqlite3";
import { DATABASE_PATH } from "./config";
import { open } from "sqlite";

const getDb = async () =>
    open({
        filename: DATABASE_PATH,
        driver: sqlite3.cached.Database,
    });

export { getDb };
