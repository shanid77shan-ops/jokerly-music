"use client";

import { signOut } from "next-auth/react";
import { useSession } from "next-auth/react";
import Image from "next/image";
import { LogOut } from "lucide-react";

export default function Topbar() {
  const { data: session } = useSession();

  return (
    <header className="h-14 bg-zinc-950/80 backdrop-blur border-b border-zinc-800 flex items-center justify-end px-6 gap-3 shrink-0">
      {session?.user?.image && (
        <Image
          src={session.user.image}
          alt={session.user.name ?? "User"}
          width={32}
          height={32}
          className="rounded-full"
        />
      )}
      <span className="text-zinc-300 text-sm font-medium">{session?.user?.name}</span>
      <button
        onClick={() => signOut({ callbackUrl: "/login" })}
        className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
        title="Sign out"
      >
        <LogOut size={18} />
      </button>
    </header>
  );
}
