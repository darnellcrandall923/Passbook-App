-- Passbook database schema
-- Run this in your Supabase project's SQL Editor (Dashboard → SQL Editor → New query)
-- before connecting the app. Safe to re-run: uses "if not exists" / "or replace".

create table if not exists public.user_data (
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  key text not null,
  value jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (user_id, key)
);

alter table public.user_data enable row level security;

drop policy if exists "select own data" on public.user_data;
create policy "select own data"
  on public.user_data for select
  using (auth.uid() = user_id);

drop policy if exists "insert own data" on public.user_data;
create policy "insert own data"
  on public.user_data for insert
  with check (auth.uid() = user_id);

drop policy if exists "update own data" on public.user_data;
create policy "update own data"
  on public.user_data for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "delete own data" on public.user_data;
create policy "delete own data"
  on public.user_data for delete
  using (auth.uid() = user_id);

create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists user_data_set_updated_at on public.user_data;
create trigger user_data_set_updated_at
before update on public.user_data
for each row execute function public.set_updated_at();
