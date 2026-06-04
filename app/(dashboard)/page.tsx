import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  LogIn,
  LogOut,
  Clock,
  IndianRupee,
  BedDouble,
  ArrowUpRight,
} from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { SyncStatus } from "@/components/sync-status";

export const dynamic = "force-dynamic";

async function getDashboardStats() {
  const supabase = createClient();
  const today = new Date().toISOString().slice(0, 10);

  const [
    { count: totalRooms },
    { count: pendingCount },
    { count: checkInsToday },
    { count: checkOutsToday },
    { data: outstandingBookings },
  ] = await Promise.all([
    supabase
      .from("rooms")
      .select("*", { count: "exact", head: true })
      .eq("is_active", true),
    supabase
      .from("bookings")
      .select("*", { count: "exact", head: true })
      .eq("status", "pending"),
    supabase
      .from("bookings")
      .select("*", { count: "exact", head: true })
      .eq("check_in", today)
      .in("status", ["confirmed", "pending"]),
    supabase
      .from("bookings")
      .select("*", { count: "exact", head: true })
      .eq("check_out", today)
      .eq("status", "checked_in"),
    supabase
      .from("bookings")
      .select("balance")
      .gt("balance", 0)
      .in("status", ["confirmed", "checked_in"]),
  ]);

  const outstandingTotal =
    outstandingBookings?.reduce((sum, b) => sum + Number(b.balance), 0) ?? 0;

  return {
    totalRooms: totalRooms ?? 0,
    pendingCount: pendingCount ?? 0,
    checkInsToday: checkInsToday ?? 0,
    checkOutsToday: checkOutsToday ?? 0,
    outstandingTotal,
  };
}


const WEEKDAYS = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
const MONTHS_LONG = ["January","February","March","April","May","June","July","August","September","October","November","December"];

function formatTodayLong(): string {
  const d = new Date();
  return `${WEEKDAYS[d.getDay()]}, ${d.getDate()} ${MONTHS_LONG[d.getMonth()]} ${d.getFullYear()}`;
}

export default async function DashboardPage() {
  const stats = await getDashboardStats();

  const cards = [
    {
      label: "Check-ins today",
      value: stats.checkInsToday,
      icon: LogIn,
      tone: "text-success",
      href: "/bookings?view=checkins_today",
    },
    {
      label: "Check-outs today",
      value: stats.checkOutsToday,
      icon: LogOut,
      tone: "text-primary",
      href: "/bookings?view=checkouts_today",
    },
    {
      label: "Pending confirmations",
      value: stats.pendingCount,
      icon: Clock,
      tone: "text-warning",
      href: "/bookings?view=pending",
    },
    {
      label: "Outstanding balance",
      value: formatCurrency(stats.outstandingTotal),
      icon: IndianRupee,
      tone: "text-destructive",
      href: "/bookings?view=outstanding",
    },
    {
      label: "Active rooms",
      value: stats.totalRooms,
      icon: BedDouble,
      tone: "text-muted-foreground",
      href: "/rooms",
    },
  ];

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl md:text-4xl tracking-tight">
            Dashboard
          </h1>
          <p className="text-muted-foreground mt-1">
            Today at a glance — {formatTodayLong()}
          </p>
        </div>
        <SyncStatus />
      </header>

      <section className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <Link
              key={card.label}
              href={card.href}
              className="block group focus-visible:outline-none rounded-lg"
              aria-label={`${card.label}: ${card.value}. View details.`}
            >
              <Card className="h-full transition-all group-hover:border-primary/40 group-hover:shadow-md group-hover:-translate-y-0.5 group-focus-visible:ring-2 group-focus-visible:ring-ring">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    {card.label}
                  </CardTitle>
                  <Icon className={`h-4 w-4 ${card.tone}`} />
                </CardHeader>
                <CardContent>
                  <div className="flex items-end justify-between">
                    <div className="text-2xl font-semibold tabular-nums">
                      {card.value}
                    </div>
                    <ArrowUpRight className="h-4 w-4 text-muted-foreground/40 opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </section>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Getting started</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <p>
            Welcome to the Rathi Atithi Bhawan admin dashboard. Click any card
            above to see the bookings behind that number — for example,
            today&apos;s check-ins, today&apos;s check-outs, or who still owes
            a balance.
          </p>
          <p>
            Use the sidebar to manage{" "}
            <span className="font-medium text-foreground">Rooms</span>,{" "}
            <span className="font-medium text-foreground">Add-ons</span>,{" "}
            <span className="font-medium text-foreground">Pricing</span>, and{" "}
            <span className="font-medium text-foreground">Settings</span>{" "}
            whenever you need.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
