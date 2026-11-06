alter table public.generation_requests
  add column if not exists prompt_chain_id uuid
    references public.prompt_chains(id) on delete set null;

alter table public.generations
  add column if not exists prompt_chain_id uuid
    references public.prompt_chains(id) on delete set null;

alter table public.llm_responses
  add column if not exists prompt_chain_step_id uuid
    references public.prompt_chain_steps(id) on delete set null,
  add column if not exists prompt_chain_step_name text,
  add column if not exists prompt_chain_step_order integer;

create index if not exists generation_requests_prompt_chain_id_created_at_idx
  on public.generation_requests (prompt_chain_id, created_at desc);
create index if not exists generations_prompt_chain_id_created_at_idx
  on public.generations (prompt_chain_id, created_at desc);
create index if not exists llm_responses_generation_request_id_created_at_idx
  on public.llm_responses (generation_request_id, created_at);

grant select, insert, update, delete on public.prompt_chains, public.prompt_chain_steps
  to authenticated;
grant select, insert, update on public.generation_requests to authenticated;
grant select, insert on public.llm_responses to authenticated;
grant select, insert on public.generations to authenticated;

drop policy if exists "Superadmins can read prompt chains" on public.prompt_chains;
drop policy if exists "Superadmins can manage prompt chains" on public.prompt_chains;
create policy "Superadmins can manage prompt chains"
on public.prompt_chains for all to authenticated
using ((select public.is_current_user_superadmin()))
with check ((select public.is_current_user_superadmin()));

drop policy if exists "Superadmins can read prompt chain steps" on public.prompt_chain_steps;
drop policy if exists "Superadmins can manage prompt chain steps" on public.prompt_chain_steps;
create policy "Superadmins can manage prompt chain steps"
on public.prompt_chain_steps for all to authenticated
using ((select public.is_current_user_superadmin()))
with check ((select public.is_current_user_superadmin()));

drop policy if exists "Superadmins can read generation requests" on public.generation_requests;
create policy "Superadmins can read generation requests"
on public.generation_requests for select to authenticated
using ((select public.is_current_user_superadmin()));

drop policy if exists "Superadmins can create generation requests" on public.generation_requests;
create policy "Superadmins can create generation requests"
on public.generation_requests for insert to authenticated
with check (
  (select public.is_current_user_superadmin())
  and user_id = (select auth.uid())
);

drop policy if exists "Superadmins can update generation requests" on public.generation_requests;
create policy "Superadmins can update generation requests"
on public.generation_requests for update to authenticated
using ((select public.is_current_user_superadmin()))
with check (
  (select public.is_current_user_superadmin())
  and user_id = (select auth.uid())
);

drop policy if exists "Superadmins can read LLM responses" on public.llm_responses;
create policy "Superadmins can read LLM responses"
on public.llm_responses for select to authenticated
using ((select public.is_current_user_superadmin()));

drop policy if exists "Superadmins can create LLM responses" on public.llm_responses;
create policy "Superadmins can create LLM responses"
on public.llm_responses for insert to authenticated
with check ((select public.is_current_user_superadmin()));

drop policy if exists "Superadmins can read generated media" on public.generations;
create policy "Superadmins can read generated media"
on public.generations for select to authenticated
using ((select public.is_current_user_superadmin()));

create or replace function public.move_prompt_chain_step(
  target_step_id uuid,
  direction integer
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_chain_id uuid;
  target_order integer;
  neighbor_id uuid;
  neighbor_order integer;
  temporary_order integer;
begin
  if direction not in (-1, 1) then
    raise exception 'Direction must be -1 or 1.'
      using errcode = '22023';
  end if;

  if not public.is_current_user_superadmin() then
    raise exception 'Only superadmins can reorder prompt steps.'
      using errcode = '42501';
  end if;

  select step.chain_id
  into target_chain_id
  from public.prompt_chain_steps as step
  where step.id = target_step_id;

  if not found then
    raise exception 'Prompt step not found.'
      using errcode = 'P0002';
  end if;

  perform chain.id
  from public.prompt_chains as chain
  where chain.id = target_chain_id
  for update;

  select step.step_order
  into target_order
  from public.prompt_chain_steps as step
  where step.id = target_step_id
    and step.chain_id = target_chain_id
  for update;

  if not found then
    raise exception 'Prompt step no longer exists.'
      using errcode = 'P0002';
  end if;

  if direction = -1 then
    select step.id, step.step_order
    into neighbor_id, neighbor_order
    from public.prompt_chain_steps as step
    where step.chain_id = target_chain_id
      and step.step_order < target_order
    order by step.step_order desc
    limit 1
    for update;
  else
    select step.id, step.step_order
    into neighbor_id, neighbor_order
    from public.prompt_chain_steps as step
    where step.chain_id = target_chain_id
      and step.step_order > target_order
    order by step.step_order
    limit 1
    for update;
  end if;

  if not found then
    return false;
  end if;

  select coalesce(max(step.step_order), 0) + 1
  into temporary_order
  from public.prompt_chain_steps as step
  where step.chain_id = target_chain_id;

  update public.prompt_chain_steps
  set step_order = temporary_order
  where id = target_step_id;

  update public.prompt_chain_steps
  set step_order = target_order
  where id = neighbor_id;

  update public.prompt_chain_steps
  set step_order = neighbor_order
  where id = target_step_id;

  return true;
end;
$$;

revoke all on function public.move_prompt_chain_step(uuid, integer) from public;
grant execute on function public.move_prompt_chain_step(uuid, integer) to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'generation-photos',
  'generation-photos',
  false,
  4194304,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do nothing;

drop policy if exists "Superadmins can read generation photos" on storage.objects;
create policy "Superadmins can read generation photos"
on storage.objects for select to authenticated
using (
  bucket_id = 'generation-photos'
  and (select public.is_current_user_superadmin())
);

drop policy if exists "Superadmins can upload generation photos" on storage.objects;
create policy "Superadmins can upload generation photos"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'generation-photos'
  and (select public.is_current_user_superadmin())
);

drop policy if exists "Superadmins can delete generation photos" on storage.objects;
create policy "Superadmins can delete generation photos"
on storage.objects for delete to authenticated
using (
  bucket_id = 'generation-photos'
  and (select public.is_current_user_superadmin())
);

notify pgrst, 'reload schema';
