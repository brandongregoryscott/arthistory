import PocketBase, { ClientResponseError } from "pocketbase";
import type { PocketBaseConfig } from "../config";

class PocketBaseClient {
    readonly #client: PocketBase;
    readonly #config: PocketBaseConfig;
    #authentication: Promise<unknown> | undefined;

    constructor(config: PocketBaseConfig) {
        this.#config = config;
        this.#client = new PocketBase(config.url);
        // Shared server client: independent requests must not cancel each other.
        this.#client.autoCancellation(false);
        this.#client.beforeSend = (url, options) => {
            const timeoutSignal = AbortSignal.timeout(10000);

            return {
                options: {
                    ...options,
                    signal:
                        options.signal == null
                            ? timeoutSignal
                            : AbortSignal.any([options.signal, timeoutSignal]),
                },
                url,
            };
        };
    }

    get origin() {
        return new URL(this.#config.url).origin;
    }

    async ready() {
        for (const name of [
            "artists",
            "snapshots",
            "sync_settings",
            "sync_state",
        ]) {
            await this.run((pb) =>
                pb.collection(name).getList(1, 1, { fields: "id" })
            );
        }
    }

    async run<T>(operation: (pb: PocketBase) => Promise<T>): Promise<T> {
        await this.#authenticate();
        try {
            return await operation(this.#client);
        } catch (error) {
            // Retry only explicit auth rejection, never ambiguous transport failures.
            if (
                !(error instanceof ClientResponseError) ||
                error.status !== 401
            ) {
                throw error;
            }
            this.#client.authStore.clear();
            await this.#authenticate();
            return operation(this.#client);
        }
    }

    async #authenticate() {
        if (this.#client.authStore.isValid) {
            return;
        }
        this.#authentication ??= this.#client
            .collection("_superusers")
            .authWithPassword(this.#config.email, this.#config.password)
            .finally(() => {
                this.#authentication = undefined;
            });
        await this.#authentication;
    }
}

export { PocketBaseClient };
