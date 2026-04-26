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
