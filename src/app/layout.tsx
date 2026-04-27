import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import SessionWrapper from "@/components/layout/SessionWrapper";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Jokerly Music",
  description: "Discover, search, and manage your music",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full">
      <body className={`${inter.className} bg-zinc-950 text-white antialiased h-full`}>
        <SessionWrapper>{children}</SessionWrapper>
      </body>
    </html>
  );
}
