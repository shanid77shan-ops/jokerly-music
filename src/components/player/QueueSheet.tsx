"use client";

import { useEffect, useRef, useState } from "react";
import { usePlayerStore } from "@/store/player";
import { ChevronDown, Music, Trash2, Play, Pause, GripVertical, Sparkles } from "lucide-react";
import SimilarMusicSection from "@/components/player/SimilarMusicSection";
import Image from "next/image";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

interface Props {
  onPlayIndex: (index: number) => boolean | void;
}

function SortableTrack({
  track,
  index,
  isCurrent,
  isCurrentlyPlaying,
  onPlay,
  onRemove,
}: {
  track: { name: string; artist: string; image?: string | null; uri?: string | null };
  index: number;
  isCurrent: boolean;
  isCurrentlyPlaying: boolean;
  onPlay: () => void;
  onRemove: (e: React.MouseEvent) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: `${track.uri ?? track.name}-${index}`,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 10 : undefined,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      onClick={onPlay}
      className={`flex items-center gap-3 px-3 py-2.5 rounded-2xl cursor-pointer transition-all border group ${
        isCurrent
          ? "bg-[#E8282B]/10 border-[#E8282B]/20"
          : "border-transparent hover:bg-white/[0.05] hover:border-white/[0.06]"
      }`}
    >
      {/* Drag handle */}
      <button
        {...attributes}
        {...listeners}
        onClick={(e) => e.stopPropagation()}
        className="shrink-0 p-0.5 text-white/15 hover:text-white/40 transition-colors touch-none cursor-grab active:cursor-grabbing"
      >
        <GripVertical size={14} />
      </button>

      <span className={`text-xs w-5 text-right shrink-0 tabular-nums font-medium ${isCurrent ? "text-[#E8282B]" : "text-white/25"}`}>
        {index + 1}
      </span>

      <div className="relative shrink-0 w-10 h-10">
        {track.image ? (
          <Image src={track.image} alt={track.name} fill unoptimized className="rounded-xl object-cover" sizes="40px" />
        ) : (
          <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: "var(--card)" }}>
            <Music size={14} className="text-white/20" />
          </div>
        )}
        <div className={`absolute inset-0 rounded-xl flex items-center justify-center bg-black/50 transition-opacity ${isCurrent ? "opacity-100" : "opacity-0 group-hover:opacity-100"}`}>
          {isCurrentlyPlaying
            ? <Pause size={12} fill="white" className="text-white" />
            : <Play size={12} fill="white" className="text-white" />
          }
        </div>
      </div>

      <div className="flex-1 min-w-0">
        <p className={`text-sm font-medium truncate leading-tight ${isCurrent ? "text-[#E8282B]" : "text-white"}`}>
          {track.name}
        </p>
        <p className="text-xs text-white/40 truncate mt-0.5">{track.artist}</p>
      </div>

      <button
        onClick={onRemove}
        className="shrink-0 p-1.5 rounded-lg text-white/20 hover:text-red-400 hover:bg-red-500/10 transition-colors opacity-0 group-hover:opacity-100"
      >
        <Trash2 size={13} />
      </button>
    </div>
  );
}

export default function QueueSheet({ onPlayIndex }: Props) {
  const { queue, queueIndex, isPlaying, removeFromQueue, reorderQueue, currentTrack } = usePlayerStore();
  const [tab, setTab] = useState<"queue" | "similar">("queue");
  const activeRef = useRef<HTMLDivElement | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } }),
  );

  useEffect(() => {
    activeRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, []);

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const ids = queue.map((t, i) => `${t.uri ?? t.name}-${i}`);
    const fromIndex = ids.indexOf(active.id as string);
    const toIndex = ids.indexOf(over.id as string);
    if (fromIndex !== -1 && toIndex !== -1) {
      reorderQueue(fromIndex, toIndex);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[55] flex flex-col"
      style={{ background: "rgba(6,4,16,0.97)", backdropFilter: "blur(28px)" }}
    >
      {/* Header */}
      <div className="px-5 pt-5 pb-3 shrink-0 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-white font-bold text-lg">
              {tab === "queue" ? "Queue" : "Similar"}
            </h2>
            <p className="text-xs text-white/30 mt-0.5">
              {tab === "queue"
                ? `${queue.length} track${queue.length !== 1 ? "s" : ""}`
                : currentTrack
                  ? `Like ${currentTrack.name}`
                  : "Based on now playing"}
            </p>
          </div>
          <button
            onClick={() => usePlayerStore.setState({ isQueueOpen: false })}
            className="p-2 rounded-xl text-white/40 hover:text-white hover:bg-white/[0.08] transition-colors"
          >
            <ChevronDown size={20} />
          </button>
        </div>

        <div className="flex gap-2 p-1 rounded-xl" style={{ background: "var(--card)" }}>
          <button
            type="button"
            onClick={() => setTab("queue")}
            className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-colors ${
              tab === "queue" ? "bg-[#E8282B] text-white" : "text-white/45 hover:text-white"
            }`}
          >
            Queue
          </button>
          <button
            type="button"
            onClick={() => setTab("similar")}
            className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-colors flex items-center justify-center gap-1 ${
              tab === "similar" ? "bg-[#E8282B] text-white" : "text-white/45 hover:text-white"
            }`}
          >
            <Sparkles size={12} /> Similar
          </button>
        </div>
      </div>

      {/* Track list / similar */}
      <div className="flex-1 overflow-y-auto px-3 pb-6 space-y-0.5 min-h-0">
        {tab === "similar" && currentTrack ? (
          <SimilarMusicSection track={currentTrack} compact />
        ) : tab === "similar" ? (
          <div className="flex flex-col items-center justify-center h-48 gap-3">
            <Sparkles size={28} className="text-white/10" />
            <p className="text-sm text-white/30">Play a song to see similar music</p>
          </div>
        ) : queue.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 gap-3">
            <Music size={32} className="text-white/10" />
            <p className="text-sm text-white/30">Queue is empty</p>
          </div>
        ) : (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext
              items={queue.map((t, i) => `${t.uri ?? t.name}-${i}`)}
              strategy={verticalListSortingStrategy}
            >
              {queue.map((track, i) => {
                const isCurrent = i === queueIndex;
                const isCurrentlyPlaying = isCurrent && isPlaying;

                return (
                  <div key={`${track.uri ?? track.name}-${i}`} ref={isCurrent ? activeRef : null}>
                    <SortableTrack
                      track={track}
                      index={i}
                      isCurrent={isCurrent}
                      isCurrentlyPlaying={isCurrentlyPlaying}
                      onPlay={() => {
                        const didStart = onPlayIndex(i);
                        if (didStart !== false) {
                          usePlayerStore.setState({ isQueueOpen: false });
                        }
                      }}
                      onRemove={(e) => { e.stopPropagation(); removeFromQueue(i); }}
                    />
                  </div>
                );
              })}
            </SortableContext>
          </DndContext>
        )}
      </div>
    </div>
  );
}
