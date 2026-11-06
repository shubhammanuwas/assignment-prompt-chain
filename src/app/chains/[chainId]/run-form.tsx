"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

export function GenerateRunForm({ chainId, active }: { chainId: string; active: boolean }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    setPending(true);
    setMessage("");
    try {
      const body = new FormData(form);
      body.set("chain_id", chainId);
      const response = await fetch("/api/generations", { method: "POST", body });
      const result: unknown = await response.json();
      if (!response.ok) {
        const error = result && typeof result === "object" ? (result as { error?: unknown }).error : null;
        throw new Error(typeof error === "string" ? error : "Generation failed. Please try again.");
      }
      const output = result && typeof result === "object" ? (result as { output?: unknown }).output : null;
      setMessage(typeof output === "string" ? `Chain completed: ${output}` : "Chain completed.");
      form.reset();
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Generation failed. Please try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form className="generate-form" onSubmit={submit}>
      <label>Image<input name="photo" type="file" accept="image/jpeg,image/png,image/webp" required disabled={!active || pending} /><small>JPEG, PNG, or WebP · up to 4 MB</small></label>
      <label>Optional context<textarea name="context" maxLength={500} rows={2} placeholder="Any extra details for the first step? (up to 500 characters)" disabled={!active || pending} /></label>
      <button className="primary-button" type="submit" disabled={!active || pending}>{pending ? "Running steps..." : "Run prompt chain"} <span>↗</span></button>
      {!active ? <p className="muted">Activate this chain before running it.</p> : null}
      {message ? <p className="run-message" role="status">{message}</p> : null}
    </form>
  );
}
