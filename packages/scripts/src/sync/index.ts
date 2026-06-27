import { getRoundedTimestamp } from "../utils/date-utils";
import { sync } from "./sync";

sync({ timestamp: getRoundedTimestamp() });
