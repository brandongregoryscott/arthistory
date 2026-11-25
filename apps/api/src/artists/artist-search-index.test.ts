import { describe, expect, it } from "vitest";
import type { ArtistRecord } from "./artist-search-index";
import { ArtistSearchIndex } from "./artist-search-index";

const artist = (
    number: number,
    name: string,
    aliases: string[] = []
): ArtistRecord => ({
    aliases,
    displayName: name,
    id: String(number).padStart(15, "0"),
    spotifyId: String(number).padStart(22, "0"),
    syncEnabled: false,
});

describe("ArtistSearchIndex", () => {
    it("finds Duster from Dustr with exact/prefix/substring results before fuzzy matches", () => {
        const index = new ArtistSearchIndex();

        [
            artist(1, "Duster"),
            artist(2, "Dustr"),
            artist(3, "Dustr Collective"),
            artist(4, "The Dustr Band"),
        ].forEach((record) => index.add(record));

        index.finish();

        const results = index.search("Dustr");

        expect(results.map((result) => result.name)).toEqual([
            "Dustr",
            "Dustr Collective",
            "The Dustr Band",
            "Duster",
        ]);
    });

    it("applies alias match order before Fuse limits results and resets it for each query", () => {
        const index = new ArtistSearchIndex();

        for (let number = 1; number <= 30; number++) {
            index.add(artist(number, "Duster"));
        }

        index.add(artist(31, "Zed", ["Dustr Collective Orchestra Ensemble"]));
        index.add(artist(32, "Alias", ["Dustr"]));
        index.finish();

        const results = index.search("Dustr");
        const nextResults = index.search("Duster");
        const typoResults = index.search("Daster");

        expect(results).toHaveLength(20);
        expect(results.slice(0, 3).map(({ name }) => name)).toEqual([
            "Alias",
            "Zed",
            "Duster",
        ]);
        expect(nextResults.every(({ name }) => name === "Duster")).toBe(true);
        expect(typoResults[0]?.name).toBe("Duster");
    });

    it("normalizes aliases, accents, case and punctuation while retaining non-Latin and symbol names", () => {
        const index = new ArtistSearchIndex();

        [
            artist(1, "Sigur - Rós", ["Jónsi's Band"]),
            artist(2, "東京事変"),
            artist(3, "!!!"),
            artist(4, "|"),
        ].forEach((record) => index.add(record));

        index.finish();

        expect(index.search("SIGUR ROS")[0]?.name).toBe("Sigur - Rós");
        expect(index.search("jonsis band")[0]?.name).toBe("Sigur - Rós");
        expect(index.search("東京")[0]?.name).toBe("東京事変");
        expect(index.search("!!!")[0]?.name).toBe("!!!");
        expect(index.search("|")[0]?.name).toBe("|");
        expect(index.search("  ")).toEqual([]);
    });

    it("keeps duplicate names distinct, bounds results and reports history separately from sync", () => {
        const index = new ArtistSearchIndex();

        for (let number = 1; number <= 30; number++) {
            index.add(artist(number, "Duster"));
        }

        index.markHistory(artist(1, "").id);
        index.finish();

        const results = index.search("Duster");

        expect(results).toHaveLength(20);
        expect(new Set(results.map((result) => result.id)).size).toBe(20);
        expect(results[0]).toMatchObject({
            followers: { total: null },
            hasHistory: true,
            isTracked: true,
            popularity: null,
            syncEnabled: false,
        });
        expect(results[1]?.hasHistory).toBe(false);
        expect(() => index.search("a".repeat(101))).toThrow("100");
    });

    it("keeps unresolved artists available by ID without inventing a name or metrics", () => {
        const index = new ArtistSearchIndex();
        const record = artist(1, "");

        index.add(record);
        index.finish();

        expect(index.search("unknown")).toEqual([]);
        expect(index.coverage).toEqual({ artists: 1, named: 0, unresolved: 1 });
        expect(
            index.list([record.spotifyId, artist(2, "").spotifyId])[
                record.spotifyId
            ]
        ).toMatchObject({ name: record.spotifyId, popularity: null });
    });

    it("rejects record, name and byte budgets instead of publishing a partial index", () => {
        const records = new ArtistSearchIndex({ maxArtists: 1 });

        records.add(artist(1, "Duster"));

        expect(() => records.add(artist(2, "Other"))).toThrow("budget");
        expect(() =>
            new ArtistSearchIndex({ maxNames: 1 }).add(
                artist(1, "Duster", ["Dust"])
            )
        ).toThrow("budget");
        expect(() =>
            new ArtistSearchIndex({ maxTextBytes: 10 }).add(artist(1, "Duster"))
        ).toThrow("budget");
    });
});
