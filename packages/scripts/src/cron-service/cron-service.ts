import { CronJob } from "cron";
import { getRoundedTimestamp } from "../utils/date-utils";
import { sync } from "../sync/sync";

CronJob.from({
    cronTime: "* * * * * *",
    onTick: async () => {
        const timestamp = getRoundedTimestamp();
        await sync({ timestamp });
    },
    start: true,
    timeZone: "America/New_York",
});
