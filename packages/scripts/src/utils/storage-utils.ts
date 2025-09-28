import { S3 } from "@aws-sdk/client-s3";
import { Progress } from "@aws-sdk/lib-storage";
import dotenv from "dotenv";
import { bytesToMb } from "./fs-utils";

dotenv.config();

const s3 = new S3({
    endpoint: process.env.AWS_S3_ENDPOINT,
    region: "auto",
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID as string,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY as string,
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
