type ArtistStats = {
    followers: number;
    monthlyListeners: number;
};

const validateArtistId = (id: string): string => {
    if (!/^[a-zA-Z0-9]{22}$/.test(id)) {
        throw new Error("Expected a 22-character Spotify artist ID");
    }
    return id;
};

// Spotify ships the exact counts in base64 JSON, rather than display text.
const parseArtistHtml = (html: string, id: string): ArtistStats => {
    validateArtistId(id);
    const script = [
        ...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi),
    ].find((match) => /\bid\s*=\s*["']initialState["']/i.test(match[1] ?? ""));
    if (script?.[2] === undefined || script[2].trim() === "") {
        throw new Error("Artist page is missing initialState");
    }
    let state;
    try {
        state = JSON.parse(
            Buffer.from(script[2].trim(), "base64").toString("utf8")
        );
    } catch {
        // Do not include snippets of page state (which may contain session data)
        // in errors that the worker writes to its logs.
        throw new Error("Artist page contains invalid initialState JSON");
    }
    const artist = state?.entities?.items?.[`spotify:artist:${id}`];
    if (artist?.uri !== `spotify:artist:${id}`) {
        throw new Error(
            "Artist page identity did not match the requested artist"
        );
    }
    const { followers, monthlyListeners } = artist.stats ?? {};
    if (
        ![followers, monthlyListeners].every(
            (value) => Number.isSafeInteger(value) && value >= 0
        )
    ) {
        throw new Error("Artist page is missing valid audience counts");
    }
    return { followers, monthlyListeners };
};

class ArtistPageError extends Error {
    constructor(
        readonly status: number,
        readonly retryAfterMs: number
    ) {
        super(`Artist page returned HTTP ${status}`);
    }
}

const fetchArtistStats = async (id: string): Promise<ArtistStats> => {
    validateArtistId(id);
    const response = await fetch(`https://open.spotify.com/artist/${id}`, {
        headers: { "Accept-Language": "en-US,en;q=0.9" },
        signal: AbortSignal.timeout(30000),
    });
    if (!response.ok) {
        const retryAfter = response.headers.get("retry-after");
        const seconds = retryAfter === null ? NaN : Number(retryAfter);
        const delay = Number.isFinite(seconds)
            ? seconds * 1000
            : Date.parse(retryAfter ?? "") - Date.now();
        await response.body?.cancel();
        throw new ArtistPageError(
            response.status,
            Math.max(0, Number.isFinite(delay) ? delay : 0)
        );
    }
    return parseArtistHtml(await response.text(), id);
};

export { ArtistPageError, fetchArtistStats, parseArtistHtml, validateArtistId };
export type { ArtistStats };
