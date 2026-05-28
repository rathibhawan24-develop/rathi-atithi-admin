"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  CalendarDays,
  BedDouble,
  Plus,
  Users,
  IndianRupee,
  Receipt,
  Settings,
  LogOut,
  Sparkles,
  Menu,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";

type NavItem = {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: string;
};

const mainNav: NavItem[] = [
  { label: "Dashboard", href: "/", icon: LayoutDashboard },
  { label: "Bookings", href: "/bookings", icon: CalendarDays },
  { label: "Calendar", href: "/calendar", icon: CalendarDays },
  { label: "New Walk-in", href: "/bookings/new", icon: Plus },
];

const managementNav: NavItem[] = [
  { label: "Rooms", href: "/rooms", icon: BedDouble },
  { label: "Add-ons", href: "/addons", icon: Sparkles },
  { label: "Pricing", href: "/pricing", icon: IndianRupee },
  { label: "Guests", href: "/guests", icon: Users },
  { label: "Reports", href: "/reports", icon: Receipt },
  { label: "Settings", href: "/settings", icon: Settings },
];

export function Sidebar({
  userEmail,
  userRole,
}: {
  userEmail: string;
  userRole: string;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);

  const handleLogout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  };

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  const renderItem = (item: NavItem) => {
    const active = isActive(item.href);
    const Icon = item.icon;
    return (
      <Link
        key={item.href}
        href={item.href}
        onClick={() => setOpen(false)}
        className={cn(
          "flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition-colors",
          active
            ? "bg-primary/10 text-primary"
            : "text-foreground/70 hover:bg-secondary hover:text-foreground"
        )}
      >
        <Icon className="h-4 w-4 shrink-0" />
        <span className="truncate">{item.label}</span>
        {item.badge && (
          <span className="ml-auto rounded-full bg-primary/15 px-2 py-0.5 text-xs text-primary">
            {item.badge}
          </span>
        )}
      </Link>
    );
  };

  // Shared nav lists + user section, reused by desktop sidebar and mobile drawer.
  const navLists = (
    <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-6">
      <div className="space-y-1">{mainNav.map(renderItem)}</div>
      <div>
        <p className="px-3 mb-2 text-[11px] uppercase tracking-widest text-muted-foreground/70">
          Manage
        </p>
        <div className="space-y-1">{managementNav.map(renderItem)}</div>
      </div>
    </nav>
  );

  const userSection = (
    <div className="border-t border-border p-4">
      <div className="px-2 mb-3">
        <p className="text-sm font-medium truncate">{userEmail}</p>
        <p className="text-xs text-muted-foreground capitalize">{userRole}</p>
      </div>
      <button
        type="button"
        onClick={handleLogout}
        className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-foreground/70 hover:bg-destructive/10 hover:text-destructive transition-colors"
      >
        <LogOut className="h-4 w-4 shrink-0" />
        <span>Sign out</span>
      </button>
    </div>
  );

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden md:flex md:flex-col w-64 border-r border-border bg-card h-screen sticky top-0">
        <div className="px-6 py-5 border-b border-border">
          <h1 className="font-display text-xl leading-tight tracking-tight">
            Rathi Atithi
          </h1>
          <p className="text-[11px] uppercase tracking-widest text-muted-foreground mt-0.5">
            Bhawan · Vrindavan
          </p>
        </div>
        {navLists}
        {userSection}
      </aside>

      {/* Mobile top bar */}
      <div className="md:hidden sticky top-0 z-40 flex items-center justify-between border-b border-border bg-card px-4 h-14">
        <div className="leading-tight">
          <p className="font-display text-lg">Rathi Atithi</p>
          <p className="text-[9px] uppercase tracking-widest text-muted-foreground -mt-0.5">
            Bhawan · Vrindavan
          </p>
        </div>
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Open menu"
          className="h-10 w-10 inline-flex items-center justify-center rounded-md hover:bg-secondary transition-colors"
        >
          <Menu className="h-5 w-5" />
        </button>
      </div>

      {/* Mobile drawer */}
      {open && (
        <div className="md:hidden fixed inset-0 z-50">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setOpen(false)}
          />
          <aside className="absolute left-0 top-0 bottom-0 w-72 max-w-[82%] bg-card border-r border-border flex flex-col shadow-xl">
            <div className="flex items-center justify-between px-4 h-14 border-b border-border shrink-0">
              <div className="leading-tight">
                <p className="font-display text-lg">Rathi Atithi</p>
                <p className="text-[9px] uppercase tracking-widest text-muted-foreground -mt-0.5">
                  Bhawan · Vrindavan
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close menu"
                className="h-10 w-10 inline-flex items-center justify-center rounded-md hover:bg-secondary transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            {navLists}
            {userSection}
          </aside>
        </div>
      )}
    </>
  );
}
