import { _Object } from "@aws-sdk/client-s3";
import { PARTIAL_DB_PREFIX, BUCKET_NAME } from "../constants/storage";
import { createWriteStream } from "node:fs";
import { getDbFileNames } from "../utils/fs-utils";
import { s3 } from "../utils/storage-utils";

const main = async () => {
    const { Contents: objects = [] } = await s3.listObjectsV2({
        Bucket: BUCKET_NAME,
        Prefix: PARTIAL_DB_PREFIX,
    });

    const localDbs = await getDbFileNames();
    const total = objects.length;
    const missingObjects = objects.filter(
        (object) => !localDbs.includes(object.Key ?? "")
    );
    const count = missingObjects.length;

    const startLabel = `Downloading ${count} partial databases (${total - count} found locally)...`;
    console.log(startLabel);

    const endLabel = `Downloaded ${count} partial databases`;
    console.time(endLabel);

    await downloadObjects(missingObjects);

    console.timeEnd(endLabel);
};

const downloadObjects = async (objects: _Object[]) =>
    Promise.all(objects.map(downloadObject));

const downloadObject = async (object: _Object) => {
    const key = object.Key;
    if (key === undefined) {
        return;
    }

    const result = await s3.getObject({
        Bucket: BUCKET_NAME,
        Key: key,
    });
    const objectStream = result.Body?.transformToWebStream();
    if (objectStream === undefined) {
        return;
    }

    const fileStream = createWriteStream(key);
    const writableStream = new WritableStream({
        write: (chunk) => {
            fileStream.write(chunk);
        },
    });
    await objectStream.pipeTo(writableStream);
};

main();
