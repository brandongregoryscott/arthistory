import { program } from "commander";
import { initializeRegistry } from "../sync/bootstrap";
import { openRegistry } from "../sync/registry";
import { validateArtistId } from "../utils/artist-html";

program
    .argument("<action>", "enable, disable, or list")
    .argument("[id]", "Spotify artist ID")
    .action(async (action: string, id?: string) => {
        if (!["enable", "disable", "list"].includes(action)) {
            throw new Error("Expected enable, disable, or list");
        }
        if (action !== "list") {
            validateArtistId(id ?? "");
        }
        await initializeRegistry();
        const db = await openRegistry();
        try {
            if (action !== "list") {
                await db.run(
                    `INSERT INTO artist_ids (id, sync_enabled) VALUES (?, ?)
                ON CONFLICT(id) DO UPDATE SET sync_enabled = excluded.sync_enabled`,
                    id,
                    action === "enable" ? 1 : 0
                );
                console.log(
                    `${id}: syncing ${action === "enable" ? "enabled" : "disabled"}`
                );
            } else {
                console.table(
                    await db.all(
                        "SELECT id, sync_enabled, last_success_at, next_attempt_at FROM artist_ids WHERE sync_enabled = 1 ORDER BY id"
                    )
                );
            }
        } finally {
            await db.close();
        }
    });

program.parseAsync().catch((error: Error) => {
    console.error(error.message);
    process.exitCode = 1;
});
