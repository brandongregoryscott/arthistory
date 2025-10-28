import { bytesToMb } from "../utils/fs-utils";
import { listObjects } from "../utils/storage-utils";

interface ListDbsOptions {
    bucket: string;
    prefix?: string;
}

const listDbs = async (options: ListDbsOptions) => {
    const { bucket, prefix } = options;
    const objects = await listObjects({ prefix, bucket });

    console.log("| Key | LastModified | Size |");
    console.log("| -- | -- | -- |");
    console.log(
        objects
            .map(
                (object) =>
                    `| ${object.Key} | ${object.LastModified?.toISOString()} | ${bytesToMb(object.Size ?? 0)} |`
            )
            .join("\n")
    );
};

export type { ListDbsOptions };
export { listDbs };
