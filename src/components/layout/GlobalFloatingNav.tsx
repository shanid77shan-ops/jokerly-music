"use client";

import { usePathname } from "next/navigation";
import FloatingNav from "@/components/layout/FloatingNav";

const HIDDEN_PATHS = new Set(["/login", "/onboarding"]);

/** Bottom nav on every authenticated screen (hidden on login/onboarding only). */
export default function GlobalFloatingNav() {
  const pathname = usePathname();
  if (HIDDEN_PATHS.has(pathname)) return null;
  return <FloatingNav />;
}
