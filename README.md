# Cinema DJ Backend

## Local configuration

Create `.env` from `.env.example`:

```bash
cp .env.example .env
```

- `PORT`: API port
- `CLIENT_ORIGIN`: frontend origin allowed by CORS
- `ADMIN_TOKEN`: required bearer token for `/admin/*` routes
