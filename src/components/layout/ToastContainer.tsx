"use client";

import { useToastStore } from "@/store/toast";
import { X, AlertCircle, CheckCircle2, Info } from "lucide-react";

const icons = {
  error: <AlertCircle size={15} className="text-red-400 shrink-0" />,
  success: <CheckCircle2 size={15} className="text-green-400 shrink-0" />,
  info: <Info size={15} className="text-blue-400 shrink-0" />,
};

const borders = {
  error: "border-red-500/30",
  success: "border-green-500/30",
  info: "border-blue-500/30",
};

export default function ToastContainer() {
  const { toasts, dismiss } = useToastStore();

  if (toasts.length === 0) return null;

  return (
    <div className="fixed top-4 right-4 z-[200] flex flex-col gap-2 max-w-sm w-full pointer-events-none">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`flex items-start gap-2.5 bg-zinc-900 border ${borders[t.type]} rounded-xl px-3.5 py-3 shadow-2xl shadow-black/60 pointer-events-auto`}
        >
          {icons[t.type]}
          <p className="flex-1 text-sm text-zinc-200 leading-snug">{t.message}</p>
          <button
            onClick={() => dismiss(t.id)}
            className="text-zinc-500 hover:text-zinc-300 transition-colors shrink-0"
          >
            <X size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}
