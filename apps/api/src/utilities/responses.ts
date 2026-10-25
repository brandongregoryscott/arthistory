import type {
    ApiError,
    ApiSuccessResponse,
    ApiErrorResponse,
} from "@repo/common";
import type { Response } from "express";
import { UnhandledError } from "@repo/common";

const sendError = (
    response: Response,
    status: number,
    error: ApiError
): Response<ApiErrorResponse> =>
    response.status(status).json({
        data: null,
        error: { message: error.message, name: error.name },
    });

const created = <T>(
    response: Response,
    data: T
): Response<ApiSuccessResponse<T>> =>
    response.status(201).json({ data, error: null });

const ok = <T>(response: Response, data: T): Response<ApiSuccessResponse<T>> =>
    response.status(200).json({ data, error: null });

const conflict = (
    response: Response,
    error: ApiError
): Response<ApiErrorResponse> => sendError(response, 409, error);

const badRequest = (
    response: Response,
    error: ApiError
): Response<ApiErrorResponse> => sendError(response, 400, error);

const notFound = (
    response: Response,
    error: ApiError
): Response<ApiErrorResponse> => sendError(response, 404, error);

const tooManyRequests = (
    response: Response,
    error: ApiError
): Response<ApiErrorResponse> => sendError(response, 429, error);

const internalError = (response: Response): Response<ApiErrorResponse> =>
    sendError(response, 500, new UnhandledError());

export {
    badRequest,
    conflict,
    created,
    internalError,
    notFound,
    ok,
    tooManyRequests,
};
