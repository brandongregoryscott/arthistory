import { bytesToMb } from "../utils/fs-utils";
import type { ListObjectsOptions } from "../utils/storage-utils";
import { listObjects as _listObjects } from "../utils/storage-utils";

const listObjects = async (options: ListObjectsOptions) => {
    const { bucket, prefix } = options;
    const objects = await _listObjects({ prefix, bucket });

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

export { listObjects };
