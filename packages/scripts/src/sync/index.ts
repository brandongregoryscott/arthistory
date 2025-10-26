import { sync } from "./sync";
import { getRoundedTimestamp } from "../utils/date-utils";

sync({ timestamp: getRoundedTimestamp() });
