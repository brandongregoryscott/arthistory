import type { Request, Response } from "express";
import { MetaService } from "../services/meta-service";
import { notFound, ok } from "../utilities/responses";

const MetaController = {
    latest: async (
        _request: Request,
        response: Response
    ): Promise<Response> => {
        const latest = await MetaService.latest();
        if (latest === undefined) {
            return notFound(response, "Latest data could not be found");
        }

        return ok(response, latest);
    },
};

export { MetaController };
