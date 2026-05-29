"use client";

import { useEffect, useState, useRef } from "react";
import { usePathname } from "next/navigation";

// Thin progress bar at the top of the page that animates during route changes.
// Gives instant feedback when a link is clicked, before loading.tsx (the page
// skeleton) takes over.
export function NavProgress() {
  const pathname = usePathname();
  const [progress, setProgress] = useState(0);
  const [visible, setVisible] = useState(false);
  const firstRender = useRef(true);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  const clearTimers = () => {
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];
  };

  // Complete the bar when the new path is rendered
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    clearTimers();
    setProgress(100);
    timersRef.current.push(
      setTimeout(() => {
        setVisible(false);
        setProgress(0);
      }, 350)
    );
  }, [pathname]);

  // Start the bar as soon as a link is clicked
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
      setProgress(15);
      timersRef.current.push(setTimeout(() => setProgress(45), 120));
      timersRef.current.push(setTimeout(() => setProgress(75), 400));
      timersRef.current.push(setTimeout(() => setProgress(88), 900));
    };
    document.addEventListener("click", onClick);
    return () => {
      document.removeEventListener("click", onClick);
      clearTimers();
    };
  }, [pathname]);

  return (
    <div
      aria-hidden
      className="fixed top-0 left-0 right-0 z-[60] h-0.5 pointer-events-none"
      style={{ opacity: visible ? 1 : 0, transition: "opacity 200ms" }}
    >
      <div
        className="h-full bg-primary shadow-[0_0_8px_rgba(0,0,0,0.2)]"
        style={{
          width: `${progress}%`,
          transition: "width 350ms ease-out",
        }}
      />
    </div>
  );
}
