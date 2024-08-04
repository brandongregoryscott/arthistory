import type { Request, Response } from "express";
import express from "express";
import bodyParser from "body-parser";
import { errorHandler } from "./error-handler";
import { readRateLimiter } from "./utilities/rate-limiter";
import cors from "cors";
import { ArtistsController } from "./controllers/artists-controller";
import {
    SEARCH_ARTISTS_BY_NAME_ROUTE,
    REQUEST_ARTIST_ROUTE,
    LIST_ARTIST_SNAPSHOTS_ROUTE,
    GET_ARTIST_SNAPSHOTS_ROUTE,
    LIST_ARTISTS_ROUTE,
    GET_LATEST_META_ROUTE,
} from "@repo/common";
import { MetaController } from "./controllers/meta-controller";

const app = express();

app.use(bodyParser.json());
app.use(cors());

app.get(
    "/healthcheck",
    (_request: Request, response: Response): Response => response.json("✅")
);

app.get(GET_LATEST_META_ROUTE, MetaController.latest);

app.post(REQUEST_ARTIST_ROUTE, ArtistsController.requestArtist);

app.get(SEARCH_ARTISTS_BY_NAME_ROUTE, ArtistsController.searchArtistsByName);

app.get(GET_ARTIST_SNAPSHOTS_ROUTE, ArtistsController.getArtistSnapshots);

app.get(LIST_ARTISTS_ROUTE, ArtistsController.listArtists);

app.get(LIST_ARTIST_SNAPSHOTS_ROUTE, ArtistsController.listArtistSnapshots);

app.use(errorHandler);
app.use(readRateLimiter);

export { app };
