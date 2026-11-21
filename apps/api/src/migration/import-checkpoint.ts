import { isPlainObject } from "lodash";
import { createHash, randomUUID } from "node:crypto";
import {
    closeSync,
    existsSync,
    fsyncSync,
    mkdirSync,
    openSync,
    readFileSync,
    renameSync,
    rmSync,
    statSync,
    writeFileSync,
} from "node:fs";
import { dirname, resolve } from "node:path";
import type { ImportCursor } from "./import-cursor";
import { isSpotifyArtistId } from "../utilities/id-validation";
import { importId, validateSnapshot } from "./prepared-records";

const fingerprint = (directory: string) => {
    const report = resolve(directory, "report.json");
    if (statSync(report).size > 65536) {
        throw new Error("Import report is too large.");
    }
    return {
        directory: resolve(directory),
        files: ["artists.jsonl", "snapshots.jsonl"].map((name) => {
            const stat = statSync(resolve(directory, name), { bigint: true });
            return {
                bytes: Number(stat.size),
                changed: String(stat.ctimeNs),
                device: String(stat.dev),
                inode: String(stat.ino),
                modified: String(stat.mtimeNs),
                name,
            };
        }),
        report: createHash("sha256").update(readFileSync(report)).digest("hex"),
    };
};

type CheckpointData = {
    cursor: ImportCursor;
    source: ReturnType<typeof fingerprint>;
    target: string;
    version: number;
};

class ImportCheckpoint {
    readonly #directory: string;
    readonly #filename: string;
    readonly #source: ReturnType<typeof fingerprint>;
    readonly #target: string;
    #cursor: ImportCursor | undefined;
    #savedAt = 0;

    constructor(directory: string, filename: string, target: string) {
        this.#directory = directory;
        this.#filename = resolve(filename);
        this.#source = fingerprint(directory);
        this.#target = target;
        if (!existsSync(this.#filename)) {
            return;
        }
        if (statSync(this.#filename).size > 65536) {
            throw new Error("Import checkpoint is too large.");
        }
        const data = JSON.parse(
            readFileSync(this.#filename, "utf8")
        ) as Partial<CheckpointData>;
        if (
            !isPlainObject(data) ||
            data.version !== 1 ||
            data.target !== target ||
            JSON.stringify(data.source) !== JSON.stringify(this.#source)
        ) {
            throw new Error(
                "Checkpoint does not match this prepared export and PocketBase target; use a new checkpoint or reconcile from the beginning."
            );
        }
        const { cursor } = data;
        if (!isPlainObject(cursor) || cursor == null) {
            throw new Error("Invalid import checkpoint cursor.");
        }
        for (const key of [
            "artists",
            "artistsOffset",
            "snapshots",
            "snapshotsOffset",
        ] as const) {
            if (!Number.isSafeInteger(cursor[key]) || cursor[key] < 0) {
                throw new Error("Invalid import checkpoint cursor.");
            }
        }
        if (
            cursor.artists < 1 ||
            cursor.snapshots < cursor.artists ||
            !isSpotifyArtistId(cursor.previousArtist) ||
            cursor.artistsOffset > (this.#source.files[0]?.bytes ?? 0) ||
            cursor.snapshotsOffset > (this.#source.files[1]?.bytes ?? 0)
        ) {
            throw new Error("Invalid import checkpoint position.");
        }
        const anchor = validateSnapshot(cursor.anchor);
        if (anchor.artist !== importId(`artist:${cursor.previousArtist}`)) {
            throw new Error("Invalid import checkpoint anchor.");
        }
        this.#cursor = { ...cursor, anchor };
    }

    get cursor() {
        return this.#cursor;
    }

    save(cursor: ImportCursor, force = false) {
        if (
            cursor.artists === 0 ||
            cursor.artists + cursor.snapshots <=
                (this.#cursor == null
                    ? 0
                    : this.#cursor.artists + this.#cursor.snapshots)
        ) {
            return;
        }
        const now = Date.now();
        if (!force && now - this.#savedAt < 5000) {
            return;
        }
        if (
            JSON.stringify(fingerprint(this.#directory)) !==
            JSON.stringify(this.#source)
        ) {
            throw new Error(
                "Prepared export changed during import; checkpoint not advanced."
            );
        }
        mkdirSync(dirname(this.#filename), { recursive: true });
        const temporary = this.#filename + "." + randomUUID() + ".tmp";
        let fd: number | undefined;
        try {
            fd = openSync(temporary, "wx", 0o600);
            writeFileSync(
                fd,
                JSON.stringify({
                    cursor,
                    source: this.#source,
                    target: this.#target,
                    version: 1,
                } satisfies CheckpointData)
            );
            fsyncSync(fd);
            closeSync(fd);
            fd = undefined;
            renameSync(temporary, this.#filename);
            this.#cursor = cursor;
            this.#savedAt = now;
        } finally {
            if (fd != null) {
                closeSync(fd);
            }
            rmSync(temporary, { force: true });
        }
    }
}

export { ImportCheckpoint };
