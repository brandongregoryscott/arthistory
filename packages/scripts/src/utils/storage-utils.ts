import { S3 } from "@aws-sdk/client-s3";
import { Progress } from "@aws-sdk/lib-storage";
import { bytesToMb } from "./fs-utils";
import {
    AWS_ACCESS_KEY_ID,
    AWS_S3_ENDPOINT,
    AWS_SECRET_ACCESS_KEY,
} from "../config";

const s3 = new S3({
    endpoint: AWS_S3_ENDPOINT,
    region: "auto",
    credentials: {
        accessKeyId: AWS_ACCESS_KEY_ID,
        secretAccessKey: AWS_SECRET_ACCESS_KEY,
    },
});

const logUploadProgress = (progress: Progress) => {
    const { part } = progress;
    const loaded = progress.loaded ?? 1;
    const total = progress.total ?? 1;
    const hasTotal = progress.total !== undefined;

    const percentage = ((loaded / total) * 100).toFixed(2);

    console.log(
        `Part ${part} - ${bytesToMb(loaded)} / ${hasTotal ? bytesToMb(total) : "unknown"} - ${hasTotal ? percentage : "unknown"}% complete`
    );
};

export { s3, logUploadProgress };
