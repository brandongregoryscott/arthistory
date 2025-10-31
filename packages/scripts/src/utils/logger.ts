import { first, isObject, isString } from "lodash";
import pino from "pino";

const logger = pino({});

interface CreateTimerLoggerOptions {
    data?: Record<string, unknown>;
    level?: "debug" | "error" | "fatal" | "info" | "silent" | "trace" | "warn";
    message: string;
}

type LogLevel =
    | "debug"
    | "error"
    | "fatal"
    | "info"
    | "silent"
    | "trace"
    | "warn";

type _CreateTimerLoggerOptions =
    | [data: Record<string, unknown>, message: string, level?: LogLevel]
    | [message: string, level?: LogLevel];

const createTimerLogger = (...options: _CreateTimerLoggerOptions) => {
    const messageOrData = first(options)!;
    const messageOrLevel = options[1];
    const maybeLevel = options[2];
    const message = isObject(messageOrData)
        ? (messageOrLevel as string)
        : messageOrData;
    const data = isObject(messageOrData) ? messageOrData : {};
    const level =
        (isObject(messageOrData)
            ? maybeLevel
            : (messageOrLevel as LogLevel | undefined)) ?? "info";
    const startTimestamp = Date.now();
    logger[level]({ startTimestamp, ...data }, message);

    const endLogger = (endData?: Record<string, unknown>) => {
        const endTimestamp = Date.now();
        const elapsed = endTimestamp - startTimestamp;
        logger[level](
            {
                startTimestamp,
                endTimestamp,
                elapsed,
                ...endData,
            },
            `${message}: DONE ${formatTimeSpanFromMilliseconds(elapsed)}`
        );
    };

    return endLogger;
};

function formatTimeSpanFromMilliseconds(milliseconds: number) {
    const date = new Date(milliseconds);
    const hours = date.getUTCHours();
    const minutes = date.getUTCMinutes();
    const seconds = date.getUTCSeconds();

    const pad = (num: number) => num.toString().padStart(2, "0");

    return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
}

export { createTimerLogger, logger };
