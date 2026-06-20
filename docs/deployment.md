# Deployment

## Local Docker Compose

Create the application environment and start the stack:

```bash
cp .env.example .env
# Set at least JWT_SECRET, DB_PASSWORD, and ENCRYPTION_KEY in .env.
docker compose up -d
```

The application is available at `http://localhost:8080` by default.

## Remote Docker Host (Proxmox VM/LXC)

The root `deploy.sh` copies the project to a remote host with `rsync`, builds the images on that host, and starts the Compose stack there. Building remotely avoids CPU architecture mismatches when deploying from an Apple Silicon Mac to an amd64 server.

### First deployment

Docker with the Compose v2 plugin must be installed on the remote host. Locally, create the two ignored configuration files:

```bash
cp .env.example .env
cp deploy.env.example deploy.env
```

Set strong values for `JWT_SECRET`, `DB_PASSWORD`, and `ENCRYPTION_KEY` in `.env`. Set the SSH host and destination in `deploy.env`, then run:

```bash
./deploy.sh
```

The script performs these operations:

- checks the SSH connection and remote Docker installation;
- synchronizes the checkout while preserving remote database backups;
- validates the remote Compose configuration;
- creates a compressed PostgreSQL backup when the database is already running;
- builds and recreates the services on the remote host;
- verifies `/api/health` through the frontend container;
- prints the final service status.

The `.env` file is transferred over SSH because Compose needs it on the host. Neither `.env` nor `deploy.env` is tracked by Git.

### Redeploy and operations

```bash
./deploy.sh                 # sync, backup, build, deploy, and health-check
./deploy.sh --no-cache      # rebuild images without the Docker build cache
./deploy.sh --logs          # deploy, then follow logs
./deploy.sh --down          # stop the remote stack
```

Backups are stored under `/opt/essential-invoice/backups` by default. The directory is excluded from synchronization so `rsync --delete` does not remove it.

### Optional secure server Compose file

`docker-compose.server.yml` keeps PostgreSQL and the backend off the host network and binds the frontend to `127.0.0.1` by default. To use it, create `.env.server` from `.env.server.example` and set these values in `deploy.env`:

```bash
COMPOSE_FILE=docker-compose.server.yml
APP_ENV_FILE=.env.server
```

When the reverse proxy runs on the same VM/LXC, keep `BIND_ADDRESS=127.0.0.1`. Do not expose PostgreSQL port 5432 or backend port 3001 publicly.

## HTTPS with Caddy

Point the domain to the server, allow inbound TCP ports 80 and 443, and use a Caddy configuration such as:

```caddyfile
invoice.example.com {
  reverse_proxy 127.0.0.1:8080
}
```

## Kubernetes (Helm)

```bash
cd helm-chart
helm install essential-invoice . \
  --namespace essential-invoice \
  --create-namespace \
  --set jwtSecret=$(openssl rand -base64 32) \
  --set encryptionKey=$(openssl rand -hex 32) \
  --set postgresql.auth.password=$(openssl rand -base64 16)
```

See [helm-chart/README.md](../helm-chart/README.md) for the full configuration reference.

## Manual Database Restore

For the default remote configuration:

```bash
docker compose --env-file .env -f docker-compose.yml exec -T db \
  sh -c 'psql -U "$POSTGRES_USER" "$POSTGRES_DB"' < backup.sql
```
