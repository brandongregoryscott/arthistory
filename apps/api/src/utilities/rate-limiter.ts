import type { Request, Response } from "express";
import rateLimit from "express-rate-limit";
import { tooManyRequests } from "./responses";

const ONE_HOUR_IN_MS = 60 * 60 * 1000;

const readRateLimiter = rateLimit({
    max: 1000,
    message: (_request: Request, response: Response) =>
        tooManyRequests(response, {
            message:
                "You've sent too many requests in a short period of time. Please try again later.",
            name: "ERROR_RATE_LIMIT",
        }),
    standardHeaders: true,
    windowMs: ONE_HOUR_IN_MS,
});

export { readRateLimiter };
