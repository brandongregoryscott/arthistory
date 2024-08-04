import type { Request, Response } from "express";
import type { Resolution } from "../services/artist-service";
import { ArtistService } from "../services/artist-service";
import { SpotifyClient } from "../spotify";
import { ok } from "../utilities/responses";
import { artistRequested, searchQueryEntered } from "../analytics";
import { isEmpty } from "lodash";

const ArtistsController = {
    listArtists: async (request: Request, response: Response) => {
        const ids = (request.query.ids as string).split(",");
        if (isEmpty(ids)) {
            return ok(response, {});
        }

        const artists = await ArtistService.listArtists({
            ids,
        });

        return ok(response, artists);
    },
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
    listArtistSnapshots: async (
        request: Request,
        response: Response
    ): Promise<Response> => {
        const ids = (request.query.ids as string).split(",");
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
        const name = request.query.name as string;

        const result = await SpotifyClient.search(name, ["artist"]);
        const artists = result.artists.items;
        const ids = artists.map((artist) => artist.id);
        const trackedArtistMap = await ArtistService.isTracked(ids);

        const artistsWithTrackingData = artists.map((artist) => ({
            ...artist,
            isTracked: trackedArtistMap[artist.id],
        }));

        searchQueryEntered({
            query: name,
            totalCount: result.artists.total,
            trackedCount: Object.values(trackedArtistMap).filter(
                (isTracked) => isTracked === true
            ).length,
        });

        return ok(response, artistsWithTrackingData);
    },
};

export { ArtistsController };
