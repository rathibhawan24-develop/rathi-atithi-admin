import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  Card,
  CardContent,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Users as UsersIcon,
  ShieldCheck,
  UserMinus,
  Mail,
} from "lucide-react";
import { formatDate } from "@/lib/utils";
import { AddUserDialog } from "./add-user-dialog";
import { UserRowActions } from "./user-row-actions";

export const dynamic = "force-dynamic";

type Profile = {
  id: string;
  email: string;
  full_name: string | null;
  role: "admin" | "staff";
  is_active: boolean;
  created_at: string;
};

export default async function UsersPage() {
  const supabase = createClient();

  // Verify caller is admin — staff who somehow land here get bounced.
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: me } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (me?.role !== "admin") redirect("/");

  const { data, error } = await supabase
    .from("profiles")
    .select("id, email, full_name, role, is_active, created_at")
    .order("created_at", { ascending: true });

  const profiles = (data ?? []) as Profile[];
  const total = profiles.length;
  const adminCount = profiles.filter((p) => p.role === "admin").length;
  const inactiveCount = profiles.filter((p) => !p.is_active).length;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl md:text-4xl tracking-tight flex items-center gap-3">
            <UsersIcon className="h-7 w-7 text-primary" />
            Users
          </h1>
          <p className="text-muted-foreground mt-1">
            Manage who can sign in and what they can do.
          </p>
        </div>
        <AddUserDialog />
      </header>

      <div className="grid grid-cols-3 gap-3">
        <Card>
          <CardContent className="pt-6">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">
              Total
            </p>
            <p className="text-2xl font-semibold tabular-nums mt-1">{total}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">
              Admins
            </p>
            <p className="text-2xl font-semibold tabular-nums mt-1">
              {adminCount}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">
              Deactivated
            </p>
            <p className="text-2xl font-semibold tabular-nums mt-1">
              {inactiveCount}
            </p>
          </CardContent>
        </Card>
      </div>

      {error && (
        <Card>
          <CardContent className="py-6 text-sm text-destructive">
            Could not load users: {error.message}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="p-0">
          {profiles.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">
              No users yet — add the first one with the button above.
            </div>
          ) : (
            <ul className="divide-y">
              {profiles.map((p) => {
                const isSelf = p.id === user.id;
                return (
                  <li
                    key={p.id}
                    className="flex flex-wrap items-center gap-3 px-4 py-3"
                  >
                    <div className="flex-1 min-w-[220px]">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-medium text-sm">
                          {p.full_name || (
                            <span className="text-muted-foreground italic">
                              (no name)
                            </span>
                          )}
                        </p>
                        <Badge
                          variant={p.role === "admin" ? "default" : "secondary"}
                          className="text-[10px] uppercase tracking-wider"
                        >
                          {p.role === "admin" ? (
                            <ShieldCheck className="h-3 w-3 mr-0.5" />
                          ) : null}
                          {p.role}
                        </Badge>
                        {!p.is_active && (
                          <Badge
                            variant="destructive"
                            className="text-[10px] uppercase tracking-wider"
                          >
                            <UserMinus className="h-3 w-3 mr-0.5" />
                            Deactivated
                          </Badge>
                        )}
                        {isSelf && (
                          <Badge
                            variant="muted"
                            className="text-[10px] uppercase tracking-wider"
                          >
                            You
                          </Badge>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground mt-1 flex flex-wrap items-center gap-3">
                        <span className="inline-flex items-center gap-1">
                          <Mail className="h-3 w-3" />
                          {p.email}
                        </span>
                        <span>Joined {formatDate(p.created_at)}</span>
                      </div>
                    </div>
                    <UserRowActions
                      userId={p.id}
                      email={p.email}
                      role={p.role}
                      isActive={p.is_active}
                      isSelf={isSelf}
                    />
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="py-4 text-xs text-muted-foreground">
          <p className="font-medium text-foreground mb-1">About roles</p>
          <ul className="list-disc pl-5 space-y-1">
            <li>
              <span className="font-medium">Admin</span> — full access including
              this users page, settings, pricing, and all bookings.
            </li>
            <li>
              <span className="font-medium">Staff</span> — manage bookings,
              rooms, add-ons, guests, calendar. Cannot manage users or change
              settings.
            </li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
