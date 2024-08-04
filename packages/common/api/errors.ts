interface ApiError {
    message: string;
    name: string;
}

const ErrorName = {
    ERROR_NOT_FOUND: "ERROR_NOT_FOUND",
    ERROR_RATE_LIMIT_EXCEEDED: "ERROR_RATE_LIMIT_EXCEEDED",
    ERROR_UNHANDLED: "ERROR_UNHANDLED",
    ERROR_VALIDATION: "ERROR_VALIDATION",
} as const;

class NotFoundError extends Error {
    constructor(message: string) {
        super();
        this.name = ErrorName.ERROR_NOT_FOUND;
        this.message = message;
    }
}

class ValidationError extends Error {
    constructor(message: string) {
        super();
        this.name = ErrorName.ERROR_VALIDATION;
        this.message = message;
    }
}

class UnhandledError extends Error {
    constructor(message?: string) {
        super();
        this.name = ErrorName.ERROR_UNHANDLED;
        this.message =
            message !== undefined ? message : "An unhandled error occurred.";
    }
}

const isApiError = (error: unknown): error is ApiError =>
    typeof error === "object" &&
    error !== null &&
    "name" in error &&
    typeof error.name === "string" &&
    "message" in error &&
    typeof error.message === "string";

const isValidationError = (error: unknown): error is ValidationError =>
    isApiError(error) && error.name === ErrorName.ERROR_VALIDATION;

const isNotFoundError = (error: unknown): error is NotFoundError =>
    isApiError(error) && error.name === ErrorName.ERROR_NOT_FOUND;

const isUnhandledError = (error: unknown): error is UnhandledError =>
    isApiError(error) && error.name === ErrorName.ERROR_UNHANDLED;

export type { ApiError };
export {
    ErrorName,
    isApiError,
    isNotFoundError,
    isUnhandledError,
    isValidationError,
    NotFoundError,
    UnhandledError,
    ValidationError,
};
