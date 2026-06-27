import type { _Object } from "@aws-sdk/client-s3";
import type { Progress } from "@aws-sdk/lib-storage";
import { S3 } from "@aws-sdk/client-s3";
import { compact } from "lodash";
import { createWriteStream } from "node:fs";
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
    return Promise.all(keys.map((key) => downloadObject({ bucket, key })));
};

type DownloadObjectOptions = {
    bucket: string;
    key: string;
};

const downloadObject = async (options: DownloadObjectOptions) => {
    const { bucket, key } = options;
    const stopDownloadTimer = createTimerLogger(
        { bucket, key },
        "Downloading object"
    );

    const result = await s3.getObject({
        Bucket: bucket,
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
    stopDownloadTimer();
};

type ListObjectsOptions = {
    bucket: string;
    prefix?: string;
};

const listObjects = async (options: ListObjectsOptions): Promise<_Object[]> => {
    const { bucket, prefix } = options;
    const { Contents: objects = [] } = await s3.listObjectsV2({
        Bucket: bucket,
        Prefix: prefix,
    });

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
