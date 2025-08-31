import type { ApiErrorResponse, ApiSuccessResponse } from "../responses";
import type {
    Artist,
    ArtistSnapshot,
    ArtistWithTrackingStatus,
} from "../types";

type GetLatestMetaResult =
    | ApiErrorResponse
    | ApiSuccessResponse<Pick<ArtistSnapshot, "timestamp">>;

interface GetArtistSnapshotsOptions {
    id: string;
}

type GetArtistSnapshotsResult =
    | ApiErrorResponse
    | ApiSuccessResponse<ArtistSnapshot[]>;

interface ListArtistSnapshotsOptions {
    ids: string[];
}

type ListArtistSnapshotsResult =
    | ApiErrorResponse
    | ApiSuccessResponse<ArtistSnapshot[]>;

interface ListArtistsOptions {
    ids: string[];
}

type ListArtistsResult =
    | ApiErrorResponse
    | ApiSuccessResponse<Record<string, Artist>>;

interface RequestArtistOptions {
    id: string;
}

type RequestArtistResult = ApiErrorResponse | ApiSuccessResponse<true>;

interface SearchArtistsByNameOptions {
    name: string;
}

type SearchArtistByNameResult =
    | ApiErrorResponse
    | ApiSuccessResponse<ArtistWithTrackingStatus[]>;

export type {
    GetArtistSnapshotsOptions,
    GetArtistSnapshotsResult,
    GetLatestMetaResult,
    ListArtistSnapshotsOptions,
    ListArtistSnapshotsResult,
    ListArtistsOptions,
    ListArtistsResult,
    RequestArtistOptions,
    RequestArtistResult,
    SearchArtistByNameResult,
    SearchArtistsByNameOptions,
};
