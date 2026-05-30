import Topbar from "@/components/layout/Topbar";
import PlayerBar from "@/components/layout/PlayerBar";
import ToastContainer from "@/components/layout/ToastContainer";
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col min-h-screen" style={{ background: "var(--background)" }}>
      <Topbar />
      <main className="flex-1 w-full max-w-2xl mx-auto px-4 py-6 pb-44 relative z-10">
        {children}
      </main>
      <PlayerBar />
      <ToastContainer />
    </div>
  );
}
