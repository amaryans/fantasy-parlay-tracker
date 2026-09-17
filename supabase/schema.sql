-- =============================================================================
-- Loser Parlay Tracker: Supabase schema
-- Run this whole file once in the Supabase SQL editor (Database -> SQL Editor).
-- It is idempotent-ish: re-running will error on existing objects, so for a
-- fresh start drop the tables first or use a new project.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- League-wide settings (exactly one row, id = 1)
-- ---------------------------------------------------------------------------
create table public.league_settings (
  id              int primary key default 1 check (id = 1),
  league_name     text not null default 'West K-Town Fantasy Football League',
  invite_code     text not null default 'CHANGE-ME',
  season          int  not null default 2026,
  -- Thursday of NFL Week 1. Used to work out which NFL week a date falls in.
  season_start    date not null default '2026-09-10',
  default_stake   numeric(10,2) not null default 10,
  -- If false (the league rule), the person placing the parlay does NOT pick a leg.
  loser_adds_leg  boolean not null default false,
  updated_at      timestamptz not null default now()
);

insert into public.league_settings (id) values (1);

-- ---------------------------------------------------------------------------
-- Profiles: one per auth user, created automatically on signup
-- ---------------------------------------------------------------------------
create table public.profiles (
  id            uuid primary key references auth.users (id) on delete cascade,
  display_name  text not null,
  team_name     text,
  created_at    timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Games + odds pulled from The Odds API (optional automation)
-- ---------------------------------------------------------------------------
create table public.games (
  id             uuid primary key default gen_random_uuid(),
  event_id       text not null unique,
  season         int  not null,
  week           int  not null,
  commence_time  timestamptz not null,
  home_team      text not null,
  away_team      text not null,
  updated_at     timestamptz not null default now()
);

create index games_season_week_idx on public.games (season, week);

create table public.game_odds (
  id          uuid primary key default gen_random_uuid(),
  game_id     uuid not null references public.games (id) on delete cascade,
  bookmaker   text not null,
  market      text not null check (market in ('h2h', 'spreads', 'totals')),
  outcome     text not null,          -- team name, or 'Over' / 'Under'
  point       numeric(5,1),           -- spread or total line, null for moneyline
  price       int  not null,          -- American odds
  fetched_at  timestamptz not null default now(),
  unique (game_id, bookmaker, market, outcome)
);

-- ---------------------------------------------------------------------------
-- Weeks: one parlay per NFL week
-- ---------------------------------------------------------------------------
create table public.weeks (
  id             uuid primary key default gen_random_uuid(),
  season         int not null,
  week           int not null check (week between 1 and 22),
  -- The member who had the lowest fantasy score the previous week and must
  -- place this week's parlay.
  loser_id       uuid references public.profiles (id) on delete set null,
  low_score      numeric(6,2),
  stake          numeric(10,2) not null default 10,
  -- After this time legs are frozen (results can still be marked).
  lock_at        timestamptz,
  parlay_result  text not null default 'pending'
                 check (parlay_result in ('pending', 'won', 'lost', 'push', 'void')),
  payout         numeric(10,2),
  notes          text,
  created_by     uuid references public.profiles (id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (season, week)
);

-- ---------------------------------------------------------------------------
-- Legs: one per member per week
-- ---------------------------------------------------------------------------
create table public.legs (
  id          uuid primary key default gen_random_uuid(),
  week_id     uuid not null references public.weeks (id) on delete cascade,
  user_id     uuid not null references public.profiles (id) on delete cascade,
  game_id     uuid references public.games (id) on delete set null,
  game        text,                    -- e.g. "Chiefs @ Ravens"
  market      text not null default 'other'
              check (market in ('spread', 'moneyline', 'total', 'prop', 'other')),
  pick        text not null,           -- e.g. "Ravens -3.5"
  odds        int check (odds is null or odds >= 100 or odds <= -100),
  result      text not null default 'pending'
              check (result in ('pending', 'won', 'lost', 'push', 'void')),
  entered_by  uuid references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (week_id, user_id)
);

create index legs_week_idx on public.legs (week_id);
create index legs_user_idx on public.legs (user_id);

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

create trigger weeks_touch before update on public.weeks
  for each row execute procedure public.touch_updated_at();
create trigger legs_touch before update on public.legs
  for each row execute procedure public.touch_updated_at();
create trigger settings_touch before update on public.league_settings
  for each row execute procedure public.touch_updated_at();

-- Create a profile for each new auth user and enforce the invite code.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  expected text;
  given    text;
begin
  select invite_code into expected from public.league_settings where id = 1;
  given := coalesce(new.raw_user_meta_data ->> 'invite_code', '');
  if expected is not null and expected <> ''
     and lower(trim(given)) <> lower(trim(expected)) then
    raise exception 'Invalid invite code';
  end if;

  insert into public.profiles (id, display_name, team_name)
  values (
    new.id,
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''),
             split_part(new.email, '@', 1)),
    nullif(trim(new.raw_user_meta_data ->> 'team_name'), '')
  );
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Enforce league rules on legs:
--   * the parlay placer does not get a leg (unless loser_adds_leg is on)
--   * once a week is locked the pick/odds cannot change, only the result can
create or replace function public.enforce_leg_rules()
returns trigger language plpgsql as $$
declare
  w       public.weeks%rowtype;
  allow   boolean;
  locked  boolean;
begin
  select * into w from public.weeks where id = coalesce(new.week_id, old.week_id);
  select loser_adds_leg into allow from public.league_settings where id = 1;
  locked := w.lock_at is not null and now() >= w.lock_at;

  if tg_op in ('INSERT', 'UPDATE') then
    if not coalesce(allow, false) and w.loser_id is not null and new.user_id = w.loser_id then
      raise exception 'The person placing the parlay does not pick a leg';
    end if;
  end if;

  if tg_op = 'INSERT' and locked then
    raise exception 'This week is locked; no new legs can be added';
  end if;

  if tg_op = 'DELETE' and locked then
    raise exception 'This week is locked; legs cannot be removed';
  end if;

  if tg_op = 'UPDATE' and locked then
    if new.pick is distinct from old.pick
       or new.odds is distinct from old.odds
       or new.game is distinct from old.game
       or new.game_id is distinct from old.game_id
       or new.market is distinct from old.market
       or new.user_id is distinct from old.user_id
       or new.week_id is distinct from old.week_id then
      raise exception 'This week is locked; only the result can be changed';
    end if;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end $$;

create trigger legs_rules
  before insert or update or delete on public.legs
  for each row execute procedure public.enforce_leg_rules();

-- ---------------------------------------------------------------------------
-- Functions callable before login
-- ---------------------------------------------------------------------------
create or replace function public.check_invite_code(code text)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from public.league_settings
    where id = 1 and lower(trim(invite_code)) = lower(trim(coalesce(code, '')))
  );
$$;

create or replace function public.public_league_info()
returns table (league_name text, season int)
language sql security definer stable set search_path = public as $$
  select league_name, season from public.league_settings where id = 1;
$$;

revoke all on function public.check_invite_code(text) from public;
revoke all on function public.public_league_info() from public;
grant execute on function public.check_invite_code(text) to anon, authenticated;
grant execute on function public.public_league_info() to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Row level security. This is a private league app: every signed-in member
-- can see everything, and members are trusted to edit weeks, legs and odds.
-- Anonymous visitors can read nothing.
-- ---------------------------------------------------------------------------
alter table public.league_settings enable row level security;
alter table public.profiles        enable row level security;
alter table public.games           enable row level security;
alter table public.game_odds       enable row level security;
alter table public.weeks           enable row level security;
alter table public.legs            enable row level security;

create policy "members read settings"   on public.league_settings for select to authenticated using (true);
create policy "members update settings" on public.league_settings for update to authenticated using (true) with check (true);

create policy "members read profiles"   on public.profiles for select to authenticated using (true);
create policy "own profile update"      on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

create policy "members read games"      on public.games     for select to authenticated using (true);
create policy "members read odds"       on public.game_odds for select to authenticated using (true);

create policy "members read weeks"      on public.weeks for select to authenticated using (true);
create policy "members insert weeks"    on public.weeks for insert to authenticated with check (true);
create policy "members update weeks"    on public.weeks for update to authenticated using (true) with check (true);
create policy "members delete weeks"    on public.weeks for delete to authenticated using (true);

create policy "members read legs"       on public.legs for select to authenticated using (true);
create policy "members insert legs"     on public.legs for insert to authenticated with check (true);
create policy "members update legs"     on public.legs for update to authenticated using (true) with check (true);
create policy "members delete legs"     on public.legs for delete to authenticated using (true);
