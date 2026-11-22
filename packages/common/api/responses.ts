import type { ApiError } from "./errors.js";

type ApiSuccessResponse<TData> = {
    data: TData;
    error: null;
};

type ApiErrorResponse = {
    data: null;
    error: ApiError;
};

export type { ApiErrorResponse, ApiSuccessResponse };
