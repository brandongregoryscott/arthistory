import type { SongSnapshot } from "@repo/common";
import {
    MAX_ARTIST_PAGE_BYTES,
    parseArtistPage as parsePage,
} from "../../../../pocketbase/hooks/artist-page-parser.js";
import { isSpotifyArtistId } from "../utilities/validation";

type ArtistPage = {
    displayName: string;
    metrics: {
        followers: null | number;
        monthlyListeners: null | number;
        popularity: null;
    };
    songs: null | SongSnapshot[];
    spotifyId: string;
};

type PageHttpErrorOptions = { retryAfterMs: null | number; status: number };

const REQUEST_TIMEOUT_MS = 15000;

class ArtistPageHttpError extends Error {
    readonly retryAfterMs: null | number;

    readonly status: number;

    constructor(options: PageHttpErrorOptions) {
        const { retryAfterMs, status } = options;

        super(`Artist page returned HTTP ${status}.`);
        this.retryAfterMs = retryAfterMs;
        this.status = status;
    }
}

class ArtistPageClient {
    async read(input: string): Promise<ArtistPage> {
        const id = parseSpotifyArtistId(input);
        const response = await fetch(`https://open.spotify.com/artist/${id}`, {
            headers: { "Accept-Language": "en-US,en;q=0.9" },
            redirect: "manual",
            signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });

        if (!response.ok) {
            await response.body?.cancel();
            throw new ArtistPageHttpError({
                retryAfterMs: parseRetryAfter(
                    response.headers.get("retry-after")
                ),
                status: response.status,
            });
        }

        if (
            response.headers
                .get("content-type")
                ?.toLowerCase()
                .includes("text/html") !== true
        ) {
            await response.body?.cancel();
            throw new Error("Artist page response must be HTML.");
        }

        return parseArtistPage(await readPageBody(response), id);
    }
}

const parseArtistPage = (html: string, id: string): ArtistPage => {
    if (Buffer.byteLength(html) > MAX_ARTIST_PAGE_BYTES) {
        throw new Error("Artist page exceeds the response size limit.");
    }

    return parsePage(html, id, (encoded) =>
        Buffer.from(encoded, "base64").toString("utf8")
    );
};

const parseSpotifyArtistId = (input: string): string => {
    if (isSpotifyArtistId(input)) {
        return input;
    }

    let url: URL;

    try {
        url = new URL(input);
    } catch {
        throw new Error("Provide a Spotify artist ID or HTTPS artist URL.");
    }

    const id = /^\/artist\/([^/]+)\/?$/.exec(url.pathname)?.[1];

    if (
        url.protocol !== "https:" ||
        url.host !== "open.spotify.com" ||
        url.username !== "" ||
        url.password !== "" ||
        !isSpotifyArtistId(id)
    ) {
        throw new Error("Provide a Spotify artist ID or HTTPS artist URL.");
    }

    return id;
};

const readPageBody = async (response: Response) => {
    const declaredSize = parseInt(
        response.headers.get("content-length") ?? "",
        10
    );

    if (declaredSize > MAX_ARTIST_PAGE_BYTES) {
        await response.body?.cancel();
        throw new Error("Artist page exceeds the response size limit.");
    }

    const reader = response.body?.getReader();

    if (reader == null) {
        throw new Error("Artist page response is empty.");
    }

    const decoder = new TextDecoder();
    let bytes = 0;
    let html = "";

    try {
        while (true) {
            const { done, value } = await reader.read();

            if (done) {
                return html + decoder.decode();
            }

            bytes += value.byteLength;

            if (bytes > MAX_ARTIST_PAGE_BYTES) {
                await reader.cancel();
                throw new Error("Artist page exceeds the response size limit.");
            }

            html += decoder.decode(value, { stream: true });
        }
    } finally {
        reader.releaseLock();
    }
};

const parseRetryAfter = (value: null | string): null | number => {
    if (value == null) {
        return null;
    }

    const delay = /^\d+$/.test(value)
        ? parseInt(value, 10) * 1000
        : Date.parse(value) - Date.now();

    return Number.isSafeInteger(delay) ? Math.max(0, delay) : null;
};

export {
    ArtistPageClient,
    ArtistPageHttpError,
    parseArtistPage,
    parseSpotifyArtistId,
};
export type { ArtistPage };
