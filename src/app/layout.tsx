import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import SessionWrapper from "@/components/layout/SessionWrapper";
import ThemeProvider from "@/components/layout/ThemeProvider";
import ServiceWorkerRegister from "@/components/layout/ServiceWorkerRegister";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Jokerly",
  description: "Discover, search, and play your music",
  icons: {
    icon: [
      { url: "/icon-96.png",  sizes: "96x96",   type: "image/png" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [
      { url: "/icon-152.png", sizes: "152x152", type: "image/png" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
    ],
    shortcut: "/icon-96.png",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Jokerly",
  },
  other: {
    "msapplication-TileImage": "/icon-144.png",
    "msapplication-TileColor": "#000000",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full" suppressHydrationWarning>
      <head>
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#000000" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <link rel="apple-touch-icon" href="/icon-192.png" />
      </head>
      <body className={`${inter.className} antialiased h-full`}>
        <ThemeProvider>
          <SessionWrapper>{children}</SessionWrapper>
        </ThemeProvider>
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
