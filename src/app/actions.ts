"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireSuperadminAction } from "@/lib/admin";
import { createSupabaseServerClient } from "@/lib/supabase";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function signOut() {
  const supabase = await createSupabaseServerClient();
  if (!supabase) throw new Error("Supabase is not configured.");
  const { error } = await supabase.auth.signOut();
  if (error) throw new Error(`Could not sign out: ${error.message}`);
  redirect("/login");
}

function text(formData: FormData, key: string, maximum: number, required?: true): string;
function text(formData: FormData, key: string, maximum: number, required?: false): string | null;
function text(formData: FormData, key: string, maximum: number, required = true): string | null {
  const value = formData.get(key);
  if (typeof value !== "string") throw new Error(`${key} is required.`);
  const result = value.trim();
  if ((required && !result) || result.length > maximum) {
    throw new Error(`${key} must be ${required ? "non-empty and " : ""}no more than ${maximum} characters.`);
  }
  return result || null;
}

function recordId(formData: FormData, key: string) {
  const value = text(formData, key, 36);
  if (!value || !uuidPattern.test(value)) throw new Error(`Choose a valid ${key.replaceAll("_", " ")}.`);
  return value;
}

export async function createChain(formData: FormData) {
  const { supabase } = await requireSuperadminAction();
  const name = text(formData, "name", 120);
  const description = text(formData, "description", 1000, false);
  const { data, error } = await supabase
    .from("prompt_chains")
    .insert({ name, description })
    .select("id")
    .single();
  if (error) throw new Error(`Could not create prompt chain: ${error.message}`);
  revalidatePath("/");
  redirect(`/chains/${data.id}`);
}

export async function updateChain(formData: FormData) {
  const { supabase } = await requireSuperadminAction();
  const id = recordId(formData, "chain_id");
  const name = text(formData, "name", 120);
  const description = text(formData, "description", 1000, false);
  const isActive = formData.get("is_active");
  if (isActive !== "true" && isActive !== "false") throw new Error("Choose whether the chain is active.");
  const { error } = await supabase
    .from("prompt_chains")
    .update({ name, description, is_active: isActive === "true" })
    .eq("id", id);
  if (error) throw new Error(`Could not update prompt chain: ${error.message}`);
  revalidatePath("/");
  revalidatePath(`/chains/${id}`);
  redirect(`/chains/${id}?notice=chain-updated`);
}

export async function deleteChain(formData: FormData) {
  const { supabase } = await requireSuperadminAction();
  const id = recordId(formData, "chain_id");
  const confirmName = text(formData, "confirm_name", 120);
  const { data: chain, error: lookupError } = await supabase
    .from("prompt_chains")
    .select("name")
    .eq("id", id)
    .single();
  if (lookupError) throw new Error(`Could not load prompt chain: ${lookupError.message}`);
  if (confirmName !== chain.name) throw new Error("Type the chain name exactly to confirm deletion.");
  const { error } = await supabase.from("prompt_chains").delete().eq("id", id);
  if (error) throw new Error(`Could not delete prompt chain: ${error.message}`);
  revalidatePath("/");
  redirect("/?notice=chain-deleted");
}

export async function createStep(formData: FormData) {
  const { supabase } = await requireSuperadminAction();
  const chainId = recordId(formData, "chain_id");
  const name = text(formData, "name", 120);
  const systemPrompt = text(formData, "system_prompt", 10000);
  const userPromptTemplate = text(formData, "user_prompt_template", 10000);
  const [{ data: lastStep, error: orderError }, { count, error: countError }] = await Promise.all([
    supabase
      .from("prompt_chain_steps")
      .select("step_order")
      .eq("chain_id", chainId)
      .order("step_order", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase.from("prompt_chain_steps").select("id", { count: "exact", head: true }).eq("chain_id", chainId),
  ]);
  if (orderError) throw new Error(`Could not determine step order: ${orderError.message}`);
  if (countError) throw new Error(`Could not count prompt steps: ${countError.message}`);
  if ((count ?? 0) >= 12) throw new Error("Prompt chains can contain no more than 12 steps.");
  const { error } = await supabase.from("prompt_chain_steps").insert({
    chain_id: chainId,
    step_order: (lastStep?.step_order ?? 0) + 1,
    name,
    system_prompt: systemPrompt,
    user_prompt_template: userPromptTemplate,
  });
  if (error) throw new Error(`Could not create prompt step: ${error.message}`);
  revalidatePath(`/chains/${chainId}`);
  redirect(`/chains/${chainId}?notice=step-created`);
}

export async function updateStep(formData: FormData) {
  const { supabase } = await requireSuperadminAction();
  const id = recordId(formData, "step_id");
  const chainId = recordId(formData, "chain_id");
  const name = text(formData, "name", 120);
  const systemPrompt = text(formData, "system_prompt", 10000);
  const userPromptTemplate = text(formData, "user_prompt_template", 10000);
  const { error } = await supabase.from("prompt_chain_steps").update({
    name: name!,
    system_prompt: systemPrompt!,
    user_prompt_template: userPromptTemplate!,
  }).eq("id", id).eq("chain_id", chainId);
  if (error) throw new Error(`Could not update prompt step: ${error.message}`);
  revalidatePath(`/chains/${chainId}`);
  redirect(`/chains/${chainId}?notice=step-updated`);
}

export async function deleteStep(formData: FormData) {
  const { supabase } = await requireSuperadminAction();
  const id = recordId(formData, "step_id");
  const chainId = recordId(formData, "chain_id");
  const { error } = await supabase.from("prompt_chain_steps").delete().eq("id", id).eq("chain_id", chainId);
  if (error) throw new Error(`Could not delete prompt step: ${error.message}`);
  revalidatePath(`/chains/${chainId}`);
  redirect(`/chains/${chainId}?notice=step-deleted`);
}

export async function moveStep(formData: FormData) {
  const { supabase } = await requireSuperadminAction();
  const id = recordId(formData, "step_id");
  const rawDirection = formData.get("direction");
  if (rawDirection !== "1" && rawDirection !== "-1") throw new Error("Choose a valid step direction.");
  const { data: moved, error } = await supabase.rpc("move_prompt_chain_step", {
    target_step_id: id,
    direction: Number(rawDirection),
  });
  if (error) throw new Error(`Could not reorder prompt step: ${error.message}`);
  const { data: step, error: lookupError } = await supabase
    .from("prompt_chain_steps")
    .select("chain_id")
    .eq("id", id)
    .maybeSingle();
  if (lookupError) throw new Error(`Could not reload prompt step: ${lookupError.message}`);
  if (!step) throw new Error("Prompt step no longer exists.");
  revalidatePath(`/chains/${step.chain_id}`);
  redirect(`/chains/${step.chain_id}?notice=${moved ? "step-moved" : "step-boundary"}`);
}
