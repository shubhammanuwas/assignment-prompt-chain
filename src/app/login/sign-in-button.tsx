"use client";

import { useState } from "react";
import { createBrowserClient } from "@supabase/ssr";

export function GoogleSignInButton() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function signIn() {
    setPending(true);
    setError("");
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key =
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) {
      setError("Configure the Supabase URL and publishable key.");
      setPending(false);
      return;
    }

    const supabase = createBrowserClient(url, key);
    const { error: authError } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
        queryParams: { prompt: "select_account" },
      },
    });
    if (authError) {
      setError(authError.message);
      setPending(false);
    }
  }

  return (
    <div className="signin-block">
      <button className="primary-button" type="button" onClick={signIn} disabled={pending}>
        {pending ? "Opening Google..." : "Continue with Google"}
      </button>
      {error ? <p className="error-message" role="alert">{error}</p> : null}
    </div>
  );
}
