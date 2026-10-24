import type { Request, RequestHandler, Response } from "express";
import type { ServerResponse } from "node:http";
import type { DestinationStream, Logger } from "pino";
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
    return typeof path === "string" ? path : "__unmatched__";
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
const safeError = (value: unknown, depth = 0): SafeError => {
    if (!(value instanceof Error)) {
        return { type: "NonError" };
    }
    const { name: type } = value.constructor;
    const prefix =
        value.message === "" ? value.name : `${value.name}: ${value.message}`;
    const stack =
        typeof value.stack === "string" && value.stack.startsWith(prefix)
            ? value.stack
                  .slice(prefix.length)
                  .split("\n")
                  .filter((frame) => /^\s+at /.test(frame))
                  .slice(0, 20)
                  .map((frame) =>
                      frame
                          .replace(
                              /(?:https?|file):\/\/[^\s)]+/g,
                              (location) => {
                                  try {
                                      const url = new URL(location);
                                      return url.protocol === "file:"
                                          ? `${url.origin === "null" ? "file://" : url.origin}${url.pathname}`
                                          : `${url.origin}/[source]`;
                                  } catch {
                                      return "[source]";
                                  }
                              }
                          )
                          .slice(0, 1000)
                  )
                  .join("\n")
            : undefined;
    const status =
        "status" in value &&
        typeof value.status === "number" &&
        value.status >= 100 &&
        value.status <= 599
            ? value.status
            : undefined;
    const codes = new Set([
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
    const code =
        "code" in value &&
        typeof value.code === "string" &&
        codes.has(value.code)
            ? value.code
            : undefined;
    const cause =
        depth < 3 && "cause" in value && value.cause instanceof Error
            ? safeError(value.cause, depth + 1)
            : undefined;
    return { cause, code, stack, status, type };
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
                        (value) => value != null && value.trim() !== ""
                    ) ?? "unknown",
            },
            formatters: { level: (level) => ({ level }) },
            level: env.LOG_LEVEL ?? "info",
            mixin: (_object, _level, instance) => {
                const active = context.getStore();
                if (active == null) {
                    return {};
                }
                const bound = instance.bindings();
                return {
                    ...(bound.method == null
                        ? { method: method(active.request) }
                        : {}),
                    ...(bound.requestId == null
                        ? { requestId: active.requestId }
                        : {}),
                    route: routeTemplate(active.request),
                };
            },
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

const logRequestError = (response: Response, error: unknown): void => {
    const state = requests.get(response);
    if (state != null) {
        state.failed = true;
    }
    const log = state?.logger ?? response.req?.logger ?? logger;
    const event = state?.stream === true ? "stream.error" : "request.failed";
    log.error({ err: error, event, route: routeTemplate(response.req) }, event);
};

const logStreamOpen = (response: ServerResponse): void => {
    const state = requests.get(response);
    if (state == null || state.stream || state.done) {
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
        const complete = () => {
            if (state.done) {
                return;
            }
            state.done = true;
            requests.delete(response);
            const aborted = !response.writableFinished;
            const event = state.stream
                ? "stream.closed"
                : aborted
                  ? "request.aborted"
                  : "request.completed";
            const probe =
                request.path === "/health" || request.path === "/ready";
            const level =
                state.failed || response.statusCode >= 500
                    ? "error"
                    : !state.stream && (aborted || response.statusCode >= 400)
                      ? "warn"
                      : probe
                        ? "debug"
                        : "info";
            log[level](
                {
                    ...fields(state, response),
                    aborted,
                    event,
                    ...(state.stream
                        ? { connectionDurationMs: elapsed(state) }
                        : { durationMs: elapsed(state) }),
                },
                event
            );
        };
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
