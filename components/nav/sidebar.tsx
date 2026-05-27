"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
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
} from "lucide-react";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";

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

  const handleLogout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  };

  const renderItem = (item: NavItem) => {
    const isActive =
      item.href === "/"
        ? pathname === "/"
        : pathname.startsWith(item.href);
    const Icon = item.icon;
    return (
      <Link
        key={item.href}
        href={item.href}
        className={cn(
          "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
          isActive
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

  return (
    <aside className="hidden md:flex md:flex-col w-64 border-r border-border bg-card h-screen sticky top-0">
      {/* Brand */}
      <div className="px-6 py-5 border-b border-border">
        <h1 className="font-display text-xl leading-tight tracking-tight">
          Rathi Atithi
        </h1>
        <p className="text-[11px] uppercase tracking-widest text-muted-foreground mt-0.5">
          Bhawan · Vrindavan
        </p>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-6">
        <div className="space-y-1">{mainNav.map(renderItem)}</div>

        <div>
          <p className="px-3 mb-2 text-[11px] uppercase tracking-widest text-muted-foreground/70">
            Manage
          </p>
          <div className="space-y-1">{managementNav.map(renderItem)}</div>
        </div>
      </nav>

      {/* User */}
      <div className="border-t border-border p-4">
        <div className="px-2 mb-3">
          <p className="text-sm font-medium truncate">{userEmail}</p>
          <p className="text-xs text-muted-foreground capitalize">
            {userRole}
          </p>
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
    </aside>
  );
}
