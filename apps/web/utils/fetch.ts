import { API_URL } from "@/utils/config";
import { ApiError, ApiErrorResponse, ApiSuccessResponse } from "@repo/common";

const CONTENT_TYPE = "Content-Type";

const HEADERS = {
    [CONTENT_TYPE]: "application/json",
};

const _fetch = async <T>(route: string, options?: RequestInit): Promise<T> => {
    const response = await fetch(`${API_URL}${route}`, options);

    if (!response.ok) {
        const { error } = (await response.json()) as ApiErrorResponse;
        throw error;
    }

    const result = (await response.json()) as ApiSuccessResponse<T>;
    return result as T;
};

const get = async <T>(route: string): Promise<T> => _fetch(route);

const post = async <TBody, TResponse>(route: string, body: TBody) =>
    _fetch<TResponse>(route, {
        body: JSON.stringify(body),
        method: "POST",
        headers: HEADERS,
    });

const _delete = async <TBody, TResponse>(route: string, body: TBody) =>
    _fetch<TResponse>(route, {
        body: JSON.stringify(body),
        method: "DELETE",
        headers: HEADERS,
    });

const put = async <TBody, TResponse>(route: string, body: TBody) =>
    _fetch<TResponse>(route, {
        body: JSON.stringify(body),
        method: "PUT",
        headers: HEADERS,
    });

export { get, post, _delete as delete, put };
