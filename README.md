# Columbia Prompt Chain Tool

A separate, superadmin-only Next.js application for building multi-step prompt chains, running them on an image, and reviewing the step outputs and generated caption media.

## What it does

- Requires Google sign-in and `profiles.is_superadmin = true` for every management or generation operation.
- Creates, reads, edits, and deletes prompt chains and their steps.
- Reorders steps with up/down controls; each chain supports up to 12 steps.
- Runs steps sequentially: step 1 receives the uploaded image, and each later step receives the previous text output. Use `{{input}}` in a user template to place that output.
- Saves run status, each step response, the uploaded source image, and final caption media in Supabase.
- Keeps the optional run context and final generated caption within the shared database's 500-character limit.
- Shows recent runs and the media produced by the selected chain.
- Supports system, light, and dark appearance.

## Prerequisites

- Node.js 22 or newer and npm.
- The Supabase project already used by the Columbia caption/admin applications, with the schema in `assignment-Admin/supabase/admin.sql` applied.
- Google OAuth enabled in Supabase Authentication.
- An OpenAI API key with access to the configured model.

## Configure Supabase

1. In Supabase SQL Editor, run `assignment-Admin/supabase/admin.sql` first if the shared admin schema and `is_current_user_superadmin()` function are not already installed.
2. Run [`supabase/migrations/20261102100000_prompt_chain_tool.sql`](./supabase/migrations/20261102100000_prompt_chain_tool.sql). This adds chain links for requests/media, per-step response labels, superadmin-only policies, image storage settings, and the step-reordering RPC.
3. In **Authentication → URL Configuration**, set the site's URL and add these redirect URLs:
   - `http://localhost:3000/auth/callback`
   - `https://YOUR-VERCEL-DOMAIN/auth/callback`
4. In **Authentication → Providers**, enable Google OAuth and configure its Google client credentials.
5. In **Table Editor → profiles**, set `is_superadmin` to `true` for the Google-authenticated profile that should manage chains.

The migration deliberately uses the existing `profiles.is_superadmin` flag and Supabase project. Do not put a Supabase service-role key or OpenAI key in any `NEXT_PUBLIC_` variable.

### Troubleshooting: creating a chain is denied by row-level security

If creating a chain reports `new row violates row-level security policy for table "prompt_chains"`, the Supabase project connected in `.env.local` likely has the shared admin schema but not this app's migration. In the SQL Editor for that same Supabase project, run [`supabase/migrations/20261102100000_prompt_chain_tool.sql`](./supabase/migrations/20261102100000_prompt_chain_tool.sql), then reload the app and try again. The migration grants authenticated superadmins permission to manage prompt chains and steps; do not disable row-level security or use a service-role key in the app.

## Run locally

```bash
npm install
cp .env.example .env.local
```

Set the following values in `.env.local`:

| Variable | Required | Description |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Yes | Supabase publishable key (legacy anon key is also accepted) |
| `OPENAI_API_KEY` | Yes to run chains | Server-only OpenAI API key |
| `OPENAI_MODEL` | No | Chat-completions model; defaults to `gpt-4o-mini` |
| `NEXT_PUBLIC_CAPTION_SITE_URL` | No | Public caption app link shown to people without superadmin access |

Then run:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Create a chain, add one or more steps, activate it, and upload a JPEG, PNG, or WebP image (maximum 4 MB) to run it.

## Deploy as a separate Vercel app

1. Create a separate GitHub repository for this directory and push this project to it. Do not add it to either existing application repository.
2. In Vercel, import the new repository as a new project. Use the root directory `/` and the standard Next.js build settings.
3. Add `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, and `OPENAI_API_KEY` to the Vercel project's Production (and Preview, if desired) environment variables. Set `OPENAI_MODEL` and `NEXT_PUBLIC_CAPTION_SITE_URL` as needed.
4. Add the final Vercel domain plus `/auth/callback` to the Supabase redirect allowlist, and set that domain as the Supabase site URL.
5. Turn off Vercel **Deployment Protection** for the project so the deployment can be opened in an Incognito window. The application itself remains protected by Google authentication and the superadmin check.
6. Deploy, visit the commit-specific deployment URL, and verify login, chain/step CRUD and reordering, a complete image run, run history, and the chain media gallery.

## Useful commands

```bash
npm run lint
npm run typecheck
npm run build
```
