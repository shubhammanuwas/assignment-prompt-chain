import "server-only";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase";

export async function requireSuperadmin() {
  const supabase = await createSupabaseServerClient();
  if (!supabase) redirect("/login?error=configuration");

  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError && userError.name !== "AuthSessionMissingError") {
    throw new Error(`Could not verify your session: ${userError.message}`);
  }
  if (!user) redirect("/login");
  if (user.app_metadata.provider !== "google") redirect("/login?reason=google");

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("is_superadmin")
    .eq("id", user.id)
    .maybeSingle();
  if (error) throw new Error(`Could not verify superadmin access: ${error.message}`);
  if (profile?.is_superadmin !== true) return { supabase, user, isAdmin: false };

  return { supabase, user, isAdmin: true };
}

export async function requireSuperadminAction() {
  const session = await requireSuperadmin();
  if (!session.isAdmin) throw new Error("Only superadmins can manage prompt chains.");
  return { supabase: session.supabase, user: session.user };
}
