import dotenv from "dotenv";

dotenv.config();

const AWS_S3_ENDPOINT = process.env.AWS_S3_ENDPOINT as string;
const AWS_ACCESS_KEY_ID = process.env.AWS_ACCESS_KEY_ID as string;
const AWS_SECRET_ACCESS_KEY = process.env.AWS_SECRET_ACCESS_KEY as string;

export { AWS_ACCESS_KEY_ID, AWS_S3_ENDPOINT, AWS_SECRET_ACCESS_KEY };
