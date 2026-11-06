import { redirect } from "next/navigation";
import Link from "next/link";
import { getTheme } from "@/lib/theme";
import { createSupabaseServerClient } from "@/lib/supabase";
import { GoogleSignInButton } from "./sign-in-button";
import { ThemeControl } from "@/app/theme-control";

export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; reason?: string }>;
}) {
  const supabase = await createSupabaseServerClient();
  if (supabase) {
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error && error.name !== "AuthSessionMissingError") {
      throw new Error(`Could not check the current sign-in: ${error.message}`);
    }
    if (user?.app_metadata.provider === "google") {
      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("is_superadmin")
        .eq("id", user.id)
        .maybeSingle();
      if (profileError) throw new Error(`Could not check superadmin access: ${profileError.message}`);
      if (profile?.is_superadmin === true) redirect("/");
    }
  }
  const params = await searchParams;
  const theme = await getTheme();

  return (
    <main className="login-screen" data-theme={theme === "system" ? undefined : theme}>
      <section className="login-card">
        <div className="logo-mark">↗</div>
        <p className="eyebrow">COLUMBIA · PROMPT WORKSHOP</p>
        <h1>Build a better chain of thought.</h1>
        <p className="login-copy">Design multi-step prompts, tune each step, and run the whole chain on an image.</p>
        <div className="pipeline-preview" aria-label="Describe, refine, and generate">
          <span><b>01</b> Describe</span>
          <i aria-hidden="true" />
          <span><b>02</b> Refine</span>
          <i aria-hidden="true" />
          <span><b>03</b> Generate</span>
        </div>
        <GoogleSignInButton />
        <ThemeControl initialTheme={theme} />
        {params.error === "configuration" ? <p className="error-message">Configure Supabase environment variables before signing in.</p> : null}
        {params.error === "callback" ? <p className="error-message">Google sign-in did not complete. Check the Supabase redirect URL configuration.</p> : null}
        {params.reason === "google" ? <p className="error-message">Sign in with the Google account enabled for this tool.</p> : null}
        <p className="public-link">Looking for the public caption app? <Link href={process.env.NEXT_PUBLIC_CAPTION_SITE_URL || "http://localhost:3000"}>Go to caption creation and ratings ↗</Link></p>
        <p className="login-foot">SUPERADMIN ACCESS ONLY · GOOGLE SIGN-IN REQUIRED</p>
      </section>
    </main>
  );
}
