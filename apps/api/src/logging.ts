import type { Request, RequestHandler, Response } from "express";
import type { ServerResponse } from "node:http";
import type { DestinationStream, Logger } from "pino";
import { isError, isNil, isNumber, isString } from "lodash";
import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
import pino from "pino";

declare global {
    namespace Express {
        // eslint-disable-next-line @typescript-eslint/consistent-type-definitions
        interface Request {
            logger: Logger;
        }
    }
}

type RequestContext = { request: Request; requestId: string };
type RequestState = {
    done: boolean;
    failed: boolean;
    logger: Logger;
    request: Request;
    requestId: string;
    start: bigint;
    stream: boolean;
};

const context = new AsyncLocalStorage<RequestContext>();

const requests = new WeakMap<ServerResponse, RequestState>();

const methods = new Set([
    "GET",
    "POST",
    "PUT",
    "PATCH",
    "DELETE",
    "HEAD",
    "OPTIONS",
]);

const method = (request: Request) =>
    methods.has(request.method) ? request.method : "OTHER";

const routeTemplate = (request?: Request): string => {
    const path = (request?.route as { path?: unknown } | undefined)?.path;
    return isString(path) ? path : "__unmatched__";
};

// Exception messages and SDK payloads can echo credentials or request bodies.
// Keep the error type, HTTP status, and source frames; never serialize the object.
type SafeError = {
    cause?: SafeError;
    code?: string;
    stack?: string;
    status?: number;
    type: string;
};

const sanitizeSourceLocation = (location: string): string => {
    try {
        const url = new URL(location);
        if (url.protocol !== "file:") {
            return `${url.origin}/[source]`;
        }

        const origin = url.origin === "null" ? "file://" : url.origin;
        return `${origin}${url.pathname}`;
    } catch {
        return "[source]";
    }
};

const sanitizeStackFrame = (frame: string): string =>
    frame
        .replace(/(?:https?|file):\/\/[^\s)]+/g, sanitizeSourceLocation)
        .slice(0, 1000);

const sanitizeStack = (error: Error): string | undefined => {
    const prefix =
        error.message === "" ? error.name : `${error.name}: ${error.message}`;
    if (!isString(error.stack) || !error.stack.startsWith(prefix)) {
        return undefined;
    }

    return error.stack
        .slice(prefix.length)
        .split("\n")
        .filter((frame) => /^\s+at /.test(frame))
        .slice(0, 20)
        .map(sanitizeStackFrame)
        .join("\n");
};

const safeErrorCodes = new Set([
    "EADDRINUSE",
    "EADDRNOTAVAIL",
    "EACCES",
    "ECONNREFUSED",
    "ECONNRESET",
    "ETIMEDOUT",
    "ENOTFOUND",
    "EPIPE",
    "ENOENT",
    "SQLITE_BUSY",
    "SQLITE_CONSTRAINT",
    "SQLITE_ERROR",
]);

const safeError = (value: unknown, depth = 0): SafeError => {
    if (!isError(value)) {
        return { type: "NonError" };
    }

    const result: SafeError = {
        stack: sanitizeStack(value),
        type: value.constructor.name,
    };
    if (
        "status" in value &&
        isNumber(value.status) &&
        value.status >= 100 &&
        value.status <= 599
    ) {
        result.status = value.status;
    }
    if (
        "code" in value &&
        isString(value.code) &&
        safeErrorCodes.has(value.code)
    ) {
        result.code = value.code;
    }
    if (depth < 3 && "cause" in value && isError(value.cause)) {
        result.cause = safeError(value.cause, depth + 1);
    }
    return result;
};

const requestContextFields = (instance: Logger) => {
    const active = context.getStore();
    if (isNil(active)) {
        return {};
    }

    const bound = instance.bindings();
    const result: { method?: string; requestId?: string; route: string } = {
        route: routeTemplate(active.request),
    };
    if (isNil(bound.method)) {
        result.method = method(active.request);
    }
    if (isNil(bound.requestId)) {
        result.requestId = active.requestId;
    }
    return result;
};

const createLogger = (
    service: string,
    destination?: DestinationStream,
    env: NodeJS.ProcessEnv = process.env
): Logger =>
    pino(
        {
            base: {
                environment: env.APP_ENV ?? env.NODE_ENV ?? "development",
                service,
                version:
                    [env.SOURCE_COMMIT, env.APP_VERSION].find(
                        (value) => !isNil(value) && value.trim() !== ""
                    ) ?? "unknown",
            },
            formatters: { level: (level) => ({ level }) },
            level: env.LOG_LEVEL ?? "info",
            mixin: (_object, _level, instance) =>
                requestContextFields(instance),
            redact: {
                paths: [
                    "authorization",
                    "cookie",
                    "password",
                    "token",
                    "secret",
                    "clientSecret",
                    "headers",
                    "body",
                    "url",
                    "path",
                    "originalUrl",
                    "*.authorization",
                    "*.cookie",
                    "*.password",
                    "*.token",
                    "*.secret",
                    "*.clientSecret",
                    "*.headers",
                    "*.body",
                    "*.url",
                    "*.originalUrl",
                ],
                remove: true,
            },
            serializers: {
                cause: safeError,
                err: safeError,
                error: safeError,
                req: () => undefined,
                request: () => undefined,
                res: () => undefined,
                response: () => undefined,
            },
            timestamp: pino.stdTimeFunctions.isoTime,
        },
        destination
    );

const logger = createLogger("arthistory-api");

const elapsed = (state: RequestState) =>
    Number(process.hrtime.bigint() - state.start) / 1e6;

const fields = (state: RequestState, response: ServerResponse) => ({
    route: routeTemplate(state.request),
    statusCode: response.statusCode,
});

const completionLevel = (
    state: RequestState,
    response: ServerResponse
): "debug" | "error" | "info" | "warn" => {
    if (state.failed || response.statusCode >= 500) {
        return "error";
    }
    if (
        !state.stream &&
        (!response.writableFinished || response.statusCode >= 400)
    ) {
        return "warn";
    }
    if (state.request.path === "/health" || state.request.path === "/ready") {
        return "debug";
    }
    return "info";
};

const completionFields = (state: RequestState, response: ServerResponse) => {
    const details = {
        ...fields(state, response),
        aborted: !response.writableFinished,
    };
    if (state.stream) {
        return {
            ...details,
            connectionDurationMs: elapsed(state),
            event: "stream.closed",
        };
    }

    let event = "request.completed";
    if (details.aborted) {
        event = "request.aborted";
    }
    return { ...details, durationMs: elapsed(state), event };
};

const logCompletion = (state: RequestState, response: ServerResponse): void => {
    if (state.done) {
        return;
    }
    state.done = true;
    requests.delete(response);

    const level = completionLevel(state, response);
    const details = completionFields(state, response);
    state.logger[level](details, details.event);
};

const logRequestError = (response: Response, error: unknown): void => {
    const state = requests.get(response);
    if (!isNil(state)) {
        state.failed = true;
    }
    const log = state?.logger ?? response.req?.logger ?? logger;
    const event = state?.stream === true ? "stream.error" : "request.failed";
    log.error({ err: error, event, route: routeTemplate(response.req) }, event);
};

const logStreamOpen = (response: ServerResponse): void => {
    const state = requests.get(response);
    if (isNil(state) || state.stream || state.done) {
        return;
    }
    state.stream = true;
    state.logger.info(
        {
            ...fields(state, response),
            durationMs: elapsed(state),
            event: "stream.opened",
        },
        "stream opened"
    );
};

const requestLogging =
    (root: Logger = logger): RequestHandler =>
    (request, response, next) => {
        const requestId = randomUUID();
        const log = root.child({ method: method(request), requestId });
        request.logger = log;
        response.setHeader("X-Request-Id", requestId);
        const state: RequestState = {
            done: false,
            failed: false,
            logger: log,
            request,
            requestId,
            start: process.hrtime.bigint(),
            stream: false,
        };
        requests.set(response, state);
        const complete = () => logCompletion(state, response);
        response.once("finish", complete);
        response.once("close", complete);
        response.once("error", (error) => {
            if (!state.done) {
                logRequestError(response, error);
            }
        });
        context.run({ request, requestId }, () => next());
    };

export { createLogger, logger, logRequestError, logStreamOpen, requestLogging };
