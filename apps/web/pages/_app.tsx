import type { AppProps } from "next/app";
import "@/global.css";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const queryClient = new QueryClient({
    defaultOptions: {
        queries: {
            refetchOnWindowFocus: false,
            retry: false,
            staleTime: Infinity,
        },
    },
});

const App: React.FC<AppProps> = (props) => {
    const { Component, pageProps } = props;
    return (
        <QueryClientProvider client={queryClient}>
            <Component {...pageProps} />
        </QueryClientProvider>
    );
};

// eslint-disable-next-line collation/no-default-export -- NextJS pages need to be default exported
export default App;
