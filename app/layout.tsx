import type { Metadata } from "next";
import "./globals.css";
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
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
