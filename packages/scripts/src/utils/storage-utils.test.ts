import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { test } from "node:test";
import { downloadObject, listObjects, s3 } from "./storage-utils";

test("lists every object page and rejects an incomplete pagination response", async (context) => {
    const tokens: Array<string | undefined> = [];
    context.mock.method(
        s3,
        "listObjectsV2",
        async (input: { ContinuationToken?: string }) => {
            tokens.push(input.ContinuationToken);
            return input.ContinuationToken === undefined
                ? {
                      Contents: [{ Key: "first" }],
                      IsTruncated: true,
                      NextContinuationToken: "next",
                  }
                : { Contents: [{ Key: "second" }], IsTruncated: false };
        }
    );
    assert.deepEqual(await listObjects({ bucket: "test" }), [
        { Key: "first" },
        { Key: "second" },
    ]);
    assert.deepEqual(tokens, [undefined, "next"]);
    context.mock.restoreAll();
    context.mock.method(s3, "listObjectsV2", async () => ({
        IsTruncated: true,
    }));
    await assert.rejects(listObjects({ bucket: "test" }), /continuation token/);
});

test("downloads finish before publication and failed streams preserve the existing file", async (context) => {
    const dir = await mkdtemp(join(tmpdir(), "artist-download-"));
    const filename = join(dir, "partial.db");
    try {
        await writeFile(filename, "old");
        context.mock.method(s3, "getObject", async () => ({
            Body: Readable.from(
                (async function* () {
                    yield "incomplete";
                    throw new Error("connection lost");
                })()
            ),
        }));
        await assert.rejects(
            downloadObject({ bucket: "test", filename, key: "partial.db" }),
            /connection lost/
        );
        assert.equal(await readFile(filename, "utf8"), "old");
        context.mock.restoreAll();
        context.mock.method(s3, "getObject", async () => ({
            Body: Readable.from(["complete", " database"]),
        }));
        await downloadObject({ bucket: "test", filename, key: "partial.db" });
        assert.equal(await readFile(filename, "utf8"), "complete database");
    } finally {
        await rm(dir, { force: true, recursive: true });
    }
});
