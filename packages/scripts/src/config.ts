import dotenv from "dotenv";

dotenv.config({
    debug: process.env.DEBUG?.toLowerCase() === true.toString(),
    quiet: true,
});

const AWS_S3_ENDPOINT = process.env.AWS_S3_ENDPOINT as string;
const AWS_ACCESS_KEY_ID = process.env.AWS_ACCESS_KEY_ID as string;
const AWS_SECRET_ACCESS_KEY = process.env.AWS_SECRET_ACCESS_KEY as string;
const CLIENT_IDS = (process.env.CLIENT_IDS ?? "").split(",");
const CLIENT_SECRETS = (process.env.CLIENT_SECRETS ?? "").split(",");

export {
    AWS_ACCESS_KEY_ID,
    AWS_S3_ENDPOINT,
    AWS_SECRET_ACCESS_KEY,
    CLIENT_IDS,
    CLIENT_SECRETS,
};
