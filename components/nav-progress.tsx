"use client";

import { useEffect, useState, useRef } from "react";
import { usePathname } from "next/navigation";
import { Loader2 } from "lucide-react";

// Small floating "Loading…" popup that appears the instant a link is clicked
// and disappears once the destination page renders. Gives clear feedback so
// nobody is left wondering whether the click registered.
export function NavProgress() {
  const pathname = usePathname();
  const [visible, setVisible] = useState(false);
  const firstRender = useRef(true);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const safetyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimers = () => {
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
    if (safetyTimerRef.current) {
      clearTimeout(safetyTimerRef.current);
      safetyTimerRef.current = null;
    }
  };

  // Hide when the new path is rendered (with a tiny delay so it doesn't
  // flicker for instant navigations).
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    hideTimerRef.current = setTimeout(() => setVisible(false), 150);
  }, [pathname]);

  // Show as soon as a link is clicked.
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey)
        return;
      const target = (e.target as HTMLElement).closest("a[href]");
      if (!target) return;
      const href = target.getAttribute("href");
      const targetAttr = target.getAttribute("target");
      if (!href || href.startsWith("#") || targetAttr === "_blank") return;
      if (!href.startsWith("/")) return;
      // Same path -> nothing to load
      if (href === pathname || href.split("?")[0] === pathname) return;

      clearTimers();
      setVisible(true);
      // Safety net: never let the popup get stuck on screen.
      safetyTimerRef.current = setTimeout(() => setVisible(false), 8000);
    };
    document.addEventListener("click", onClick);
    return () => {
      document.removeEventListener("click", onClick);
      clearTimers();
    };
  }, [pathname]);

  if (!visible) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed top-20 md:top-6 left-1/2 -translate-x-1/2 z-[60] pointer-events-none animate-in fade-in slide-in-from-top-2 duration-200"
    >
      <div className="inline-flex items-center gap-2.5 rounded-full bg-card/95 backdrop-blur border border-border px-4 py-2 shadow-lg">
        <Loader2 className="h-4 w-4 text-primary animate-spin" />
        <span className="text-sm font-medium text-foreground">Loading…</span>
      </div>
    </div>
  );
}
