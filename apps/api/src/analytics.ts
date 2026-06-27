import { DEFAULT_ARTIST_IDS } from "@repo/common";
import posthog from "posthog-js";
import { POSTHOG_KEY } from "./config";

posthog.init(POSTHOG_KEY);

type ArtistRequestedProperties = {
    id: string;
};

const artistRequested = (properties: ArtistRequestedProperties): void => {
    posthog.capture("Artist Requested", properties);
};

type ArtistSelectedProperties = {
    id: string;
};

const artistSelected = (properties: ArtistSelectedProperties): void => {
    const { id } = properties;
    if (DEFAULT_ARTIST_IDS.includes(id)) {
        return;
    }

    posthog.capture("Artist Selected", properties);
};

type SearchQueryEnteredProperties = {
    query: string;
    totalCount: number;
    trackedCount: number;
};

const searchQueryEntered = (properties: SearchQueryEnteredProperties): void => {
    posthog.capture("Search Query Entered", properties);
};

export { artistRequested, artistSelected, searchQueryEntered };
