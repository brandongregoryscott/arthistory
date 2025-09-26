import { glob } from "fs/promises";
import { PARTIAL_DB_PATTERN } from "./constants/storage";

const getDbFileNames = async (): Promise<string[]> => {
    const fileNames: string[] = [];
    for await (const fileName of glob(PARTIAL_DB_PATTERN)) {
        fileNames.push(fileName);
    }

    return fileNames;
};

export { getDbFileNames };
