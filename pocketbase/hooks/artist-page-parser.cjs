// @ts-check
const MAX_ARTIST_PAGE_BYTES = 2 * 1024 * 1024;
const MAX_DISPLAY_NAME_LENGTH = 500;

/** @param {string} html @param {string} id @param {(encoded: string) => string} [decodeBase64] */
const parseArtistPage = (html, id, decodeBase64 = decodePageState) => {
    if (!/^[A-Za-z0-9]{22}$/.test(id)) {
        throw new Error("Expected a Spotify artist ID.");
    }
    if (html.length > MAX_ARTIST_PAGE_BYTES) {
        throw new Error("Artist page exceeds the response size limit.");
    }

    const script = [
        ...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi),
    ].find((match) =>
        /(?:^|\s)id\s*=\s*["']initialState["']/i.test(match[1] ?? "")
    );
    if (script?.[2] == null || script[2].trim() === "") {
        throw new Error("Artist page is missing initialState.");
    }

    /** @type {unknown} */
    let state;
    try {
        state = JSON.parse(decodeBase64(script[2].trim()));
    } catch {
        throw new Error("Artist page contains invalid initialState JSON.");
    }

    const uri = `spotify:artist:${id}`;
    const artist = asRecord(
        asRecord(asRecord(asRecord(state).entities).items)[uri]
    );
    if (artist.uri !== uri) {
        throw new Error(
            "Artist page identity did not match the requested artist."
        );
    }
    const displayName = asRecord(artist.profile).name;
    if (
        typeof displayName !== "string" ||
        displayName.trim() === "" ||
        displayName.length > MAX_DISPLAY_NAME_LENGTH
    ) {
        throw new Error("Artist page is missing a valid display name.");
    }

    const stats = asRecord(artist.stats);

    return {
        displayName: displayName.trim(),
        metrics: {
            followers: nullableCount(stats.followers),
            monthlyListeners: nullableCount(stats.monthlyListeners),
            popularity: null,
        },
        songs: parseSongs(artist),
        spotifyId: id,
    };
};

// Only inspect the top tracks embedded in this artist's page; never resolve links.
/** @param {Record<string, unknown>} artist */
const parseSongs = (artist) => {
    const { items } = asRecord(asRecord(artist.discography).topTracks);
    if (!Array.isArray(items)) {
        return null;
    }
    /** @type {import("@repo/common").SongStatistics[]} */
    const songs = [];
    const seen = new Set();
    for (const item of items) {
        const track = asRecord(asRecord(item).track);
        const id =
            typeof track.uri === "string"
                ? /^spotify:track:([A-Za-z0-9]{22})$/.exec(track.uri)?.[1]
                : undefined;
        if (
            id == null ||
            seen.has(id) ||
            typeof track.name !== "string" ||
            track.name.trim() === "" ||
            track.name.length > MAX_DISPLAY_NAME_LENGTH
        ) {
            continue;
        }
        const count =
            typeof track.playcount === "string" && /^\d+$/.test(track.playcount)
                ? Number(track.playcount)
                : track.playcount;
        songs.push({
            spotifyId: id,
            name: track.name.trim(),
            listenCount: nullableCount(count),
        });
        seen.add(id);
    }
    return songs;
};

/** @param {unknown} value @returns {Record<string, unknown>} */
const asRecord = (value) =>
    value != null && typeof value === "object" && !Array.isArray(value)
        ? /** @type {Record<string, unknown>} */ (value)
        : {};

/** @param {unknown} value @returns {null | number} */
const nullableCount = (value) =>
    typeof value === "number" && Number.isSafeInteger(value) && value >= 0
        ? value
        : null;

/** @param {string} encoded */
const decodePageState = (encoded) => {
    const alphabet =
        "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    if (
        !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(
            encoded
        )
    ) {
        throw new Error("Invalid base64 state.");
    }
    let bits = 0;
    let buffer = 0;
    const escaped = [];
    for (const character of encoded) {
        if (character === "=") {
            break;
        }
        buffer = (buffer << 6) | alphabet.indexOf(character);
        bits += 6;
        if (bits >= 8) {
            bits -= 8;
            escaped.push(
                "%" + ((buffer >> bits) & 255).toString(16).padStart(2, "0")
            );
        }
    }

    return decodeURIComponent(escaped.join(""));
};

module.exports = { MAX_ARTIST_PAGE_BYTES, parseArtistPage };
