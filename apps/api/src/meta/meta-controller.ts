import type { Request, Response } from "express";
import { NotFoundError } from "@repo/common";
import { artistSnapshotStore } from "../snapshots";
import { notFound, ok } from "../utilities/responses";

class MetaController {
    static async latest(
        _request: Request,
        response: Response
    ): Promise<Response> {
        const latest = await artistSnapshotStore.latest();

        if (latest == null) {
            return notFound(
                response,
                new NotFoundError("Latest data could not be read")
            );
        }

        return ok(response, latest);
    }
}

export { MetaController };
