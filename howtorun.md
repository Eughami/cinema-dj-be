# howtorun.md — Weekly cinema sync on the server

This backend keeps the website filled with real movies. Every week it pulls
what is actually in cinemas (TMDB `now_playing` + `upcoming` for France),
downloads the real posters/backdrops into `uploads/`, stores them in
`database.db`, and schedules a week of non-overlapping sessions
(halls 1–2, 11:00–23:59, 30 min cleaning buffer).

No exactness guaranteed — it grabs the most popular titles currently showing
plus a couple of future premieres. Good enough for a living demo site.

## 1. One-time server setup

```bash
cd /home/imam/Documents/cinema/cinema-dj-be   # or wherever you deployed it
cp .env.example .env
npm install
```

## 2. Get a free TMDB key (2 minutes)

1. Create an account at https://www.themoviedb.org
2. Go to https://www.themoviedb.org/settings/api
3. Copy the **API Key (v3 auth)** — a 32-character string.
4. Put it in `.env`:

```env
TMDB_API_KEY=paste-your-32-char-key-here
TMDB_REGION=FR
TMDB_LANGUAGE=fr-FR
TMDB_MAX_NOW_PLAYING=8   # real "now playing" movies added per run
TMDB_MAX_UPCOMING=8      # future premieres (no sessions yet) per run
```

Without a key, everything still works in **catalog fallback mode**
(built-in titles, placeholder posters).

## 3. Run it manually first

```bash
# Dry run — talks to TMDB, downloads nothing, writes nothing:
npm run schedule:real-dry

# Real run — adds movies + images + sessions:
./sync-cinema-weekly.sh
# ...or directly:
npm run schedule:real
```

Check the result:

```bash
sqlite3 database.db "SELECT title, release_date, image FROM movies ORDER BY id DESC LIMIT 8;"
ls -la uploads/ | tail -8
```

## 4. Automate: cron every Wednesday 06:00

```bash
crontab -e
```

Add:

```cron
0 6 * * 3 /home/imam/Documents/cinema/cinema-dj-be/sync-cinema-weekly.sh
```

(Adjust the path to your deploy directory. Logs go to `cinema-server-log`
in the app dir, or set `SYNC_LOG_FILE=/var/log/cinema-sync.log` in `.env`.)

Notes:

- The script prefers the compiled `weekly-schedule.js` and falls back to
  `ts-node` if it is missing. After pulling new code, run `npm run build`.
- The API server itself also runs the scheduler at startup + hourly in
  `--auto` mode: it only gap-fills sessions and adds catalog films on
  Wednesdays **when no TMDB key is configured**. With a key configured,
  the cron job owns the weekly movie drops and the server just keeps
  sessions topped up — so every visit shows current movies.
- Re-runs are idempotent: already-imported TMDB titles are skipped
  (via `tmdb_id`), and full days get no duplicate sessions.
- Session age policy: films released in the last 14 days get a full
  rotation, films 15–30 days old are capped at 2 sessions per hall per
  day, and films older than 30 days are never scheduled again.

## 5. Useful commands

```bash
npm run schedule:real-dry   # preview a TMDB sync (no writes)
npm run schedule:real       # TMDB sync now
npm run schedule            # catalog auto mode (films only on Wednesdays)
npm run schedule:force      # force a catalog drop (testing)
npm run schedule:dry        # preview catalog mode (no writes)
npx ts-node weekly-schedule.ts --sessions-only   # sessions only, no movies
DISABLE_WEEKLY_SCHEDULER=1 npm run dev           # dev without the scheduler
```

## 6. Troubleshooting

| Symptom | Fix |
|---|---|
| `TMDB_API_KEY manquant` | Add the v3 key to `.env` (see §2). |
| `Appel TMDB échoué (401)` | Wrong/revoked key — regenerate it on the TMDB site. |
| `Appel TMDB échoué (404)` on details | A TMDB entry vanished mid-sync — just re-run. |
| Posters missing, remote URLs in DB | Image download failed (network) — the script falls back to the TMDB CDN URL so the site still shows the poster; re-run later to store local copies. |
| `UNIQUE constraint failed: sessions...` in logs | Harmless — a slot was already taken; it is counted as "ignorée" and skipped. |
| Nothing new added on re-run | Normal — titles already imported and the week already scheduled. |
| `database is locked` | Two runs overlapped — cron runs take ~30–60 s; keep a single cron entry. |
