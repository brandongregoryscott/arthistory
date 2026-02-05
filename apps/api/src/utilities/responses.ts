import type { Response } from "express";
import type { ApiSuccessResponse, ApiErrorResponse } from "@repo/common";
import { serializeError } from "serialize-error";

const created = <T>(
    response: Response,
    data: T
): Response<ApiSuccessResponse<T>> =>
    response.status(201).json({ data, error: null });

const ok = <T>(response: Response, data: T): Response<ApiSuccessResponse<T>> =>
    response.status(200).json({ data, error: null });

const conflict = (
    response: Response,
    error: unknown
): Response<ApiErrorResponse> =>
    response.status(409).json({ data: null, error: serializeError(error) });

const badRequest = (
    response: Response,
    error: unknown
): Response<ApiErrorResponse> =>
    response.status(400).json({ data: null, error: serializeError(error) });

const notFound = (
    response: Response,
    error: unknown
): Response<ApiErrorResponse> =>
    response.status(404).json({ data: null, error: serializeError(error) });

const tooManyRequests = (
    response: Response,
    error: unknown
): Response<ApiErrorResponse> =>
    response.status(429).json({ data: null, error: serializeError(error) });

const internalError = (
    response: Response,
    error: unknown
): Response<ApiErrorResponse> =>
    response.status(500).json({ data: null, error: serializeError(error) });

export {
    badRequest,
    conflict,
    created,
    internalError,
    notFound,
    ok,
    tooManyRequests,
};
