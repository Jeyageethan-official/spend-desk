-- Server-held Google offline refresh tokens: the "sign in once, stay
-- connected forever" table. After the initial consent, the browser hands
-- Google's refresh token to this table once; from then on the sheets-token
-- edge function mints fresh Sheets/Drive access tokens server-side, so no
-- Google popup or redirect is EVER needed again on app open or token expiry.
--
-- RLS: one row per authenticated user, readable only by its owner (the edge
-- function queries with the caller's own JWT) and only writable by them.
create table if not exists public.google_refresh_tokens (
  user_id uuid primary key references auth.users(id) on delete cascade,
  refresh_token text not null,
  updated_at timestamptz not null default now()
);

alter table public.google_refresh_tokens enable row level security;

drop policy if exists "Users can read their own google refresh token" on public.google_refresh_tokens;
create policy "Users can read their own google refresh token"
  on public.google_refresh_tokens for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Users can store their own google refresh token" on public.google_refresh_tokens;
create policy "Users can store their own google refresh token"
  on public.google_refresh_tokens for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "Users can update their own google refresh token" on public.google_refresh_tokens;
create policy "Users can update their own google refresh token"
  on public.google_refresh_tokens for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users can delete their own google refresh token" on public.google_refresh_tokens;
create policy "Users can delete their own google refresh token"
  on public.google_refresh_tokens for delete
  to authenticated
  using (auth.uid() = user_id);
