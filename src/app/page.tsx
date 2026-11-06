import Link from "next/link";
import { requireSuperadmin } from "@/lib/admin";
import { getTheme } from "@/lib/theme";
import type { PromptChain } from "@/lib/database";
import { createChain, signOut } from "./actions";
import { ThemeControl } from "./theme-control";

export const dynamic = "force-dynamic";

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ notice?: string }>;
}) {
  const { supabase, user, isAdmin } = await requireSuperadmin();
  const theme = await getTheme();
  if (!isAdmin) {
    return (
      <main className="screen denied-screen" data-theme={theme === "system" ? undefined : theme}>
        <section className="login-card">
          <div className="logo-mark">↗</div>
          <p className="eyebrow">ACCESS RESTRICTED</p>
          <h1>This workshop is for superadmins.</h1>
          <p className="muted">Ask a project owner to grant this Google account `profiles.is_superadmin = true`.</p>
          <ThemeControl initialTheme={theme} />
          <a className="public-link" href={process.env.NEXT_PUBLIC_CAPTION_SITE_URL || "http://localhost:3000"}>Visit the public caption app ↗</a>
          <form action={signOut}><button className="secondary-button" type="submit">Sign out</button></form>
        </section>
      </main>
    );
  }

  const [{ data: chainsData, error: chainsError }, { count: requestCount, error: requestsError }] = await Promise.all([
    supabase.from("prompt_chains").select("*").order("updated_at", { ascending: false }).limit(100),
    supabase.from("generation_requests").select("id", { count: "exact", head: true }),
  ]);
  if (chainsError) throw new Error(`Could not load prompt chains: ${chainsError.message}`);
  if (requestsError) throw new Error(`Could not count generation requests: ${requestsError.message}`);
  const chains = (chainsData ?? []) as PromptChain[];
  const notice = (await searchParams).notice;

  return (
    <main className="app-shell" data-theme={theme === "system" ? undefined : theme}>
      <header className="topbar">
        <Link className="wordmark" href="/"><span className="logo-mark">↗</span><span>Chainlab <small>Columbia prompt workshop</small></span></Link>
        <div className="topbar-actions">
          <ThemeControl initialTheme={theme} />
          <span className="account">{user.email ?? "Superadmin"}</span>
          <form action={signOut}><button className="quiet-button" type="submit">Sign out</button></form>
        </div>
      </header>
      <div className="workspace">
        <section className="hero">
          <div>
            <p className="eyebrow">PROMPT ENGINEERING · MULTI-STEP GENERATION</p>
            <h1>Small steps.<br /><em>Better outputs.</em></h1>
            <p className="hero-copy">Build a prompt chain, tune every step, then run it on an image and inspect the results.</p>
          </div>
          <div className="hero-stats"><strong>{chains.length.toString().padStart(2, "0")}</strong><span>prompt chains</span><strong>{(requestCount ?? 0).toString().padStart(2, "0")}</strong><span>total runs</span></div>
        </section>

        {notice === "chain-deleted" ? <p className="notice" role="status">Prompt chain deleted.</p> : null}
        <section className="panel create-chain-panel">
          <div><p className="eyebrow">START A NEW WORKFLOW</p><h2>New prompt chain</h2><p className="muted">A chain runs each step in order. The first step can see your image; later steps receive the previous step&apos;s text output.</p></div>
          <form action={createChain} className="chain-create-form">
            <label>Chain name<input name="name" maxLength={120} required placeholder="Campus comedy captions" /></label>
            <label>Description<input name="description" maxLength={1000} placeholder="What should this workflow produce?" /></label>
            <button className="primary-button" type="submit">Create chain <span>↗</span></button>
          </form>
        </section>

        <section className="chain-list-section">
          <div className="section-title"><div><p className="eyebrow">YOUR WORKFLOWS</p><h2>Prompt chains</h2></div><span>{chains.length} total</span></div>
          {chains.length ? <div className="chain-grid">
            {chains.map((chain) => <Link className="chain-card" href={`/chains/${chain.id}`} key={chain.id}>
              <div className="chain-card-top"><span className={`status-dot ${chain.is_active ? "active" : ""}`} />{chain.is_active ? "ACTIVE" : "PAUSED"}<span className="arrow">↗</span></div>
              <h3>{chain.name}</h3>
              <p>{chain.description || "No description yet. Open the chain to add steps."}</p>
              <span className="chain-card-bottom">EDIT WORKFLOW <span>→</span></span>
            </Link>)}
          </div> : <div className="empty-panel"><span>01</span><p>No chains yet. Create one above and give your first prompt a job.</p></div>}
        </section>
        <footer className="page-footer"><span>CHAINLAB · COLUMBIA PROMPT WORKSHOP</span><span>MAKE THE STEPS DO THE WORK</span></footer>
      </div>
    </main>
  );
}
