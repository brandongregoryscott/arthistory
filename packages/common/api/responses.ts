import type { ApiError } from "./errors";

interface ApiSuccessResponse<TData> {
    data: TData;
    error: null;
}

interface ApiErrorResponse {
    data: null;
    error: ApiError;
}

export type { ApiErrorResponse, ApiSuccessResponse };
