import { ChakraProvider, defaultSystem } from "@chakra-ui/react";
import { createRouter, RouterProvider } from "@tanstack/react-router";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { routeTree } from "./routeTree.gen";
import "./global.css";

const router = createRouter({ routeTree });

declare module "@tanstack/react-router" {
    // eslint-disable-next-line @typescript-eslint/consistent-type-definitions -- Router registration requires module augmentation.
    interface Register {
        router: typeof router;
    }
}

const root = document.getElementById("root");
if (root === null) {
    throw new Error("Missing application root.");
}

createRoot(root).render(
    <StrictMode>
        <ChakraProvider value={defaultSystem}>
            <RouterProvider router={router} />
        </ChakraProvider>
    </StrictMode>
);
