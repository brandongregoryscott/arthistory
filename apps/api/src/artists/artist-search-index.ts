import type { Artist, ArtistWithTrackingStatus } from "@repo/common";
import type { FuseSortFunctionArg } from "fuse.js";
import { ValidationError } from "@repo/common";
import Fuse from "fuse.js";
import { isArray, isBoolean, isString, uniq } from "lodash";
import {
    isPocketBaseRecordId,
    isSpotifyArtistId,
} from "../utilities/validation";

type ArtistRecord = {
    aliases: null | string[];
    displayName: string;
    id: string;
    spotifyId: string;
    syncEnabled: boolean;
};

type IndexLimits = {
    maxArtists?: number;
    maxNames?: number;
    maxTextBytes?: number;
};

type IndexedArtist = {
    artist: ArtistRecord;
    hasHistory: boolean;
    names: string[];
};

const MAX_QUERY_LENGTH = 100;

const MAX_RESULTS = 20;

const MAX_INDEX_ARTISTS = 250000;

const DEFAULT_MAX_NAMES = 1000000;

const DEFAULT_MAX_TEXT_BYTES = 64 * 1024 * 1024;

class ArtistSearchIndex {
    readonly #artists = new Map<string, IndexedArtist>();

    readonly #limits: Required<IndexLimits>;

    readonly #recordIds = new Map<string, IndexedArtist>();

    #fuse: Fuse<IndexedArtist> | undefined;

    #nameCount = 0;

    #query = "";

    #textBytes = 0;

    constructor(limits: IndexLimits = {}) {
        this.#limits = {
            maxArtists: limits.maxArtists ?? MAX_INDEX_ARTISTS,
            maxNames: limits.maxNames ?? DEFAULT_MAX_NAMES,
            maxTextBytes: limits.maxTextBytes ?? DEFAULT_MAX_TEXT_BYTES,
        };

        if (
            Object.values(this.#limits).some(
                (value) => !Number.isSafeInteger(value) || value < 1
            )
        ) {
            throw new Error(
                "Artist search index limits must be positive integers."
            );
        }
    }

    get coverage() {
        let named = 0;

        for (const entry of this.#artists.values()) {
            if (entry.artist.displayName.trim() !== "") {
                named++;
            }
        }

        return {
            artists: this.#artists.size,
            named,
            unresolved: this.#artists.size - named,
        };
    }

    add(record: ArtistRecord) {
        const aliases = record.aliases ?? [];

        if (
            !isPocketBaseRecordId(record.id) ||
            !isSpotifyArtistId(record.spotifyId) ||
            !isString(record.displayName) ||
            record.displayName.length > 500 ||
            !isBoolean(record.syncEnabled) ||
            !isArray(aliases) ||
            aliases.length > 100 ||
            aliases.some((alias) => !isString(alias) || alias.length > 500) ||
            this.#artists.has(record.spotifyId) ||
            this.#recordIds.has(record.id)
        ) {
            throw new Error("Invalid or duplicate artist record.");
        }

        const names = uniq(
            [record.displayName, ...aliases]
                .map(normalizeArtistName)
                .filter((name) => name !== "")
        );
        const nameCount = this.#nameCount + names.length;
        const textBytes =
            this.#textBytes +
            Buffer.byteLength(JSON.stringify(record)) +
            Buffer.byteLength(names.join("\n"));

        if (
            this.#artists.size >= this.#limits.maxArtists ||
            nameCount > this.#limits.maxNames ||
            textBytes > this.#limits.maxTextBytes
        ) {
            throw new Error(
                "Artist search index exceeds its budget; rebuild aborted."
            );
        }

        this.#nameCount = nameCount;
        this.#textBytes = textBytes;

        const entry = {
            artist: { ...record, aliases: [...aliases] },
            hasHistory: false,
            names,
        };

        this.#artists.set(record.spotifyId, entry);
        this.#recordIds.set(record.id, entry);
        this.#fuse = undefined;
    }

    finish() {
        const entries = [...this.#artists.values()].sort((a, b) => {
            const name = a.artist.displayName.localeCompare(
                b.artist.displayName
            );

            return name !== 0
                ? name
                : a.artist.spotifyId.localeCompare(b.artist.spotifyId);
        });

        this.#fuse = new Fuse(entries, {
            ignoreLocation: true,
            keys: ["names"],
            sortFn: (a, b) => {
                const rankA = matchRank(a, this.#query);
                const rankB = matchRank(b, this.#query);

                if (rankA !== rankB) {
                    return rankA - rankB;
                }

                if (rankA === 3 && a.score !== b.score) {
                    return a.score - b.score;
                }

                return a.idx - b.idx;
            },
            threshold: 0.34,
        });
    }

    list(ids: string[]): Record<string, Artist> {
        const result: Record<string, Artist> = {};

        for (const id of ids) {
            const entry = this.#artists.get(id);

            if (entry != null) {
                result[id] = toArtist(entry);
            }
        }

        return result;
    }

    markHistory(recordId: string) {
        const entry = this.#recordIds.get(recordId);

        if (entry != null) {
            entry.hasHistory = true;
        }
    }

    search(input: string): ArtistWithTrackingStatus[] {
        const query = normalizeSearchQuery(input);

        if (query === "") {
            return [];
        }

        if (this.#fuse == null) {
            throw new Error("Artist search index is not ready.");
        }

        this.#query = query;

        return this.#fuse
            .search(query, { limit: MAX_RESULTS })
            .map((result) => toArtist(result.item));
    }
}

const normalizeArtistName = (name: string) => {
    const folded = name
        .normalize("NFKD")
        .replace(/\p{M}/gu, "")
        .toLowerCase()
        .replace(/\s+/gu, " ")
        .trim();
    const letters = folded
        .replace(/[^\p{L}\p{N}\s]/gu, "")
        .replace(/\s+/gu, " ")
        .trim();

    // Symbol-only display names still need to be searchable.
    return letters === "" ? folded : letters;
};

const normalizeSearchQuery = (input: unknown) => {
    if (!isString(input) || input.length > MAX_QUERY_LENGTH) {
        throw new ValidationError(
            `Search name must be a string of at most ${MAX_QUERY_LENGTH} characters.`
        );
    }

    return normalizeArtistName(input);
};

const toArtist = (entry: IndexedArtist): ArtistWithTrackingStatus => ({
    external_urls: {
        spotify: `https://open.spotify.com/artist/${entry.artist.spotifyId}`,
    },
    followers: { href: null, total: null },
    genres: [],
    hasHistory: entry.hasHistory,
    id: entry.artist.spotifyId,
    images: [],
    isTracked: entry.hasHistory,
    name:
        entry.artist.displayName.trim() === ""
            ? entry.artist.spotifyId
            : entry.artist.displayName,
    popularity: null,
    syncEnabled: entry.artist.syncEnabled,
    uri: `spotify:artist:${entry.artist.spotifyId}`,
});

const matchRank = (entry: FuseSortFunctionArg, query: string) => {
    const { matches = [] } = entry;
    let rank = 3;

    for (const { value } of matches) {
        if (value === query) {
            return 0;
        }

        if (value.startsWith(query)) {
            rank = Math.min(rank, 1);
        } else if (value.includes(query)) {
            rank = Math.min(rank, 2);
        }
    }

    return rank;
};

export { ArtistSearchIndex, MAX_INDEX_ARTISTS, normalizeSearchQuery };
export type { ArtistRecord, IndexLimits };
