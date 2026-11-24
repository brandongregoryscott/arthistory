import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { readArtistName } from "../../../../pocketbase/hooks/artist-page-http.js";
import { parseArtistPage as parseSharedPage } from "../../../../pocketbase/hooks/artist-page-parser.js";
import {
    ArtistPageClient,
    ArtistPageHttpError,
    parseArtistPage,
    parseSpotifyArtistId,
} from "./artist-page";

const ID = "6lcwlkAjBPSKnFBZjjZFJs";
const OTHER_ID = "5AyEXCtu3xnnsTGCo4RVZh";
const FIXTURE = readFileSync(
    resolve(__dirname, "fixtures/artist.html"),
    "utf8"
);

const htmlFor = (artist: unknown) =>
    `<script type='text/plain' id='initialState'>${Buffer.from(JSON.stringify({ entities: { items: { [`spotify:artist:${ID}`]: artist } } })).toString("base64")}</script>`;

const artist = (stats: unknown = {}) => ({
    profile: { name: "東京事変 & Sigur Rós" },
    stats,
    uri: `spotify:artist:${ID}`,
});

const htmlResponse = (body: BodyInit) =>
    new Response(body, {
        headers: { "content-type": "text/html; charset=utf-8" },
    });

afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
});

describe("public artist page parsing", () => {
    it("extracts the name and exact nullable metrics from the sanitized page fixture", () => {
        const result = parseArtistPage(FIXTURE, ID);

        expect(result).toMatchObject({
            displayName: "Alex G",
            metrics: {
                followers: 4550328,
                monthlyListeners: 9137860,
                popularity: null,
            },
            spotifyId: ID,
        });
        expect(() => parseArtistPage(FIXTURE, OTHER_ID)).toThrow("identity");
    });

    it.each([
        {},
        { followers: null },
        { followers: "10", monthlyListeners: -1 },
        { followers: 0.5, monthlyListeners: Number.MAX_SAFE_INTEGER + 1 },
    ])("preserves unavailable or invalid counts as null for %j", (stats) => {
        const result = parseArtistPage(htmlFor(artist(stats)), ID);

        expect(result.metrics).toEqual({
            followers: null,
            monthlyListeners: null,
            popularity: null,
        });
        expect(result.displayName).toBe("東京事変 & Sigur Rós");
    });

    it("keeps measured zero distinct from unavailable counts", () => {
        const result = parseArtistPage(
            htmlFor(artist({ followers: 0, monthlyListeners: 0 })),
            ID
        );

        expect(result.metrics).toEqual({
            followers: 0,
            monthlyListeners: 0,
            popularity: null,
        });
    });

    it.each([
        "<html>Sign in</html>",
        "<script data-id='initialState'>e30=</script>",
        "<script id='initialState'></script>",
        "<script id='initialState'>bm90LWpzb24=</script>",
        htmlFor({ ...artist(), profile: { name: "" } }),
        htmlFor({ ...artist(), profile: { name: "x".repeat(501) } }),
        htmlFor({ ...artist(), uri: `spotify:artist:${OTHER_ID}` }),
    ])(
        "rejects incomplete, challenge or mismatched state without leaking page data",
        (html) => {
            expect(() => parseArtistPage(html, ID)).toThrow();
            expect(() => parseArtistPage(html, ID)).toThrow(/^Artist page /);
        }
    );

    it("reads embedded songs with both Node and PocketBase base64 decoders", () => {
        const page = parseArtistPage(FIXTURE, ID);
        expect(page.songs).toEqual([
            {
                listenCount: 436678602,
                name: "Sarah",
                spotifyId: "4HuiEuJ7ZW8jewUuZBg6sk",
            },
            {
                listenCount: 0,
                name: "東京 & Sigur Rós",
                spotifyId: "35UO6dWrEPLmeSVXtAysS4",
            },
        ]);
        expect(parseSharedPage(FIXTURE, ID)).toEqual(page);
    });

    it("passes songs through the scheduled HTTP reader using one artist-page request", () => {
        const execute = vi.fn(
            () => `HTTP/2 200\r\nContent-Type: text/html\r\n\r\n${FIXTURE}`
        );
        const result = readArtistName({
            execute,
            id: ID,
            now: () => Date.now(),
            timeoutSeconds: 20,
        });
        expect(result.songs).toEqual(parseArtistPage(FIXTURE, ID).songs);
        expect(execute).toHaveBeenCalledOnce();
        expect(execute.mock.calls[0]).toEqual([
            expect.arrayContaining([
                "--no-location",
                `https://open.spotify.com/artist/${ID}`,
            ]),
        ]);
    });

    it("distinguishes missing and empty embedded song lists", () => {
        expect(parseArtistPage(htmlFor(artist()), ID).songs).toBeNull();
        expect(
            parseArtistPage(
                htmlFor({
                    ...artist(),
                    discography: { topTracks: { items: [] } },
                }),
                ID
            ).songs
        ).toEqual([]);
    });

    it("skips invalid identities and names, deduplicates by ID and preserves unavailable counts", () => {
        const track = {
            name: "Same name",
            playcount: "-1",
            uri: `spotify:track:${OTHER_ID}`,
        };
        const tracks = [
            track,
            { ...track, playcount: "100" },
            {
                ...track,
                playcount: "9007199254740992",
                uri: `spotify:track:${ID}`,
            },
            { ...track, uri: "https://example.com/track" },
            { ...track, name: " " },
            null,
        ];
        const page = parseArtistPage(
            htmlFor({
                ...artist(),
                discography: {
                    topTracks: { items: tracks.map((track) => ({ track })) },
                },
            }),
            ID
        );
        expect(page.songs).toEqual([
            { listenCount: null, name: "Same name", spotifyId: OTHER_ID },
            { listenCount: null, name: "Same name", spotifyId: ID },
        ]);
    });

    it.each([
        ID,
        `https://open.spotify.com/artist/${ID}`,
        `https://open.spotify.com/artist/${ID}/?si=example#fragment`,
    ])("accepts an artist ID or URL %s", (input) => {
        expect(parseSpotifyArtistId(input)).toBe(ID);
    });

    it.each([
        "invalid",
        `http://open.spotify.com/artist/${ID}`,
        `https://other.example/artist/${ID}`,
        `https://open.spotify.com/album/${ID}`,
        `https://user@open.spotify.com/artist/${ID}`,
        `https://open.spotify.com:9999/artist/${ID}`,
    ])("rejects unsupported input %s", (input) => {
        expect(() => parseSpotifyArtistId(input)).toThrow("artist ID");
    });
});

describe("ArtistPageClient", () => {
    it("requests one canonical public URL with a timeout and no redirect following", async () => {
        const fetch = vi.fn(async () => htmlResponse(FIXTURE));
        vi.stubGlobal("fetch", fetch);
        const timeout = vi.spyOn(AbortSignal, "timeout");

        const result = await new ArtistPageClient().read(
            `https://open.spotify.com/artist/${ID}?si=tracking`
        );

        expect(result.displayName).toBe("Alex G");
        expect(fetch).toHaveBeenCalledOnce();
        expect(fetch).toHaveBeenCalledWith(
            `https://open.spotify.com/artist/${ID}`,
            expect.objectContaining({
                redirect: "manual",
                signal: expect.any(AbortSignal),
            })
        );
        expect(timeout).toHaveBeenCalledWith(15000);
    });

    it.each(["172800", new Date(Date.now() + 172800000).toUTCString()])(
        "reports throttling and Retry-After %s without retrying",
        async (retryAfter) => {
            const fetch = vi.fn(
                async () =>
                    new Response("throttled", {
                        headers: { "retry-after": retryAfter },
                        status: 429,
                    })
            );
            vi.stubGlobal("fetch", fetch);

            const error = await new ArtistPageClient()
                .read(ID)
                .catch((error: unknown) => error);

            expect(error).toBeInstanceOf(ArtistPageHttpError);
            expect(error).toMatchObject({
                retryAfterMs: expect.any(Number),
                status: 429,
            });
            expect((error as ArtistPageHttpError).retryAfterMs).toBeGreaterThan(
                172790000
            );
            expect(fetch).toHaveBeenCalledOnce();
        }
    );

    it("rejects a redirect without requesting its destination", async () => {
        const fetch = vi.fn(
            async () =>
                new Response(null, {
                    headers: { location: "https://other.example/" },
                    status: 302,
                })
        );
        vi.stubGlobal("fetch", fetch);

        await expect(new ArtistPageClient().read(ID)).rejects.toMatchObject({
            status: 302,
        });

        expect(fetch).toHaveBeenCalledOnce();
    });

    it("reports an unknown retry delay and cancels an error body", async () => {
        const response = new Response("private upstream content", {
            status: 503,
        });
        const { body } = response;
        if (body == null) {
            throw new Error("Expected a response body.");
        }
        const cancel = vi.spyOn(body, "cancel");
        vi.stubGlobal(
            "fetch",
            vi.fn(async () => response)
        );

        await expect(new ArtistPageClient().read(ID)).rejects.toMatchObject({
            message: "Artist page returned HTTP 503.",
            retryAfterMs: null,
            status: 503,
        });

        expect(cancel).toHaveBeenCalledOnce();
    });

    it("rejects a declared oversized body before reading it", async () => {
        const response = htmlResponse("unused");
        response.headers.set("content-length", String(3 * 1024 * 1024));
        vi.stubGlobal(
            "fetch",
            vi.fn(async () => response)
        );

        await expect(new ArtistPageClient().read(ID)).rejects.toThrow(
            "size limit"
        );

        expect(response.body?.locked).toBe(false);
    });

    it("bounds streamed bodies even when Content-Length is absent", async () => {
        const cancel = vi.fn();
        const body = new ReadableStream({
            cancel,
            start(controller) {
                controller.enqueue(new Uint8Array(2 * 1024 * 1024 + 1));
            },
        });
        vi.stubGlobal(
            "fetch",
            vi.fn(async () => htmlResponse(body))
        );

        await expect(new ArtistPageClient().read(ID)).rejects.toThrow(
            "size limit"
        );

        expect(cancel).toHaveBeenCalledOnce();
    });

    it("rejects non-HTML responses and invalid IDs without following URLs", async () => {
        const fetch = vi.fn(async () => Response.json({}));
        vi.stubGlobal("fetch", fetch);

        await expect(new ArtistPageClient().read("bad")).rejects.toThrow(
            "artist ID"
        );
        expect(fetch).not.toHaveBeenCalled();
        await expect(new ArtistPageClient().read(ID)).rejects.toThrow(
            "must be HTML"
        );
    });

    it("does not retry a transport failure", async () => {
        const fetch = vi.fn(async () => {
            throw new Error("Connection lost");
        });
        vi.stubGlobal("fetch", fetch);

        await expect(new ArtistPageClient().read(ID)).rejects.toThrow(
            "Connection lost"
        );

        expect(fetch).toHaveBeenCalledOnce();
    });
});
