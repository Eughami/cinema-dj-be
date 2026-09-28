# Cinema DJ Backend

## Local configuration

Create `.env` from `.env.example`:

```bash
cp .env.example .env
```

- `PORT`: API port
- `CLIENT_ORIGIN`: frontend origin allowed by CORS
- `ADMIN_USERNAME`: admin login username
- `ADMIN_PASSWORD`: admin login password
- `ADMIN_JWT_SECRET`: HMAC secret used to sign/verify admin JWTs
- `ADMIN_JWT_EXPIRES_IN_SECONDS` (optional): JWT expiry in seconds (default `28800`)

## Admin authentication

- `POST /admin/login` with `{ "username": "...", "password": "..." }` to get a JWT.
- Send `Authorization: Bearer <token>` on all `/admin/*` requests.

## Programmation hebdomadaire automatique

`weekly-schedule.ts` ajoute des films chaque mercredi et planifie des séances
non-chevauchantes sur 7 jours (salles 1 et 2, 11h00–23h59, 30 min de battement).

- Films : 2 nouveautés par mercredi (1 sortie du jour + 1 sortie à +21 jours
  sans séance pour alimenter « Prochaines sorties »).
- Séances : seuls les films sortis depuis moins de 30 jours sont programmés.
- Le serveur lance le planificateur au démarrage puis toutes les heures
  (`--auto` : films le mercredi, bouche-trous de séances tous les jours,
  donc le site reste rempli à chaque visite).
- Désactivation : `DISABLE_WEEKLY_SCHEDULER=1`.

```bash
npm run schedule          # auto (films seulement le mercredi)
npm run schedule:force    # force l'ajout de films quel que soit le jour
npm run schedule:dry      # simulation sans écriture
npx ts-node weekly-schedule.ts --sessions-only   # séances uniquement
npx ts-node weekly-schedule.ts --force --dry-run # test un mercredi fictif
npx ts-node weekly-schedule.ts --force --date=2026-09-30
```

Cron (chaque mercredi à 06h00) en plus du planificateur intégré :

```cron
0 6 * * 3 cd /home/imam/Documents/cinema/cinema-dj-be && npm run schedule >> cinema-server-log 2>&1
```

## Films réels (TMDB) — voir `howtorun.md`

`./sync-cinema-weekly.sh` (ou `npm run schedule:real`) synchronise les vrais
films à l'affiche (TMDB `now_playing` + `upcoming`, France), télécharge les
affiches dans `uploads/` et programme les séances. Clé gratuite requise :
`TMDB_API_KEY` dans `.env`. Sans clé, le mode catalogue intégré prend le relais.
