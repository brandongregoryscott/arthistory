import rateLimit from "express-rate-limit";
import type { Request, Response } from "express";
import { tooManyRequests } from "./responses";

const ONE_HOUR_IN_MS = 60 * 60 * 1000;

const readRateLimiter = rateLimit({
    windowMs: ONE_HOUR_IN_MS,
    max: 1000,
    message: (_request: Request, response: Response) =>
        tooManyRequests(response, {
            name: "ERROR_RATE_LIMIT",
            message:
                "You've sent too many requests in a short period of time. Please try again later.",
        }),
    standardHeaders: true,
});

export { readRateLimiter };
