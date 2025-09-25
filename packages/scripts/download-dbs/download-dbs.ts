import { S3 } from "@aws-sdk/client-s3";
import dotenv from "dotenv";
import { PARTIAL_DB_PREFIX, S3_BUCKET_NAME } from "../constants/storage";
import { writeFile } from "node:fs/promises";

dotenv.config();

const main = async () => {
    const s3 = new S3({
        endpoint: process.env.AWS_S3_ENDPOINT,
        region: "auto",
        credentials: {
            accessKeyId: process.env.AWS_ACCESS_KEY_ID as string,
            secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY as string,
        },
    });

    const { Contents: objects = [] } = await s3.listObjectsV2({
        Bucket: S3_BUCKET_NAME,
        Prefix: PARTIAL_DB_PREFIX,
    });

    console.log(`Found ${objects.length} partial databases...`);

    await Promise.all(
        objects.map(async (object) => {
            const key = object.Key;
            if (key === undefined) {
                return;
            }

            const result = await s3.getObject({
                Bucket: S3_BUCKET_NAME,
                Key: key,
            });
            const body = await result.Body?.transformToByteArray();
            if (body === undefined) {
                return;
            }

            await writeFile(key, body);
        })
    );
};

main();
