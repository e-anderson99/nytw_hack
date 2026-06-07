import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Knicks Watch Map — Find your spot around MSG",
  description:
    "Predictive heat map of NYC crowds, bars, and subway congestion around Knicks games at Madison Square Garden.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="h-full">{children}</body>
    </html>
  );
}
