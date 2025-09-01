import { Html, Head, Main, NextScript } from "next/document";

const Document: React.FC = () => {
    return (
        <Html lang="en">
            <Head>
                <link href="/favicon.png" rel="icon" type="image/x-icon" />
            </Head>
            <body>
                <Main />
                <NextScript />
            </body>
        </Html>
    );
};

export default Document;
