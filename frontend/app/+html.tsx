import { ScrollViewStyleReset } from 'expo-router/html';
import { type PropsWithChildren } from 'react';

export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600;9..144,700&family=Inter+Tight:wght@400;500;600;700&family=JetBrains+Mono:wght@500&display=swap"
        />
        <ScrollViewStyleReset />
        <style dangerouslySetInnerHTML={{ __html: globalCSS }} />
      </head>
      <body>{children}</body>
    </html>
  );
}

// Body + heading defaults so the new fonts kick in even before per-component
// fontFamily props are wired up. Numeric features for tabular figures.
const globalCSS = `
html, body, #root, #__next {
  background-color: #F5F1E8;
}
body {
  font-family: "Inter Tight", -apple-system, system-ui, sans-serif;
  font-feature-settings: "ss01", "cv11";
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  color: #0F1B14;
}
h1, h2, h3 {
  font-family: "Fraunces", Georgia, serif;
  font-feature-settings: "ss01";
  letter-spacing: -0.01em;
}
input, textarea, button, select {
  font-family: inherit;
}
`;
