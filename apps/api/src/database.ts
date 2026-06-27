import { open } from "sqlite";
import sqlite3 from "sqlite3";
import { DATABASE_PATH } from "./config";

const getDb = async () =>
    open({
        driver: sqlite3.cached.Database,
        filename: DATABASE_PATH,
    });

export { getDb };
