import type { SongSnapshot } from "@repo/common";
import {
    MAX_ARTIST_PAGE_BYTES,
    parseArtistPage,
} from "./artist-page-parser.js";

type PageResult = {
    displayName: null | string;
    metrics?: {
        followers: null | number;
        monthlyListeners: null | number;
        popularity: null | number;
    };
    retryAfterMs: null | number;
    songs?: null | SongSnapshot[];
    status: number;
};

type ReadPageOptions = {
    execute: (args: string[]) => string;
    id: string;
    now: () => number;
    timeoutSeconds: number;
};

const readArtistName = ({
    execute,
    id,
    now,
    timeoutSeconds,
}: ReadPageOptions): PageResult => {
    if (
        !/^[A-Za-z0-9]{22}$/.test(id) ||
        !Number.isSafeInteger(timeoutSeconds) ||
        timeoutSeconds < 1 ||
        timeoutSeconds > 120
    ) {
        throw new Error("Invalid artist page request.");
    }
    const raw = execute([
        "-q",
        "--silent",
        "--show-error",
        "--no-location",
        "--proto",
        "=https",
        "--max-time",
        String(timeoutSeconds),
        "--max-filesize",
        String(MAX_ARTIST_PAGE_BYTES),
        "--include",
        "--suppress-connect-headers",
        "--header",
        "Accept-Language: en-US,en;q=0.9",
        `https://open.spotify.com/artist/${id}`,
    ]);
    let body = raw;
    let headers = "";
    let status = 0;
    do {
        const end = body.indexOf("\r\n\r\n");
        if (end < 0) {
            throw new Error("Invalid artist page HTTP response.");
        }
        headers = body.slice(0, end);
        status = parseInt(
            /^HTTP\/\S+\s+(\d{3})\b/.exec(headers)?.[1] ?? "",
            10
        );
        if (!Number.isSafeInteger(status)) {
            throw new Error("Invalid artist page HTTP status.");
        }
        body = body.slice(end + 4);
    } while (status >= 100 && status < 200);
    const retryAfter = /^retry-after:\s*([^\r\n]+)/im
        .exec(headers)?.[1]
        ?.trim();
    let delay = NaN;
    if (retryAfter != null) {
        delay = /^\d+$/.test(retryAfter)
            ? parseInt(retryAfter, 10) * 1000
            : Date.parse(retryAfter) - now();
    }
    const retryAfterMs =
        Number.isSafeInteger(delay) &&
        Number.isFinite(new Date(now() + delay).getTime())
            ? Math.max(0, delay)
            : null;
    if (status !== 200) {
        return { displayName: null, retryAfterMs, status };
    }
    if (!/^content-type:\s*text\/html\b/im.test(headers)) {
        throw new Error("Artist page response must be HTML.");
    }

    const page = parseArtistPage(body, id);

    return {
        displayName: page.displayName,
        metrics: page.metrics,
        retryAfterMs: null,
        songs: page.songs,
        status,
    };
};

export { readArtistName };
export type { PageResult };
