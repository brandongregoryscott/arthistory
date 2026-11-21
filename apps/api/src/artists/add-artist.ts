import { parseArgs } from "node:util";
import { loadPocketBaseConfig } from "../config";
import { PocketBaseClient } from "../storage/pocketbase";
import { ArtistRegistry } from "./artist-registry";

const main = async () => {
    const { values } = parseArgs({ options: { artist: { type: "string" } } });
    if (values.artist == null) {
        throw new Error("Provide --artist with a Spotify ID or URL.");
    }
    const result = await new ArtistRegistry({
        client: new PocketBaseClient(loadPocketBaseConfig()),
    }).add(values.artist);
    process.stdout.write(JSON.stringify(result, null, 4) + "\n");
};

void main().catch((error: unknown) => {
    process.stderr.write(
        (error instanceof Error
            ? error.message
            : "Artist registration failed.") + "\n"
    );
    process.exitCode = 1;
});
