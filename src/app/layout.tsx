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
      { url: "/api/icon?size=96",  sizes: "96x96",   type: "image/png" },
      { url: "/api/icon?size=192", sizes: "192x192", type: "image/png" },
      { url: "/api/icon?size=512", sizes: "512x512", type: "image/png" },
    ],
    apple: [
      { url: "/api/icon?size=152", sizes: "152x152", type: "image/png" },
      { url: "/api/icon?size=192", sizes: "192x192", type: "image/png" },
    ],
    shortcut: "/api/icon?size=96",
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
        <link rel="manifest" href="/api/manifest" />
        <meta name="theme-color" content="#000000" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <link rel="apple-touch-icon" href="/api/icon?size=192" />
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
