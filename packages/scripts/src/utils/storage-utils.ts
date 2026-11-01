import type { _Object } from "@aws-sdk/client-s3";
import type { Progress } from "@aws-sdk/lib-storage";
import { S3 } from "@aws-sdk/client-s3";
import { compact } from "lodash";
import { createWriteStream } from "node:fs";
import { rename, rm } from "node:fs/promises";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import {
    AWS_ACCESS_KEY_ID,
    AWS_S3_ENDPOINT,
    AWS_SECRET_ACCESS_KEY,
} from "../config";
import { bytesToMb } from "./fs-utils";
import { createTimerLogger, logger } from "./logger";

const s3 = new S3({
    credentials: {
        accessKeyId: AWS_ACCESS_KEY_ID,
        secretAccessKey: AWS_SECRET_ACCESS_KEY,
    },
    endpoint: AWS_S3_ENDPOINT,
    region: "auto",
});

const logUploadProgress = (progress: Progress) => {
    const { part } = progress;
    const loaded = progress.loaded ?? 1;
    const total = progress.total ?? 1;
    const loadedInMb = bytesToMb(loaded);
    const totalInMb = bytesToMb(total);
    const hasTotal = progress.total !== undefined;

    const percentage = ((loaded / total) * 100).toFixed(2);

    logger.debug(
        {
            loaded,
            loadedInMb,
            part,
            percentage: hasTotal ? percentage : "unknown",
            total,
            totalInMb,
        },
        "Uploading part"
    );
};

type DownloadObjectsOptions = {
    bucket: string;
    keys: string[];
};

const downloadObjects = async (options: DownloadObjectsOptions) => {
    const { bucket, keys } = options;
    for (const key of keys) {
        await downloadObject({ bucket, key });
    }
};

type DownloadObjectOptions = {
    bucket: string;
    filename?: string;
    key: string;
};

const downloadObject = async (options: DownloadObjectOptions) => {
    const { bucket, key, filename = key } = options;
    const stopDownloadTimer = createTimerLogger(
        { bucket, key },
        "Downloading object"
    );

    const result = await s3.getObject({
        Bucket: bucket,
        Key: key,
    });
    if (!(result.Body instanceof Readable)) {
        throw new Error("Object download returned no Node stream");
    }
    const temporary = `${filename}.download`;
    try {
        await pipeline(result.Body, createWriteStream(temporary));
        await rename(temporary, filename);
    } finally {
        await rm(temporary, { force: true });
    }
    stopDownloadTimer();
};

type ListObjectsOptions = {
    bucket: string;
    prefix?: string;
};

const listObjects = async (options: ListObjectsOptions): Promise<_Object[]> => {
    const { bucket, prefix } = options;
    const objects: _Object[] = [];
    let continuationToken: string | undefined;
    do {
        const page = await s3.listObjectsV2({
            Bucket: bucket,
            ContinuationToken: continuationToken,
            Prefix: prefix,
        });
        objects.push(...(page.Contents ?? []));
        continuationToken =
            page.IsTruncated === true ? page.NextContinuationToken : undefined;
        if (page.IsTruncated === true && continuationToken === undefined) {
            throw new Error(
                "Object listing was truncated without a continuation token"
            );
        }
    } while (continuationToken !== undefined);
    return objects;
};

const getObjectKeys = (objects: _Object[]): string[] =>
    compact(objects.map((object) => object.Key));

export type { DownloadObjectOptions, ListObjectsOptions };
export {
    downloadObject,
    downloadObjects,
    getObjectKeys,
    listObjects,
    logUploadProgress,
    s3,
};
