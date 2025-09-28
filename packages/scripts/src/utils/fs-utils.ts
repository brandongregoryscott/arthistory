import { glob } from "fs/promises";
import { PARTIAL_DB_PATTERN } from "../constants/storage";
import { last } from "lodash";

const getDbFileNames = async (): Promise<string[]> => {
    const fileNames: string[] = [];
    for await (const fileName of glob(PARTIAL_DB_PATTERN)) {
        fileNames.push(fileName);
    }

    return fileNames;
};

const parseTimestamp = (fileName: string): number | undefined => {
    if (!fileName.includes("_")) {
        return undefined;
    }

    const timestampString = last(fileName.split("_"))?.replace(".db", "");
    if (timestampString === undefined) {
        return undefined;
    }

    const timestamp = parseInt(timestampString);
    if (isNaN(timestamp)) {
        return undefined;
    }

    return timestamp;
};

const bytesToMb = (bytes: number): string =>
    `${(bytes / 1024 / 1024).toFixed(2)} MB`;

export { getDbFileNames, bytesToMb, parseTimestamp };
