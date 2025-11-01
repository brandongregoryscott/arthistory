import { glob } from "fs/promises";
import { DatabaseName } from "../constants/storage";
import { last } from "lodash";

const getDbFilenames = async (): Promise<string[]> => {
    const filenames: string[] = [];
    for await (const fileName of glob(DatabaseName.PartialSnapshotPattern)) {
        filenames.push(fileName);
    }

    return filenames;
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

export { bytesToMb, getDbFilenames, parseTimestamp };
