import type { RecordModel } from "pocketbase";
import type { PocketBaseClient } from "../storage/pocketbase";
import type { ArtistRecord, IndexLimits } from "./artist-search-index";
import { ArtistSearchIndex, MAX_INDEX_ARTISTS } from "./artist-search-index";

type CacheOptions = {
    client: PocketBaseClient;
    limits?: IndexLimits;
    refreshMs?: number;
};

const PAGE_SIZE = 500;

const DEFAULT_REFRESH_MS = 60000;

class ArtistCache {
    readonly #client: PocketBaseClient;

    readonly #limits: IndexLimits;

    readonly #refreshMs: number;

    #controller: AbortController | undefined;

    #index: ArtistSearchIndex | undefined;

    #refreshing: Promise<void> | undefined;

    #timer: ReturnType<typeof setInterval> | undefined;

    constructor(options: CacheOptions) {
        this.#client = options.client;
        this.#limits = options.limits ?? {};
        this.#refreshMs = options.refreshMs ?? DEFAULT_REFRESH_MS;

        if (!Number.isSafeInteger(this.#refreshMs) || this.#refreshMs < 1) {
            throw new Error(
                "Artist cache refresh interval must be a positive integer."
            );
        }
    }

    get coverage() {
        return this.#readyIndex().coverage;
    }

    list(ids: string[]) {
        return this.#readyIndex().list(ids);
    }

    refresh(): Promise<void> {
        this.#refreshing ??= this.#rebuild().finally(() => {
            this.#refreshing = undefined;
        });

        return this.#refreshing;
    }

    search(query: string) {
        return this.#readyIndex().search(query);
    }

    async start(onError: (error: unknown) => void) {
        await this.refresh();

        if (this.#timer == null) {
            this.#timer = setInterval(() => {
                if (this.#refreshing == null) {
                    void this.refresh().catch(onError);
                }
            }, this.#refreshMs);
            this.#timer.unref();
        }
    }

    stop() {
        if (this.#timer != null) {
            clearInterval(this.#timer);
        }

        this.#timer = undefined;
        this.#controller?.abort();
    }

    async *#pages(historyOnly: boolean, signal: AbortSignal) {
        let cursor = "";
        let count = 0;
        const maxArtists = this.#limits.maxArtists ?? MAX_INDEX_ARTISTS;

        while (true) {
            const result = await this.#client.run((pb) => {
                const filters = [pb.filter("id > {:cursor}", { cursor })];

                if (historyOnly) {
                    // Any matching back-relation is enough. Filtering its artist
                    // field lets PocketBase use the covering artist/week index.
                    filters.push("snapshots_via_artist.artist ?!= ''");
                }

                return pb
                    .collection("artists")
                    .getList<RecordModel>(1, PAGE_SIZE, {
                        fields: historyOnly
                            ? "id"
                            : "id,spotifyId,displayName,aliases,syncEnabled",
                        filter: filters.join(" && "),
                        signal,
                        skipTotal: true,
                        sort: "id",
                    });
            });

            for (const row of result.items) {
                if (row.id <= cursor || ++count > maxArtists) {
                    throw new Error(
                        "Artist cache pagination did not advance within its artist budget."
                    );
                }

                cursor = row.id;
                yield row;
            }

            if (result.items.length < PAGE_SIZE) {
                return;
            }
        }
    }

    #readyIndex() {
        if (this.#index == null) {
            throw new Error("Artist cache is not initialized.");
        }

        return this.#index;
    }

    async #rebuild() {
        const controller = new AbortController();

        this.#controller = controller;

        const next = new ArtistSearchIndex(this.#limits);

        for await (const row of this.#pages(false, controller.signal)) {
            next.add(row as unknown as ArtistRecord);
        }

        for await (const row of this.#pages(true, controller.signal)) {
            next.markHistory(row.id);
        }

        next.finish();
        this.#index = next;
    }
}

export { ArtistCache };
