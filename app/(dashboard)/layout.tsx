import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Sidebar } from "@/components/nav/sidebar";
import { NavProgress } from "@/components/nav-progress";
import { AlertSound } from "@/components/alert-sound";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("email, full_name, role, is_active")
    .eq("id", user.id)
    .single();

  if (!profile || !profile.is_active) {
    await supabase.auth.signOut();
    redirect("/login");
  }

  // md:flex => on mobile this is a normal block (top bar stacks above content);
  // on desktop it's a row (sidebar beside content).
  return (
    <div className="md:flex min-h-screen bg-background">
      <NavProgress />
      <Sidebar userEmail={profile.email} userRole={profile.role} />
      <main className="flex-1 overflow-x-hidden">
        <div className="px-4 py-5 sm:px-6 md:px-8 md:py-8 max-w-7xl mx-auto animate-fade-in">
          {children}
        </div>
      </main>
      <AlertSound />
    </div>
  );
}
