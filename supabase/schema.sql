-- ---------------------------------------------------------------------------
-- GYM TRACKER — Supabase schema
--
-- Run this once in your Supabase project's SQL Editor (Dashboard -> SQL
-- Editor -> New query -> paste this whole file -> Run).
--
-- Design: two tables, both scoped to the signed-in user via Row Level
-- Security. RLS means the database itself refuses to return or accept rows
-- for anyone whose auth.uid() doesn't match — so even though the app's
-- public "anon" key is visible in the browser (that's normal for Supabase),
-- another person's magic-link session could never see your rows.
--
-- `workouts` stores your whole exercise list as one JSON blob per user,
-- mirroring exactly what's already in IndexedDB — no need to normalize it
-- into per-exercise rows for a single-user app.
--
-- `sessions` is one row per logged workout day. Deletes are SOFT (a
-- deleted_at timestamp, not a real DELETE) so that deleting a log on your
-- phone correctly tells your other device to remove it too, instead of the
-- old row silently reappearing on the next sync.
-- ---------------------------------------------------------------------------

create table if not exists workouts (
  user_id uuid primary key references auth.users on delete cascade,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists sessions (
  id text primary key,
  user_id uuid not null references auth.users on delete cascade,
  workout_id text not null,
  date timestamptz not null,
  entries jsonb not null,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists sessions_user_id_idx on sessions (user_id);

alter table workouts enable row level security;
alter table sessions enable row level security;

drop policy if exists "own workouts" on workouts;
create policy "own workouts" on workouts
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "own sessions" on sessions;
create policy "own sessions" on sessions
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
