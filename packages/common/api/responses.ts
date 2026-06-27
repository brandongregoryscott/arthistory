import type { ApiError } from "./errors";

type ApiSuccessResponse<TData> = {
    data: TData;
    error: null;
};

type ApiErrorResponse = {
    data: null;
    error: ApiError;
};

export type { ApiErrorResponse, ApiSuccessResponse };
