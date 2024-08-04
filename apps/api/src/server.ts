import { app } from "./app";
import { PORT } from "./config";

app.listen(PORT, () => {
    // eslint-disable-next-line no-console
    console.log(`⚡️[server]: Server is running at http://localhost:${PORT}`);
});
