import type { SnapshotResolution } from "@repo/common";
import type { Request, Response } from "express";
import { isSnapshotResolution, ValidationError } from "@repo/common";
import { isEmpty, isString, uniq } from "lodash";
import { artistRequested, searchQueryEntered } from "../analytics";
import { ok } from "../utilities/responses";
import { isSpotifyArtistId } from "../utilities/validation";
import { normalizeSearchQuery } from "./artist-search-index";
import { ArtistService } from "./artist-service";

class ArtistsController {
    static async getArtistSnapshots(
        request: Request,
        response: Response
    ): Promise<Response> {
        const { id } = request.params;
        if (!isSpotifyArtistId(id)) {
            throw new ValidationError("Provide a Spotify artist ID.");
        }
        const resolution = parseResolution(request.query.resolution);

        const snapshots = await ArtistService.listArtistSnapshots({
            ids: [id],
            resolution,
        });

        return ok(response, snapshots);
    }
    static async listArtists(request: Request, response: Response) {
        const ids = parseArtistIds(request.query.ids);
        if (isEmpty(ids)) {
            return ok(response, {});
        }

        const artists = await ArtistService.listArtists({
            ids,
        });

        return ok(response, artists);
    }
    static async listArtistSnapshots(
        request: Request,
        response: Response
    ): Promise<Response> {
        const ids = parseArtistIds(request.query.ids);
        const resolution = parseResolution(request.query.resolution);
        if (isEmpty(ids)) {
            return ok(response, []);
        }

        const snapshots = await ArtistService.listArtistSnapshots({
            ids,
            resolution,
        });

        return ok(response, snapshots);
    }
    static async requestArtist(
        request: Request,
        response: Response
    ): Promise<Response> {
        const id = request.params.id as string;
        artistRequested({ id });

        return ok(response, { requested: true });
    }
    static async searchArtistsByName(
        request: Request,
        response: Response
    ): Promise<Response> {
        normalizeSearchQuery(request.query.name);
        const name = request.query.name as string;
        const { artists, total } = await ArtistService.searchArtists(name);

        searchQueryEntered({
            query: name,
            totalCount: total,
            trackedCount: artists.filter((artist) => artist.isTracked).length,
        });

        return ok(response, artists);
    }
}

const parseArtistIds = (value: unknown) => {
    if (!isString(value) || value.length > 50 * 23) {
        throw new ValidationError("Provide comma-separated artist IDs.");
    }

    const ids = uniq(value.split(",").filter((id) => id !== ""));

    if (ids.length > 50 || ids.some((id) => !isSpotifyArtistId(id))) {
        throw new ValidationError(
            "Provide at most 50 valid Spotify artist IDs."
        );
    }

    return ids;
};

const parseResolution = (value: unknown): SnapshotResolution => {
    if (value == null) {
        return "monthly";
    }

    if (!isSnapshotResolution(value)) {
        throw new ValidationError("Invalid snapshot resolution.");
    }

    return value;
};

export { ArtistsController };
