import { Head, Html, Main, NextScript } from 'next/document';

export default function Document() {
  return (
    <Html lang="en">
      <Head>
        <meta
          name="description"
          content="ChatLLM Web - 无需翻墙的多模型LLM对话平台，支持ChatGPT-4O、Claude、Gemini、DeepSeek R1等模型。"
        ></meta>
        <meta name="application-name" content="ChatLLM-Web" />
        <meta name="theme-color" content="#fff" />
        <link rel="apple-touch-icon" href="/assets/icon-48x48.png"></link>
        <link rel="manifest" href="/manifest.json" />
      </Head>
      <body>
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}
