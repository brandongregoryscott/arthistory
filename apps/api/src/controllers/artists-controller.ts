import type { Request, Response } from "express";
import { ValidationError } from "@repo/common";
import { isEmpty, isString, uniq } from "lodash";
import type { Resolution } from "../services/artist-service";
import { artistRequested, searchQueryEntered } from "../analytics";
import { normalizeSearchQuery } from "../artists/artist-search-index";
import { ArtistService } from "../services/artist-service";
import { isSpotifyArtistId } from "../utilities/id-validation";
import { ok } from "../utilities/responses";

const ArtistsController = {
    getArtistSnapshots: async (
        request: Request,
        response: Response
    ): Promise<Response> => {
        const id = request.params.id as string;
        const resolution = request.query.resolution as Resolution | undefined;

        const snapshots = await ArtistService.listArtistSnapshots({
            ids: [id],
            resolution,
        });

        return ok(response, snapshots);
    },
    listArtists: async (request: Request, response: Response) => {
        const ids = parseArtistIds(request.query.ids);
        if (isEmpty(ids)) {
            return ok(response, {});
        }

        const artists = await ArtistService.listArtists({
            ids,
        });

        return ok(response, artists);
    },
    listArtistSnapshots: async (
        request: Request,
        response: Response
    ): Promise<Response> => {
        const ids = parseArtistIds(request.query.ids);
        const resolution = request.query.resolution as Resolution | undefined;
        if (isEmpty(ids)) {
            return ok(response, []);
        }

        const snapshots = await ArtistService.listArtistSnapshots({
            ids,
            resolution,
        });

        return ok(response, snapshots);
    },
    requestArtist: async (
        request: Request,
        response: Response
    ): Promise<Response> => {
        const id = request.params.id as string;
        artistRequested({ id });

        return ok(response, { requested: true });
    },
    searchArtistsByName: async (
        request: Request,
        response: Response
    ): Promise<Response> => {
        normalizeSearchQuery(request.query.name);
        const name = request.query.name as string;
        const { artists, total } = await ArtistService.searchArtists(name);

        searchQueryEntered({
            query: name,
            totalCount: total,
            trackedCount: artists.filter((artist) => artist.isTracked).length,
        });

        return ok(response, artists);
    },
};

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

export { ArtistsController };
