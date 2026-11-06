import { requireSuperadminAction } from "@/lib/admin";

const allowedImageTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
const maxImageSize = 4 * 1024 * 1024;
const maxChainSteps = 12;
const maxStoredCaptionLength = 500;

type OpenAIResult = {
  content: string;
  promptTokens: number | null;
  completionTokens: number | null;
};

export async function POST(request: Request) {
  const { supabase, user } = await requireSuperadminAction();
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return Response.json({ error: "Caption generation is not configured. Add OPENAI_API_KEY." }, { status: 503 });

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return Response.json({ error: "Could not read the image upload. Please try again with a supported image." }, { status: 400 });
  }
  const chainId = String(formData.get("chain_id") ?? "");
  const photo = formData.get("photo");
  const rawContext = formData.get("context");
  if (rawContext !== null && typeof rawContext !== "string") {
    return Response.json({ error: "Context must be text." }, { status: 400 });
  }
  const context = (rawContext ?? "").trim();

  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(chainId)) {
    return Response.json({ error: "Choose a valid prompt chain." }, { status: 400 });
  }
  if (!(photo instanceof File) || !allowedImageTypes.has(photo.type) || photo.size === 0 || photo.size > maxImageSize) {
    return Response.json({ error: "Choose a JPEG, PNG, or WebP image no larger than 4 MB." }, { status: 400 });
  }
  if (context.length > maxStoredCaptionLength) {
    return Response.json({ error: `Context must be no more than ${maxStoredCaptionLength} characters.` }, { status: 400 });
  }

  const { data: chain, error: chainError } = await supabase
    .from("prompt_chains")
    .select("id, name, is_active")
    .eq("id", chainId)
    .single();
  if (chainError) throw new Error(`Could not load prompt chain: ${chainError.message}`);
  if (!chain.is_active) return Response.json({ error: "This prompt chain is inactive." }, { status: 409 });

  const { data: steps, error: stepsError } = await supabase
    .from("prompt_chain_steps")
    .select("id, step_order, name, system_prompt, user_prompt_template")
    .eq("chain_id", chainId)
    .order("step_order", { ascending: true })
    .limit(maxChainSteps + 1);
  if (stepsError) throw new Error(`Could not load prompt-chain steps: ${stepsError.message}`);
  if (!steps?.length) return Response.json({ error: "Add at least one step before running this chain." }, { status: 400 });
  if (steps.length > maxChainSteps) return Response.json({ error: `Chains can contain no more than ${maxChainSteps} steps.` }, { status: 400 });

  const { data: run, error: runError } = await supabase
    .from("generation_requests")
    .insert({
      user_id: user.id,
      prompt: context || `Run prompt chain: ${chain.name}`,
      prompt_chain_id: chain.id,
      status: "pending",
    })
    .select("id")
    .single();
  if (runError) throw new Error(`Could not create generation request: ${runError.message}`);

  const imageBase64 = Buffer.from(await photo.arrayBuffer()).toString("base64");
  const model = process.env.OPENAI_MODEL ?? "gpt-4o-mini";
  let previousOutput = context || "Analyze the uploaded image according to this step's instructions.";

  for (const [index, step] of steps.entries()) {
    const template = step.user_prompt_template;
    const inputText = template.includes("{{input}}")
      ? template.replaceAll("{{input}}", previousOutput)
      : `${template}\n\n${previousOutput}`;
    const userContent = index === 0
      ? [
          { type: "text" as const, text: inputText },
          { type: "image_url" as const, image_url: { url: `data:${photo.type};base64,${imageBase64}` } },
        ]
      : inputText;

    let result: OpenAIResult;
    try {
      const systemPrompt = index === steps.length - 1
        ? `${step.system_prompt}\n\nKeep the complete final output within ${maxStoredCaptionLength} characters.`
        : step.system_prompt;
      result = await runOpenAIStep(apiKey, model, systemPrompt, userContent);
    } catch (error) {
      const message = error instanceof Error ? error.message : "The model request failed.";
      await markRunFailed(supabase, run.id, message);
      return Response.json({ error: `Step ${index + 1} (${step.name}) failed: ${message}` }, { status: 502 });
    }

    const { error: responseError } = await supabase.from("llm_responses").insert({
      generation_request_id: run.id,
      prompt_chain_step_id: step.id,
      prompt_chain_step_name: step.name,
      prompt_chain_step_order: step.step_order,
      response_text: result.content,
      prompt_tokens: result.promptTokens,
      completion_tokens: result.completionTokens,
    });
    if (responseError) {
      await markRunFailed(supabase, run.id, responseError.message);
      throw new Error(`Step ${index + 1} ran, but its response could not be saved: ${responseError.message}`);
    }
    previousOutput = result.content;
  }

  if (previousOutput.length > maxStoredCaptionLength) {
    const message = `The chain completed, but its final output is ${previousOutput.length} characters. Generated captions can be at most ${maxStoredCaptionLength} characters. Shorten the final step instructions and run it again.`;
    await markRunFailed(supabase, run.id, message);
    return Response.json({ error: message }, { status: 422 });
  }

  const extension = photo.type === "image/png" ? "png" : photo.type === "image/webp" ? "webp" : "jpg";
  const photoPath = `${user.id}/${crypto.randomUUID()}.${extension}`;
  const { error: uploadError } = await supabase.storage
    .from("generation-photos")
    .upload(photoPath, photo, { contentType: photo.type, upsert: false });
  if (uploadError) {
    await markRunFailed(supabase, run.id, uploadError.message);
    return Response.json({ error: `The chain completed, but its image could not be saved: ${uploadError.message}` }, { status: 500 });
  }

  const { data: generation, error: generationError } = await supabase
    .from("generations")
    .insert({
      user_id: user.id,
      photo_path: photoPath,
      prompt: context || `Generated with ${chain.name}`,
      caption: previousOutput,
      prompt_chain_id: chain.id,
    })
    .select("id")
    .single();
  if (generationError) {
    const { error: cleanupError } = await supabase.storage.from("generation-photos").remove([photoPath]);
    if (cleanupError) console.error("Could not remove uploaded image after generation insert failed", cleanupError);
    await markRunFailed(supabase, run.id, generationError.message);
    return Response.json({ error: `The chain completed, but generated media could not be saved: ${generationError.message}` }, { status: 500 });
  }

  const { error: completeError } = await supabase
    .from("generation_requests")
    .update({ status: "completed", completed_at: new Date().toISOString() })
    .eq("id", run.id);
  if (completeError) throw new Error(`Media was saved, but the generation request could not be marked complete: ${completeError.message}`);

  return Response.json({ generation_id: generation.id, output: previousOutput });
}

async function runOpenAIStep(
  apiKey: string,
  model: string,
  systemPrompt: string,
  userContent: string | Array<{ type: "text" | "image_url"; text?: string; image_url?: { url: string } }>,
): Promise<OpenAIResult> {
  let response: Response;
  try {
    response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userContent },
        ],
      }),
      signal: AbortSignal.timeout(90_000),
    });
  } catch (error) {
    throw new Error(error instanceof Error ? `Could not reach the model provider: ${error.message}` : "Could not reach the model provider.");
  }

  let result: unknown;
  try {
    result = await response.json();
  } catch {
    throw new Error("Model provider returned an unreadable response.");
  }
  if (!response.ok) {
    throw new Error(readOpenAIError(result) ?? `Model provider returned HTTP ${response.status}.`);
  }
  if (!result || typeof result !== "object") throw new Error("Model provider returned an invalid response.");
  const choices = (result as { choices?: unknown }).choices;
  if (!Array.isArray(choices) || !choices[0] || typeof choices[0] !== "object") {
    throw new Error("Model provider returned no output.");
  }
  const message = (choices[0] as { message?: unknown }).message;
  if (!message || typeof message !== "object" || typeof (message as { content?: unknown }).content !== "string") {
    throw new Error("Model provider returned an invalid output.");
  }
  const usage = (result as { usage?: { prompt_tokens?: unknown; completion_tokens?: unknown } }).usage;
  return {
    content: (message as { content: string }).content.trim(),
    promptTokens: typeof usage?.prompt_tokens === "number" ? usage.prompt_tokens : null,
    completionTokens: typeof usage?.completion_tokens === "number" ? usage.completion_tokens : null,
  };
}

function readOpenAIError(value: unknown) {
  if (!value || typeof value !== "object") return null;
  const error = (value as { error?: unknown }).error;
  if (!error || typeof error !== "object") return null;
  const message = (error as { message?: unknown }).message;
  return typeof message === "string" ? message : null;
}

async function markRunFailed(
  supabase: Awaited<ReturnType<typeof requireSuperadminAction>>["supabase"],
  runId: string,
  detail: string,
) {
  const { error } = await supabase
    .from("generation_requests")
    .update({ status: "failed", completed_at: new Date().toISOString() })
    .eq("id", runId);
  if (error) console.error("Could not mark prompt-chain run as failed", { runId, detail, error });
}
