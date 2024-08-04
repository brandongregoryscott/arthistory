import type { NextFunction, Request, Response } from "express";
import { badRequest, internalError, notFound } from "./utilities/responses";
import { isNotFoundError, isValidationError } from "@repo/common";

/**
 * Global error handler for uncaught exceptions, which attempts to properly set the status code
 * and mask any sensitive error data before responding to the client. All four arguments need to be
 * specified, even if not used, for express to register the function as an error handler.
 * @see https://expressjs.com/en/guide/error-handling.html#writing-error-handlers
 */
const errorHandler = async (
    error: unknown,
    _request: Request,
    response: Response,
    _next: NextFunction
) => {
    // eslint-disable-next-line no-console -- Keeping this log in for debugging
    console.error(error);
    if (isNotFoundError(error)) {
        return notFound(response, error);
    }

    if (isValidationError(error)) {
        return badRequest(response, error);
    }

    return internalError(response, error);
};

export { errorHandler };
