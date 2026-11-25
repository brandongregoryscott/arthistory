import { afterEach, describe, expect, it, vi } from "vitest";
import { PocketBaseClient } from "../storage/pocketbase";
import { ArtistRegistry } from "./artist-registry";

const ID = "6lcwlkAjBPSKnFBZjjZFJs";

const TOKEN = `test.${Buffer.from(JSON.stringify({ exp: 4000000000 })).toString("base64url")}.test`;

const CONFIG = {
    email: "owner@example.com",
    password: "test-password",
    url: "http://pocketbase.invalid",
};

describe("ArtistRegistry", () => {
    afterEach(() => vi.unstubAllGlobals());

    it("validates a public page then creates a disabled artist and preserves existing owner data on rerun", async () => {
        let stored: Record<string, unknown> | undefined;
        const fetch = vi.fn(async (url: string, options: RequestInit) => {
            if (url.includes("auth-with-password")) {
                return Response.json({
                    record: { id: "owner" },
                    token: TOKEN,
                });
            }

            if (options.method === "POST") {
                stored = {
                    id: "111111111111111",
                    ...JSON.parse(String(options.body)),
                };

                return Response.json(stored);
            }

            return Response.json({
                items: stored == null ? [] : [stored],
                page: 1,
                perPage: 1,
                totalItems: -1,
                totalPages: -1,
            });
        });

        vi.stubGlobal("fetch", fetch);

        const pages = {
            read: vi.fn(async () => ({
                displayName: "Alex G",
                metrics: {
                    followers: null,
                    monthlyListeners: null,
                    popularity: null,
                },
                songs: null,
                spotifyId: ID,
            })),
        };
        const registry = new ArtistRegistry({
            client: new PocketBaseClient(CONFIG),
            pages,
        });

        const result = await registry.add(
            `https://open.spotify.com/artist/${ID}`
        );

        expect(result).toMatchObject({
            displayName: "Alex G",
            metadataSource: "spotify-public-page",
            spotifyId: ID,
            syncEnabled: false,
        });
        stored = {
            ...stored,
            displayName: "Owner name",
            syncEnabled: true,
        };

        const repeated = await registry.add(ID);

        expect(repeated).toMatchObject({
            displayName: "Owner name",
            syncEnabled: true,
        });
        expect(pages.read).toHaveBeenCalledOnce();
        expect(
            fetch.mock.calls.filter(
                ([, options]) =>
                    options.method === "POST" &&
                    !String(options.body).includes("identity")
            )
        ).toHaveLength(1);
    });

    it("preserves a concurrent owner create", async () => {
        let lookups = 0;
        const existing = {
            displayName: "Concurrent owner name",
            id: "111111111111111",
            spotifyId: ID,
            syncEnabled: true,
        };
        const fetch = vi.fn(async (url: string, options: RequestInit) => {
            if (url.includes("auth-with-password")) {
                return Response.json({
                    record: { id: "owner" },
                    token: TOKEN,
                });
            }

            if (options.method === "POST") {
                return Response.json(
                    {
                        data: {
                            spotifyId: { code: "validation_not_unique" },
                        },
                    },
                    { status: 400 }
                );
            }

            return Response.json({
                items: ++lookups === 1 ? [] : [existing],
            });
        });

        vi.stubGlobal("fetch", fetch);

        const pages = {
            read: vi.fn(async () => ({
                displayName: "Alex G",
                metrics: {
                    followers: null,
                    monthlyListeners: null,
                    popularity: null,
                },
                songs: null,
                spotifyId: ID,
            })),
        };

        const result = await new ArtistRegistry({
            client: new PocketBaseClient(CONFIG),
            pages,
        }).add(ID);

        expect(result).toMatchObject(existing);
        expect(lookups).toBe(2);
    });

    it("does not create an artist when page validation fails", async () => {
        const fetch = vi.fn(async (url: string) =>
            Response.json(
                url.includes("auth-with-password")
                    ? { record: { id: "owner" }, token: TOKEN }
                    : { items: [] }
            )
        );

        vi.stubGlobal("fetch", fetch);

        const registry = new ArtistRegistry({
            client: new PocketBaseClient(CONFIG),
            pages: {
                read: async () => {
                    throw new Error("Identity mismatch");
                },
            },
        });

        await expect(registry.add(ID)).rejects.toThrow("Identity mismatch");

        expect(fetch).toHaveBeenCalledTimes(2);
    });
});
