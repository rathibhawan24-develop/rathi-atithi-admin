"use client";

import { useEffect, useRef, useState } from "react";
import { Bell, BellOff } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

const STORAGE_KEY = "alert-sound-enabled";

// Floating bell-icon toggle in the bottom-right corner.
// When enabled, subscribes to INSERT events on the bookings table
// (via Supabase Realtime) and plays a loud sound for ~4 seconds on
// every new customer booking (source='web'). Walk-ins (created by
// the admin) do not trigger the sound — they were just typed in.
export function AlertSound() {
  const [enabled, setEnabled] = useState(true);
  const [primed, setPrimed] = useState(false);
  const [pulse, setPulse] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Load saved preference
  useEffect(() => {
    if (typeof window === "undefined") return;
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved === "false") setEnabled(false);
  }, []);

  // Persist
  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(STORAGE_KEY, String(enabled));
  }, [enabled]);

  // Subscribe to new bookings via Supabase Realtime.
  // We subscribe once and read `enabled` from a ref so toggling on/off
  // doesn't churn the channel.
  const enabledRef = useRef(enabled);
  useEffect(() => {
    enabledRef.current = enabled;
  }, [enabled]);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel("admin-new-bookings")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "bookings" },
        (payload) => {
          const row = payload.new as {
            guest_name?: string;
            source?: string;
            booking_code?: string;
          };
          // Walk-ins are created by the admin themselves; no need to ring.
          if (row.source !== "web") return;

          // Visual feedback regardless of sound
          setPulse(true);
          setTimeout(() => setPulse(false), 4500);
          toast.success(
            `New booking: ${row.guest_name ?? "Guest"} (${row.booking_code ?? ""})`,
            { duration: 8000 }
          );

          if (enabledRef.current && audioRef.current) {
            audioRef.current.currentTime = 0;
            audioRef.current.play().catch(() => {
              // Autoplay blocked — user hasn't interacted with the page yet.
              // The toast still appears, so they aren't left unaware.
            });
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const handleToggle = () => {
    const next = !enabled;
    setEnabled(next);
    // Prime audio on first user click so future autoplay works
    if (next && audioRef.current && !primed) {
      const a = audioRef.current;
      const oldVolume = a.volume;
      a.volume = 0;
      a.play()
        .then(() => {
          a.pause();
          a.currentTime = 0;
          a.volume = oldVolume;
          setPrimed(true);
        })
        .catch(() => {
          a.volume = oldVolume;
        });
    }
  };

  const handleTest = () => {
    if (!audioRef.current) return;
    audioRef.current.currentTime = 0;
    audioRef.current.volume = 1;
    audioRef.current.play().catch(() => {
      toast.error("Browser blocked the sound. Click the page once, then retry.");
    });
    setPulse(true);
    setTimeout(() => setPulse(false), 4500);
    setPrimed(true);
  };

  return (
    <>
      <div className="fixed bottom-4 right-4 z-40 flex items-center gap-2">
        <button
          type="button"
          onClick={handleTest}
          className="rounded-full bg-card border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors shadow-sm"
          title="Play test sound"
        >
          Test
        </button>
        <button
          type="button"
          onClick={handleToggle}
          aria-label={enabled ? "Disable alert sound" : "Enable alert sound"}
          className={cn(
            "inline-flex items-center gap-2 rounded-full border px-3.5 py-2 text-sm font-medium shadow-md transition-colors",
            enabled
              ? "bg-primary text-primary-foreground border-primary hover:bg-primary/90"
              : "bg-card text-muted-foreground border-border hover:bg-secondary",
            pulse && "animate-pulse ring-4 ring-primary/40"
          )}
          title={enabled ? "Sound alerts on" : "Sound alerts off"}
        >
          {enabled ? (
            <Bell className="h-4 w-4" />
          ) : (
            <BellOff className="h-4 w-4" />
          )}
          <span className="hidden sm:inline">
            {enabled ? "Sounds on" : "Sounds off"}
          </span>
        </button>
      </div>

      {/* Audio element. preload=auto so the first ring isn't delayed. */}
      <audio
        ref={audioRef}
        src="/sounds/new-booking.wav"
        preload="auto"
        playsInline
      />
    </>
  );
}
