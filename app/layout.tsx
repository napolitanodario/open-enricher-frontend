import type { Metadata } from "next";
import "@fontsource-variable/manrope";
import "./globals.css";
import "./workspace.css";
export const metadata: Metadata = {
  title: "OpenEnricher · Experiment explorer",
  description:
    "Inspect local extraction experiments, scene evidence and processing performance.",
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(() => {
          let theme;
          try { theme = localStorage.getItem("oe-theme"); } catch {}
          document.documentElement.dataset.theme = theme === "light" || theme === "dark"
            ? theme : matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
        })();`,
          }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
