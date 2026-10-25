import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createRootRoute, Link, Outlet } from "@tanstack/react-router";

const queryClient = new QueryClient({
    defaultOptions: {
        queries: {
            refetchOnWindowFocus: false,
            retry: false,
            staleTime: Infinity,
        },
    },
});

const RootComponent = () => (
    <QueryClientProvider client={queryClient}>
        <Outlet />
    </QueryClientProvider>
);

const NotFoundPage = () => (
    <main>
        <h1>Page not found</h1>
        <Link to="/">Return home</Link>
    </main>
);

const Route = createRootRoute({
    component: RootComponent,
    notFoundComponent: NotFoundPage,
});

export { Route };
