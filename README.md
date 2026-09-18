# Loser Parlay Tracker

> **Merged into the league site.** The parlay tracker now lives under the Parlay tab of
> [west-ktown-stats](https://github.com/amaryans/west-ktown-stats) (`src/features/parlay`),
> sharing that site's login, member list and Sleeper link. The database schema there is a
> superset of `supabase/schema.sql` here, so an existing parlay project keeps working. This
> repo is kept as the standalone version.

A small web app for the West K-Town Fantasy Football League's weekly loser parlay.

**The rule:** whoever scores the fewest fantasy points in a week has to place a parlay on the
following week's NFL slate, and every other member of the league adds one leg to it.

The app tracks who is placing each week's parlay, lets each member log in and enter their leg,
records the odds (typed in by anyone, or pulled automatically from a sportsbook feed), settles the
results, and keeps season-long stats on who actually knows how to pick a game.

## What it does

- **This Week** – who the loser is, the legs so far, combined parlay odds, potential payout, and
  who still owes a pick. Add your leg in two fields.
- **Weeks** – every week of the season with placer, leg count, odds, stake and result. Manage a
  week: set the loser and their score, the stake, when picks lock, the final result and payout.
- **Odds Board** – the week's NFL games with consensus spread, moneyline and total and the best
  price across US books. Tap a line to use it as your leg (optional, see *Automatic odds*).
- **Stats** – leaderboard of best pickers (hit rate, average odds, performance versus the book's
  implied probability, streaks), parlay history, total staked and net, and a few superlatives
  (most parlays placed, parlay killer, best luck as placer).
- **Settings** – your display name and team name; league name, invite code, season, default stake,
  and whether the placer also picks a leg.

House rules the app enforces (in the database, not just the UI):

- One leg per member per week. A leg belongs to its member: only they (or a commissioner) can
  write, change or remove it. Anyone can fill in the odds and mark a leg won/lost/push.
- The member placing the parlay also picks a leg by default. The commissioner can turn that off.
- The stake, final result and payout for a week are set by whoever is placing that parlay (or a
  commissioner). It defaults to the league's default stake.
- Once a week's lock time passes, picks and odds are frozen. Results can still be marked.
- Only people with the invite code can create an account.

**Commissioner.** The first account created becomes commissioner automatically, and can promote
others from Settings → Members. Commissioners manage league settings (name, invite code, default
stake, the loser-picks toggle, Sleeper link), link members to their Sleeper teams, change who is
placing a parlay, set lock times, and delete weeks.

**Sleeper.** Link your Sleeper league ID in Settings and map each member to their Sleeper team
(members can also pick their own team when signing up or in their profile). The app then reads
last week's scores from Sleeper's public API, works out the current NFL week, and pre-fills the
lowest scorer when the new week is created. No Sleeper login or API key is needed.

## Stack

- Frontend: React + Vite, hosted on **GitHub Pages** (static).
- Backend: **Supabase** free tier (Postgres, auth, row-level security). GitHub Pages can't run a
  server or keep secrets, so the database and logins live in Supabase. The browser only ever sees
  the public "anon" key; the policies in `supabase/schema.sql` are what protect the data.
- Optional automation: a GitHub Actions workflow that pulls NFL odds from
  [The Odds API](https://the-odds-api.com) into Supabase a few times a week.

## Setup (about 15 minutes)

### 1. Create the Supabase project

1. Sign up at [supabase.com](https://supabase.com) and create a new project (free tier is fine).
2. Open **SQL Editor**, paste the whole of [`supabase/schema.sql`](supabase/schema.sql), and run it.
3. Under **Authentication → Sign In / Providers → Email**, decide about *Confirm email*. Turning it
   **off** lets league members sign up and use the app immediately. Leaving it on works too, but
   they'll have to click a confirmation link first.
4. Under **Authentication → URL Configuration**, set the Site URL to your GitHub Pages URL
   (e.g. `https://<you>.github.io/fantasy-parlay-tracker/`).
5. Note your **Project URL** and **anon public key** from **Project Settings → API**.

### 2. Set the invite code

In Supabase, open **Table Editor → league_settings** and change `invite_code` from `CHANGE-ME` to
something you'll share with the league. Everything else in that row (season, default stake, the
loser-picks toggle, Sleeper league ID) can be changed from the app's Settings page once you're in.

### 3. Deploy to GitHub Pages

1. In this repo go to **Settings → Pages** and set *Source* to **GitHub Actions**.
2. Go to **Settings → Secrets and variables → Actions → Variables** and add:
   - `VITE_SUPABASE_URL` – your project URL
   - `VITE_SUPABASE_ANON_KEY` – your anon public key
3. Push to `main` (or run the *Deploy to GitHub Pages* workflow manually). The site will be live at
   `https://<you>.github.io/fantasy-parlay-tracker/`.

If the repo is renamed, or you use a custom domain, set the `VITE_BASE_PATH` variable (e.g. `/`).

### 4. Claim the commissioner seat and link Sleeper

1. Open the site and **create your account first**. The first account becomes commissioner.
2. Go to **Settings**, paste your **Sleeper league ID** (the long number in the league URL on
   sleeper.com) and save. The page confirms the league name and team count.
3. Pick your own Sleeper team in your profile.

### 5. Invite the league

Send everyone the URL and the invite code. When they sign up they pick their Sleeper team from a
list, which prefills their name. Anyone who skips that can be linked later from Settings → Members
(there's an "Auto-link by name" button). Once everyone is linked, the weekly loser fills itself in.

## Automatic odds (optional)

Without this, odds are typed in by hand (anyone can fill in or fix a leg's odds). With it, the
Odds Board shows live lines and legs get their odds filled in with one tap.

1. Get a free API key from [the-odds-api.com](https://the-odds-api.com) (500 requests/month; the
   schedule here uses about 40).
2. In the repo, add these **Secrets** (Settings → Secrets and variables → Actions → Secrets):
   - `SUPABASE_URL` – your project URL
   - `SUPABASE_SERVICE_ROLE_KEY` – from Project Settings → API. This key bypasses row security, so
     it lives only in GitHub secrets, never in the app.
   - `ODDS_API_KEY`
3. Add a repository **Variable** `ODDS_AUTOMATION_ENABLED` = `true`.
4. Run the *Fetch NFL odds* workflow manually once from the Actions tab to confirm it works. It then
   runs automatically Tuesday, Thursday and Sunday.

You can also run it locally: `SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... ODDS_API_KEY=... npm run fetch-odds`.

## Roadmap: odds automation

What exists today:

1. **Manual odds** – anyone types American odds on a leg, any time before lock.
2. **Odds board** (this repo, needs the setup above) – lines pulled into Supabase three times a week;
   tapping a line creates the leg with the odds filled in, and a ↻ button next to the leg re-prices
   it against the latest pull. Hand-edited odds still win: the button only runs when you press it.

Sensible next steps, in order:

3. **Pull lines more often on game days** – add cron entries to `.github/workflows/fetch-odds.yml`
   (e.g. hourly on Sunday). Each run costs 3 of the 500 free monthly credits.
4. **Auto-grade legs** – The Odds API also has a scores endpoint
   (`/v4/sports/americanfootball_nfl/scores?daysFrom=3`). A second scheduled script could settle
   spread, moneyline and total legs that are linked to a game (`legs.game_id` + `legs.odds_ref`)
   by comparing the final score with the line, leaving props for a human. That removes most of the
   result-marking.
5. **Auto-settle the parlay** – once every leg is graded, set `weeks.parlay_result` and the payout
   from the stake and combined odds (the app already suggests both).
6. **Player props** – The Odds API exposes props per event on paid tiers. Until then, props stay
   manual.

## Local development

```bash
npm install
cp .env.example .env   # fill in your Supabase URL and anon key
npm run dev
```

## Project layout

```
supabase/schema.sql        tables, triggers (league rules), row-level security
src/lib/odds.js            American odds ↔ decimal, parlay math, payouts
src/lib/week.js            NFL week from a date, lock defaults
src/lib/stats.js           leaderboard and league stats
src/context/               auth session + league data loading/mutations
src/pages/                 This Week, Weeks, Week detail, Odds Board, Stats, Settings, Login/Signup
scripts/fetch-odds.mjs     pulls lines from The Odds API into Supabase
.github/workflows/         Pages deploy + scheduled odds fetch
```

## Notes on the data model

- `weeks` – one row per NFL week: who's placing (`loser_id`), their score, stake, lock time, the
  parlay's result and actual payout. `week` is the NFL week the games are played in.
- `legs` – one row per member per week: the pick, market type, American odds, result.
- `games` / `game_odds` – only populated by the odds automation.
- A parlay's combined odds are computed from its legs; pushed or voided legs drop out, which is how
  sportsbooks settle them.
