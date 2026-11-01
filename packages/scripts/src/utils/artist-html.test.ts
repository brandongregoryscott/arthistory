import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { test } from "node:test";
import {
    ArtistPageError,
    fetchArtistStats,
    parseArtistHtml,
} from "./artist-html";

const id = "6lcwlkAjBPSKnFBZjjZFJs";

const htmlForStats = (stats: unknown) =>
    `<script id='initialState'>${Buffer.from(JSON.stringify({ entities: { items: { [`spotify:artist:${id}`]: { stats, uri: `spotify:artist:${id}` } } } })).toString("base64")}</script>`;

test("extracts exact integers from a sanitized public-page fixture", async () => {
    const html = await readFile(
        join(__dirname, "fixtures/artist.html"),
        "utf8"
    );
    assert.deepEqual(parseArtistHtml(html, id), {
        followers: 4550328,
        monthlyListeners: 9137860,
    });
    assert.throws(
        () => parseArtistHtml(html, "5AyEXCtu3xnnsTGCo4RVZh"),
        /identity/
    );
});

test("rejects missing state and invalid counts without substituting zero", () => {
    assert.throws(
        () =>
            parseArtistHtml(
                "<script id='initialState'>bm90LWpzb24=</script>",
                id
            ),
        /invalid initialState JSON/
    );
    assert.throws(
        () => parseArtistHtml("<html>Sign in</html>", id),
        /initialState/
    );
    for (const stats of [
        {},
        { followers: -1, monthlyListeners: 1 },
        { followers: "1", monthlyListeners: 2 },
        { followers: 1, monthlyListeners: null },
        { followers: 1.5, monthlyListeners: 2 },
    ]) {
        assert.throws(
            () => parseArtistHtml(htmlForStats(stats), id),
            /audience counts/
        );
    }
    assert.deepEqual(
        parseArtistHtml(
            htmlForStats({ followers: 0, monthlyListeners: 0 }),
            id
        ),
        { followers: 0, monthlyListeners: 0 }
    );
});

test("surfaces throttling and both Retry-After formats without retrying", async (context) => {
    for (const retryAfter of [
        "172800",
        new Date(Date.now() + 172800000).toUTCString(),
    ]) {
        let calls = 0;
        context.mock.method(globalThis, "fetch", async () => {
            calls++;
            return new Response("", {
                headers: { "retry-after": retryAfter },
                status: 429,
            });
        });
        await assert.rejects(
            fetchArtistStats(id),
            (error: unknown) =>
                error instanceof ArtistPageError &&
                error.status === 429 &&
                error.retryAfterMs > 172790000
        );
        assert.equal(calls, 1);
        context.mock.restoreAll();
    }
});
