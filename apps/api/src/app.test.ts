import type { Request, Response } from "express";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import assert from "node:assert/strict";
import { after, before, mock, test } from "node:test";
import posthog from "posthog-js";

let server: Server | undefined;
let origin: string;
const respond =
    (route: string) => async (_request: Request, response: Response) =>
        response.json({ route });

before(async () => {
    mock.method(posthog, "init", () => posthog);
    const { ArtistsController } =
        await import("./controllers/artists-controller.js");
    const { MetaController } = await import("./controllers/meta-controller.js");
    // Stub dependencies before Express captures the controllers, then exercise
    // the actual HTTP router without contacting Spotify or opening SQLite.
    mock.method(MetaController, "latest", respond("latest"));
    mock.method(ArtistsController, "requestArtist", respond("requestArtist"));
    mock.method(
        ArtistsController,
        "searchArtistsByName",
        respond("searchArtistsByName")
    );
    mock.method(
        ArtistsController,
        "getArtistSnapshots",
        respond("getArtistSnapshots")
    );
    mock.method(ArtistsController, "listArtists", respond("listArtists"));
    mock.method(
        ArtistsController,
        "listArtistSnapshots",
        respond("listArtistSnapshots")
    );
    const { app } = await import("./app.js");
    app.set("trust proxy", false);
    const activeServer = app.listen(0, "127.0.0.1");
    server = activeServer;
    await new Promise<void>((resolve) =>
        activeServer.once("listening", resolve)
    );
    origin = `http://127.0.0.1:${(activeServer.address() as AddressInfo).port}`;
});

after(async () => {
    mock.restoreAll();
    if (server != null) {
        const activeServer = server;
        await new Promise<void>((resolve, reject) =>
            activeServer.close((error) =>
                error != null ? reject(error) : resolve()
            )
        );
    }
});

test("health returns the shared contract", async () => {
    const response = await fetch(`${origin}/health`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { ok: true });
});

test("unversioned routes reach their existing controllers", async () => {
    const routes = [
        ["GET", "/meta/latest", "latest"],
        ["GET", "/artists/search?name=test", "searchArtistsByName"],
        ["GET", "/artists/test/snapshots", "getArtistSnapshots"],
        ["GET", "/artists?ids=test", "listArtists"],
        ["GET", "/artists/snapshots?ids=test", "listArtistSnapshots"],
        ["POST", "/artists/test/request", "requestArtist"],
    ] as const;
    for (const [method, path, handler] of routes) {
        const response = await fetch(`${origin}${path}`, { method });
        assert.equal(response.status, 200, `${method} ${path}`);
        assert.deepEqual(await response.json(), { route: handler });
    }
});

test("removed health and versioned routes return 404", async () => {
    for (const path of ["/healthcheck", "/v1/meta/latest", "/v1/artists"]) {
        assert.equal((await fetch(`${origin}${path}`)).status, 404);
    }
});
