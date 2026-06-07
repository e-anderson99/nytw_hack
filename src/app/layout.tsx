import type { Metadata } from "next";
import { Anton } from "next/font/google";
import "./globals.css";

const anton = Anton({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-display",
  display: "swap",
});

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
    <html lang="en" className={`h-full antialiased ${anton.variable}`}>
      <body className="h-full">{children}</body>
    </html>
  );
}
