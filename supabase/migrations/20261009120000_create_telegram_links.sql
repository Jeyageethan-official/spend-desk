-- Server-side Telegram account links + single-use linking tokens for the
-- deep-link connection flow (Connect Telegram -> t.me/<bot>?start=<token>).
-- Linking is performed ONLY by the Telegram webhook edge function (service role);
-- users can read/update/delete their own link but never see other users' chats.

create table if not exists public.telegram_links (
  user_id uuid primary key references auth.users(id) on delete cascade,
  chat_id text not null unique,
  alerts_enabled boolean not null default true,
  linked_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.telegram_link_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  -- SHA-256 of the linking token; the plaintext token only ever exists in the
  -- deep link opened by the user who requested it.
  token_hash text not null unique,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_at timestamptz,
  linked_chat_id text
);

create index if not exists telegram_link_tokens_user_active_idx
  on public.telegram_link_tokens (user_id, used_at, expires_at);

alter table public.telegram_links enable row level security;
alter table public.telegram_link_tokens enable row level security;

-- Users can read only their own link (never another user's chat ID).
drop policy if exists "Users can read own telegram link" on public.telegram_links;
create policy "Users can read own telegram link"
  on public.telegram_links for select
  to authenticated
  using (auth.uid() = user_id);

-- Users can toggle their own alerts preference; linking/deleting happen server-side.
drop policy if exists "Users can update own telegram link" on public.telegram_links;
create policy "Users can update own telegram link"
  on public.telegram_links for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users can delete own telegram link" on public.telegram_links;
create policy "Users can delete own telegram link"
  on public.telegram_links for delete
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Users can create own link tokens" on public.telegram_link_tokens;
create policy "Users can create own link tokens"
  on public.telegram_link_tokens for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "Users can read own link tokens" on public.telegram_link_tokens;
create policy "Users can read own link tokens"
  on public.telegram_link_tokens for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Users can delete own link tokens" on public.telegram_link_tokens;
create policy "Users can delete own link tokens"
  on public.telegram_link_tokens for delete
  to authenticated
  using (auth.uid() = user_id);

-- Rate limiting + replay protection enforced at the database layer (applies even
-- to direct writes with the anon key): min interval between linking requests and
-- a hard cap on still-active tokens per user.
create or replace function public.enforce_telegram_token_limits()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (
    select 1 from public.telegram_link_tokens t
    where t.user_id = new.user_id
      and t.created_at > now() - interval '15 seconds'
  ) then
    raise exception 'Too many linking requests. Wait a few seconds and try again.';
  end if;

  delete from public.telegram_link_tokens t
  where t.user_id = new.user_id
    and t.used_at is null
    and t.id not in (
      select k.id from public.telegram_link_tokens k
      where k.user_id = new.user_id and k.used_at is null
      order by k.created_at desc
      limit 2
    );

  return new;
end;
$$;

drop trigger if exists telegram_link_tokens_limits on public.telegram_link_tokens;
create trigger telegram_link_tokens_limits
  before insert on public.telegram_link_tokens
  for each row execute function public.enforce_telegram_token_limits();
