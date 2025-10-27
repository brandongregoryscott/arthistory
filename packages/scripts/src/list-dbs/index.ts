import { program } from "commander";
import { SNAPSHOT_DB_BUCKET_NAME } from "../constants/storage";
import { listDbs } from "./list-dbs";

interface Options {
    bucket: string;
    prefix?: string;
}

program.option("--prefix <prefix>", "Object prefix to filter dbs by");

program.option(
    "--bucket <bucket>",
    "Name of the bucket to list dbs from",
    SNAPSHOT_DB_BUCKET_NAME
);

program.parse();
const { bucket, prefix } = program.opts<Options>();

const main = async () => {
    await listDbs({ bucket, prefix });
};

main();
