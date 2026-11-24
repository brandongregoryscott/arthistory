import { isError } from "lodash";
import { parseArgs } from "node:util";
import { ArtistPageClient, ArtistPageHttpError } from "../artists";

const main = async () => {
    const { values } = parseArgs({ options: { artist: { type: "string" } } });
    if (values.artist == null) {
        throw new Error("Provide --artist with a Spotify artist ID or URL.");
    }

    const page = await new ArtistPageClient().read(values.artist);
    process.stdout.write(JSON.stringify(page, null, 4) + "\n");
};

void main().catch((error: unknown) => {
    const result = {
        error: isError(error)
            ? error.message
            : "Artist page inspection failed.",
        ...(error instanceof ArtistPageHttpError
            ? { retryAfterMs: error.retryAfterMs, status: error.status }
            : {}),
    };
    process.stderr.write(JSON.stringify(result) + "\n");
    process.exitCode = 1;
});
