import { isObject } from "lodash";
import pino from "pino";
import { formatTimeSpanFromMilliseconds } from "./date-utils";

const logger = pino({});

type LogLevel =
    | "debug"
    | "error"
    | "fatal"
    | "info"
    | "silent"
    | "trace"
    | "warn";

type CreateTimerLoggerWithDataOptions = [
    data: Record<string, unknown>,
    message: string,
    level?: LogLevel,
];
type CreateTimerLoggerMessageOptions = [message: string, level: LogLevel];

type CreateTimerOptions =
    | CreateTimerLoggerMessageOptions
    | CreateTimerLoggerWithDataOptions;

interface NormalizedCreateTimerOptions {
    data: Record<string, unknown>;
    level: LogLevel;
    message: string;
}

const createTimerLogger = (...options: CreateTimerOptions) => {
    const { message, data, level } = normalizeCreateTimerLoggerOptions(
        ...options
    );
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

const normalizeCreateTimerLoggerOptions = (
    ...options: CreateTimerOptions
): NormalizedCreateTimerOptions => {
    const messageOrData = options[0];
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

    return { message, data, level };
};

export { createTimerLogger, logger };
