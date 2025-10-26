import { CronJob } from "cron";
import { sync } from "./sync";

CronJob.from({
    cronTime: "* * * * * *",
    onTick: sync,
    start: true,
    timeZone: "America/New_York",
});
