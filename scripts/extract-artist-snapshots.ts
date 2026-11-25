#!/usr/bin/env -S tsx

import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { createInterface } from "node:readline/promises";
import { DatabaseSync } from "node:sqlite";
import { Writable } from "node:stream";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

type Snapshot = {
    capturedAt: string;
    followers: number;
    monthlyListeners: number;
    popularity: number;
    source: string;
    weekStart: string;
};

type ExtractedHistory = { snapshots: Snapshot[]; spotifyId: string };

type Credentials = { identity: string; password: string };

type RecordIdentity = { id: string };

type LegacyRow = {
    followers: null | number;
    popularity: null | number;
    rowid: number;
    timestamp: number;
};

/**
 * @example
  npx tsx scripts/extract-artist-snapshots.ts \
    ~/arthistory/merged-spotify-data_1769922000.db \
    3AzjK40JembVLZUh90slUW \
    --pocketbase https://bscott-arthistory-pocketbase.tuns.sh
 */
async function main() {
    const { positionals, values } = parseArgs({
        allowPositionals: true,
        options: {
            email: { type: "string" },
            help: { short: "h", type: "boolean" },
            output: { type: "string" },
            pocketbase: { type: "string" },
            "timestamp-unit": { default: "seconds", type: "string" },
        },
    });

    if (values.help === true) {
        report(
            "Usage: npx tsx scripts/extract-artist-snapshots.ts SOURCE ARTIST_ID [--output FILE] [--timestamp-unit seconds|milliseconds] [--pocketbase HTTPS_ORIGIN] [--email EMAIL]\nOmit --pocketbase to extract without network access. Import credentials are prompted locally; the password is hidden."
        );

        return;
    }

    const [source, spotifyId] = positionals;

    if (positionals.length !== 2 || source == null || spotifyId == null) {
        throw new Error("Provide SOURCE and ARTIST_ID; use --help for usage");
    }

    if (values.pocketbase != null) {
        validateOrigin(values.pocketbase);
    }

    const data = extract(source, spotifyId, values["timestamp-unit"]);

    if (data.snapshots.length === 0) {
        throw new Error("No snapshots found for this artist; nothing imported");
    }

    const json = JSON.stringify(data, null, 2) + "\n";

    if (values.output != null) {
        writeFileSync(values.output, json, { flag: "wx" });
    }

    report(
        `Extracted ${data.snapshots.length} weekly snapshots for ${data.spotifyId}.`
    );

    if (values.pocketbase != null) {
        await importSnapshots(
            values.pocketbase,
            await credentials(values.email),
            data
        );

        return;
    }

    process.stdout.write(json);
}

function extract(
    source: string,
    spotifyId: string,
    unit = "seconds"
): ExtractedHistory {
    if (!/^[A-Za-z0-9]{22}$/.test(spotifyId)) {
        throw new Error("artist must be a 22-character Spotify artist ID");
    }

    if (!["seconds", "milliseconds"].includes(unit)) {
        throw new Error("--timestamp-unit must be seconds or milliseconds");
    }

    const multiplier = unit === "seconds" ? 1000 : 1;
    const snapshots = new Map<string, Snapshot>();
    const db = new DatabaseSync(resolve(source), { readOnly: true });

    try {
        db.exec("PRAGMA temp_store=FILE; PRAGMA cache_size=-32768");

        const rows = db.prepare(`
            SELECT rowid, timestamp, followers, popularity FROM artist_snapshots
            WHERE id = ? ORDER BY timestamp DESC, rowid DESC
        `);

        for (const row of rows.iterate(spotifyId) as Iterable<LegacyRow>) {
            const captured = row.timestamp * multiplier;

            if (
                !Number.isSafeInteger(row.timestamp) ||
                !Number.isSafeInteger(captured) ||
                captured < Date.UTC(2000, 0, 1) ||
                captured >= Date.UTC(2100, 0, 1)
            ) {
                throw new Error(
                    `Invalid timestamp at source row ${row.rowid}; check --timestamp-unit`
                );
            }

            for (const field of ["followers", "popularity"] as const) {
                const value = row[field];
                const maximum =
                    field === "popularity" ? 100 : Number.MAX_SAFE_INTEGER;

                if (
                    value !== null &&
                    (!Number.isSafeInteger(value) ||
                        value < 0 ||
                        value > maximum)
                ) {
                    throw new Error(
                        `Invalid ${field} at source row ${row.rowid}`
                    );
                }
            }

            const week = new Date(captured);

            week.setUTCHours(0, 0, 0, 0);
            week.setUTCDate(week.getUTCDate() - ((week.getUTCDay() + 6) % 7));

            const weekStart = week.toISOString();

            if (!snapshots.has(weekStart)) {
                snapshots.set(weekStart, {
                    capturedAt: new Date(captured).toISOString(),
                    followers: row.followers ?? -1,
                    monthlyListeners: -1,
                    popularity: row.popularity ?? -1,
                    source: `legacy:${row.rowid}`,
                    weekStart,
                });
            }
        }
    } finally {
        db.close();
    }

    return {
        snapshots: [...snapshots.values()].sort((a, b) =>
            a.weekStart.localeCompare(b.weekStart)
        ),
        spotifyId,
    };
}

function validateOrigin(input: string) {
    const url = new URL(input);

    if (
        url.protocol !== "https:" ||
        url.username.length > 0 ||
        url.password.length > 0 ||
        url.pathname !== "/" ||
        url.search.length > 0 ||
        url.hash.length > 0
    ) {
        throw new Error(
            "--pocketbase must be the HTTPS origin, without /_/ or credentials"
        );
    }

    return url.origin;
}

async function credentials(email?: string): Promise<Credentials> {
    if (process.stdin.isTTY !== true || process.stdout.isTTY !== true) {
        throw new Error("Enter import credentials in an interactive terminal");
    }

    let hidden = false;

    const output = new Writable({
        write(chunk, encoding, done) {
            if (!hidden) {
                process.stdout.write(chunk, encoding);
            }

            done();
        },
    });

    const rl = createInterface({
        historySize: 0,
        input: process.stdin,
        output,
        terminal: true,
    });

    const abort = new AbortController();

    rl.on("SIGINT", () => abort.abort());

    rl.on("close", () => abort.abort());

    try {
        const identity =
            email == null || email.length === 0
                ? await rl.question("Superuser email: ", {
                      signal: abort.signal,
                  })
                : email;

        process.stdout.write("Superuser password: ");
        hidden = true;

        const password = await rl.question("", { signal: abort.signal });

        return { identity, password };
    } finally {
        hidden = false;
        rl.close();
        report("");
    }
}

async function importSnapshots(
    url: string,
    auth: Credentials,
    data: ExtractedHistory
) {
    const base = validateOrigin(url);
    let token = "";

    async function request<T = unknown>(
        method: string,
        path: string,
        body?: unknown
    ): Promise<T> {
        const response = await fetch(`${base}${path}`, {
            body: body === undefined ? undefined : JSON.stringify(body),
            headers: {
                Authorization: token,
                "Content-Type": "application/json",
            },
            method,
            redirect: "error",
            signal: AbortSignal.timeout(30000),
        });

        if (!response.ok) {
            throw new Error(
                `PocketBase ${method} ${path}: HTTP ${response.status}`
            );
        }

        return (await response.json()) as T;
    }

    async function find(collection: string, filter: string) {
        const query = new URLSearchParams({
            filter,
            perPage: "1",
            skipTotal: "true",
            sort: collection === "snapshots" ? "weekStart" : "spotifyId",
        });
        const { items } = await request<{ items: RecordIdentity[] }>(
            "GET",
            `/api/collections/${collection}/records?${query}`
        );

        return items[0];
    }

    ({ token } = await request<{ token: string }>(
        "POST",
        "/api/collections/_superusers/auth-with-password",
        auth
    ));

    const artist =
        (await find("artists", `spotifyId = "${data.spotifyId}"`)) ??
        (await request<RecordIdentity>(
            "POST",
            "/api/collections/artists/records",
            {
                metadataSource: "legacy-id",
                spotifyId: data.spotifyId,
                syncEnabled: false,
            }
        ));

    let created = 0;

    for (const snapshot of data.snapshots) {
        // Never overwrite an existing week, including newer live captures.
        const week = snapshot.weekStart.replace("T", " ");

        if (
            (await find(
                "snapshots",
                `artist = "${artist.id}" && weekStart = "${week}"`
            )) == null
        ) {
            await request("POST", "/api/collections/snapshots/records", {
                ...snapshot,
                artist: artist.id,
            });
            created++;

            if (created % 20 === 0) {
                report(`Imported ${created} snapshots...`);
            }
        }
    }

    const skipped = data.snapshots.length - created;

    report(
        `Imported ${created}; skipped ${skipped} existing weeks. Enrollment unchanged.`
    );

    return { created, skipped };
}

function report(message: string) {
    process.stdout.write(message + "\n");
}

if (
    process.argv[1] != null &&
    fileURLToPath(import.meta.url) === resolve(process.argv[1])
) {
    main().catch((error) => {
        process.stderr.write(
            (error instanceof Error ? error.message : String(error)) + "\n"
        );
        process.exitCode = 1;
    });
}
