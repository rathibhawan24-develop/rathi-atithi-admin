import { createClient } from "@/lib/supabase/server";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  CalendarCheck,
  LogIn,
  LogOut,
  Clock,
  IndianRupee,
  BedDouble,
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

export default async function DashboardPage() {
  const stats = await getDashboardStats();

  const cards = [
    {
      label: "Check-ins today",
      value: stats.checkInsToday,
      icon: LogIn,
      tone: "text-success",
    },
    {
      label: "Check-outs today",
      value: stats.checkOutsToday,
      icon: LogOut,
      tone: "text-primary",
    },
    {
      label: "Pending confirmations",
      value: stats.pendingCount,
      icon: Clock,
      tone: "text-warning",
    },
    {
      label: "Outstanding balance",
      value: formatCurrency(stats.outstandingTotal),
      icon: IndianRupee,
      tone: "text-destructive",
    },
    {
      label: "Active rooms",
      value: stats.totalRooms,
      icon: BedDouble,
      tone: "text-muted-foreground",
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
          Today at a glance — {new Date().toLocaleDateString("en-IN", {
            weekday: "long",
            day: "numeric",
            month: "long",
            year: "numeric",
          })}
        </p>
        </div>
        <SyncStatus />
      </header>

      <section className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <Card key={card.label}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  {card.label}
                </CardTitle>
                <Icon className={`h-4 w-4 ${card.tone}`} />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-semibold tabular-nums">
                  {card.value}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </section>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Getting started</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <p>
            Welcome to the Rathi Atithi Bhawan admin dashboard. This is your
            home screen — once bookings start coming in, today&apos;s
            check-ins, check-outs, and pending confirmations will appear here.
          </p>
          <p>
            The next sections to build out are{" "}
            <span className="font-medium text-foreground">Rooms</span>{" "}
            (upload photos, set pricing) and{" "}
            <span className="font-medium text-foreground">Bookings</span>{" "}
            (the calendar grid and booking detail screens). Use the sidebar
            to navigate when those are ready.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
