import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSuperadmin } from "@/lib/admin";
import { getTheme } from "@/lib/theme";
import type { Generation, GenerationRequest, PromptChain, PromptChainStep } from "@/lib/database";
import { createStep, deleteChain, deleteStep, signOut, updateChain, updateStep, moveStep } from "@/app/actions";
import { ThemeControl } from "@/app/theme-control";
import { GenerateRunForm } from "./run-form";

export const dynamic = "force-dynamic";

function friendlyNotice(notice?: string) {
  if (notice === "chain-updated") return "Prompt chain saved.";
  if (notice === "step-created") return "Step added.";
  if (notice === "step-updated") return "Step saved.";
  if (notice === "step-deleted") return "Step deleted.";
  if (notice === "step-moved") return "Step order updated.";
  if (notice === "step-boundary") return "That step is already at the top or bottom.";
  return null;
}

export default async function ChainPage({
  params,
  searchParams,
}: {
  params: Promise<{ chainId: string }>;
  searchParams: Promise<{ notice?: string }>;
}) {
  const { supabase, user, isAdmin } = await requireSuperadmin();
  if (!isAdmin) {
    return (
      <main className="screen denied-screen">
        <section className="login-card"><p className="eyebrow">ACCESS RESTRICTED</p><h1>Superadmin access required.</h1><a className="public-link" href={process.env.NEXT_PUBLIC_CAPTION_SITE_URL || "http://localhost:3000"}>Visit the public caption app ↗</a><form action={signOut}><button className="secondary-button">Sign out</button></form></section>
      </main>
    );
  }

  const { chainId } = await params;
  const theme = await getTheme();
  const [
    { data: chainData, error: chainError },
    { data: stepsData, error: stepsError },
    { data: mediaData, error: mediaError },
    { data: requestsData, error: requestsError },
  ] = await Promise.all([
    supabase.from("prompt_chains").select("*").eq("id", chainId).maybeSingle(),
    supabase.from("prompt_chain_steps").select("*").eq("chain_id", chainId).order("step_order"),
    supabase.from("generations").select("*").eq("prompt_chain_id", chainId).order("created_at", { ascending: false }).limit(30),
    supabase.from("generation_requests").select("*").eq("prompt_chain_id", chainId).order("created_at", { ascending: false }).limit(20),
  ]);
  if (chainError) throw new Error(`Could not load prompt chain: ${chainError.message}`);
  if (stepsError) throw new Error(`Could not load prompt steps: ${stepsError.message}`);
  if (mediaError) throw new Error(`Could not load generated media: ${mediaError.message}`);
  if (requestsError) throw new Error(`Could not load generation runs: ${requestsError.message}`);
  if (!chainData) notFound();

  const chain = chainData as PromptChain;
  const steps = (stepsData ?? []) as PromptChainStep[];
  const media = (mediaData ?? []) as Generation[];
  const runs = (requestsData ?? []) as GenerationRequest[];
  const mediaWithUrls = await Promise.all(media.map(async (item) => {
    const { data, error } = await supabase.storage
      .from("generation-photos")
      .createSignedUrl(item.photo_path, 60 * 60);
    if (error) throw new Error(`Could not create an image preview URL: ${error.message}`);
    return { item, photoUrl: data.signedUrl };
  }));
  const notice = friendlyNotice((await searchParams).notice);
  const savedSteps = new Map<string, Array<{ name: string | null; order: number | null; text: string }>>();
  const { data: responseRows, error: responseError } = runs.length
    ? await supabase.from("llm_responses").select("generation_request_id, prompt_chain_step_name, prompt_chain_step_order, response_text, created_at").in("generation_request_id", runs.map((run) => run.id)).order("created_at")
    : { data: [], error: null };
  if (responseError) throw new Error(`Could not load step outputs: ${responseError.message}`);
  for (const response of responseRows ?? []) {
    if (!response.generation_request_id) continue;
    const outputs = savedSteps.get(response.generation_request_id) ?? [];
    outputs.push({
      name: response.prompt_chain_step_name,
      order: response.prompt_chain_step_order,
      text: response.response_text,
    });
    savedSteps.set(response.generation_request_id, outputs);
  }

  return (
    <main className="app-shell" data-theme={theme === "system" ? undefined : theme}>
      <header className="topbar">
        <Link className="wordmark" href="/"><span className="logo-mark">↗</span><span>Chainlab <small>Columbia prompt workshop</small></span></Link>
        <div className="topbar-actions"><ThemeControl initialTheme={theme} /><span className="account">{user.email ?? "Superadmin"}</span><form action={signOut}><button className="quiet-button" type="submit">Sign out</button></form></div>
      </header>
      <div className="workspace">
        <Link className="back-link" href="/">← All prompt chains</Link>
        {notice ? <p className="notice" role="status">{notice}</p> : null}
        <section className="chain-hero">
          <div><p className="eyebrow">PROMPT CHAIN · {steps.length} STEP{steps.length === 1 ? "" : "S"}</p><h1>{chain.name}</h1><p className="hero-copy">{chain.description || "No description added."}</p></div>
          <span className={`state-pill ${chain.is_active ? "active" : ""}`}>{chain.is_active ? "ACTIVE" : "PAUSED"}</span>
        </section>

        <section className="panel">
          <div className="section-title"><div><p className="eyebrow">WORKFLOW SETTINGS</p><h2>Edit prompt chain</h2></div></div>
          <form action={updateChain} className="chain-create-form">
            <input type="hidden" name="chain_id" value={chain.id} />
            <label>Chain name<input name="name" defaultValue={chain.name} maxLength={120} required /></label>
            <label>Description<input name="description" defaultValue={chain.description ?? ""} maxLength={1000} /></label>
            <label>Status<select name="is_active" defaultValue={String(chain.is_active)}><option value="true">Active</option><option value="false">Paused</option></select></label>
            <button className="primary-button" type="submit">Save chain</button>
          </form>
          <form action={deleteChain} className="delete-chain-form">
            <input type="hidden" name="chain_id" value={chain.id} />
            <label>Type <strong>{chain.name}</strong> to delete this chain and its steps<input name="confirm_name" maxLength={120} required /></label>
            <button className="danger-button" type="submit">Delete chain</button>
          </form>
        </section>

        <section className="panel steps-panel">
          <div className="section-title"><div><p className="eyebrow">DESIGN THE WORKFLOW</p><h2>Prompt steps</h2><p className="muted">Use <code>{"{{input}}"}</code> in a template to insert the image context or prior step output.</p></div><span>{steps.length} / 12</span></div>
          <div className="step-list">
            {steps.map((step, index) => (
              <article className="step-card" key={step.id}>
                <div className="step-index">{String(index + 1).padStart(2, "0")}</div>
                <form action={updateStep} className="step-form">
                  <input type="hidden" name="step_id" value={step.id} />
                  <input type="hidden" name="chain_id" value={chain.id} />
                  <label>Step name<input name="name" defaultValue={step.name} maxLength={120} required /></label>
                  <label>System instructions<textarea name="system_prompt" defaultValue={step.system_prompt} maxLength={10000} rows={3} required /></label>
                  <label>User template<textarea name="user_prompt_template" defaultValue={step.user_prompt_template} maxLength={10000} rows={2} required /></label>
                  <button className="text-button" type="submit">Save step ↗</button>
                </form>
                <div className="step-tools">
                  <form action={moveStep}><input type="hidden" name="step_id" value={step.id} /><input type="hidden" name="direction" value="-1" /><button className="icon-button" disabled={index === 0} aria-label={`Move ${step.name} up`}>↑</button></form>
                  <form action={moveStep}><input type="hidden" name="step_id" value={step.id} /><input type="hidden" name="direction" value="1" /><button className="icon-button" disabled={index === steps.length - 1} aria-label={`Move ${step.name} down`}>↓</button></form>
                  <form action={deleteStep}><input type="hidden" name="step_id" value={step.id} /><input type="hidden" name="chain_id" value={chain.id} /><button className="icon-button danger-icon" aria-label={`Delete ${step.name}`}>×</button></form>
                </div>
              </article>
            ))}
          </div>
          <form action={createStep} className="new-step-form">
            <input type="hidden" name="chain_id" value={chain.id} />
            <p className="eyebrow">ADD THE NEXT STEP</p>
            <label>Step name<input name="name" maxLength={120} required placeholder="Write the final captions" /></label>
            <label>System instructions<textarea name="system_prompt" maxLength={10000} rows={3} required placeholder="Tell the model what this step should do." /></label>
            <label>User template<textarea name="user_prompt_template" maxLength={10000} rows={2} required defaultValue="{{input}}" /></label>
            <button className="primary-button" type="submit" disabled={steps.length >= 12}>Add step <span>＋</span></button>
            {steps.length >= 12 ? <p className="muted">This tool supports up to 12 steps per run.</p> : null}
          </form>
        </section>

        <section className="panel run-panel">
          <div className="section-title"><div><p className="eyebrow">RUN THE WHOLE CHAIN</p><h2>Generate media</h2><p className="muted">The first step sees the image. Each later step receives the previous output. Keep the final output to 500 characters or fewer to save it as media.</p></div></div>
          <GenerateRunForm chainId={chain.id} active={chain.is_active} />
          <div className="run-history">
            <h3>Recent runs <span>{runs.length}</span></h3>
            {runs.length ? runs.map((run) => (
              <details className="run-item" key={run.id}>
                <summary><span className={`status-dot ${run.status === "completed" ? "active" : ""}`} />{run.status}<time>{new Date(run.created_at).toLocaleString()}</time></summary>
                <p>{run.prompt}</p>
                {savedSteps.get(run.id)?.map((output, index) => (
                  <div className="step-output" key={`${run.id}-${index}`}>
                    <strong>Step {output.order ?? index + 1}: {output.name ?? "Output"}</strong>
                    <pre>{output.text}</pre>
                  </div>
                ))}
              </details>
            )) : <p className="muted">No runs yet. Run the chain to see step outputs here.</p>}
          </div>
        </section>

        <section className="panel media-panel">
          <div className="section-title"><div><p className="eyebrow">GENERATED BY THIS CHAIN</p><h2>Media gallery</h2></div><span>{media.length} latest</span></div>
          {mediaWithUrls.length ? <div className="media-grid">{mediaWithUrls.map(({ item, photoUrl }) => {
            return <article className="media-card" key={item.id}>
              <div className="media-image"><Image src={photoUrl} alt="" fill sizes="(max-width: 760px) 100vw, 350px" unoptimized /></div>
              <div className="media-copy"><time>{new Date(item.created_at).toLocaleString()}</time><p>{item.caption}</p></div>
            </article>;
          })}</div> : <p className="muted empty-message">No media has been generated by this chain yet.</p>}
        </section>
        <footer className="page-footer"><span>CHAINLAB · COLUMBIA PROMPT WORKSHOP</span><span>MAKE THE STEPS DO THE WORK</span></footer>
      </div>
    </main>
  );
}
