# Deployment

## Local Development with Docker Compose

### Quick Start

1. Clone the repository:
```bash
git clone https://github.com/yourusername/essential-invoice.git
cd essential-invoice
```

2. Create environment file:
```bash
cp .env.example .env
```

3. Edit `.env` with your settings (required: `JWT_SECRET`, `DB_PASSWORD`, `ENCRYPTION_KEY`):
```bash
JWT_SECRET=your_secure_jwt_secret_here_min_32_chars
DB_PASSWORD=your_secure_database_password
ENCRYPTION_KEY=$(openssl rand -hex 32)
```

4. Start the application:
```bash
docker compose up -d
```

5. Access the application at `http://localhost:8080`

## Secure Single-Server Deployment (Docker in a Proxmox LXC/VM)

Use `docker-compose.server.yml` and the root `deploy.sh`. This deployment:

- exposes only the frontend port (bound to `127.0.0.1` by default);
- keeps PostgreSQL and the backend API off the host network;
- requires generated database, JWT, and encryption secrets;
- runs application containers with restricted privileges and read-only filesystems;
- creates a compressed PostgreSQL backup before every later deployment.

### First installation

```bash
git clone https://github.com/jerechinsky/essential-invoice.git
cd essential-invoice
./deploy.sh init
./deploy.sh deploy
```

`./deploy.sh init` creates `.env.server` with mode `600` and random secrets. Set `APP_URL` to the final URL before deploying. Keep `BIND_ADDRESS=127.0.0.1` when the TLS reverse proxy runs in the same LXC/VM.

### HTTPS with Caddy

Point the domain's DNS record to the server, allow inbound TCP ports 80 and 443, and use a Caddy configuration such as:

```caddyfile
invoice.example.com {
  reverse_proxy 127.0.0.1:8080
}
```

Do not expose ports 5432 (PostgreSQL) or 3001 (backend). Do not expose port 8080 publicly when Caddy runs on the same server.

### Redeploying a new release

```bash
git fetch origin
git switch master
git pull --ff-only origin master
./deploy.sh deploy
```

The script backs up a running database, rebuilds both application images, recreates changed containers without deleting the database volume, and checks `/api/health`.

Useful commands:

```bash
./deploy.sh status
./deploy.sh logs
./deploy.sh backup
```

### Replacing an old installation from scratch

The following intentionally deletes the old database. Run it only when no old data is required:

```bash
cd /path/to/old/essential-invoice
docker compose down -v --remove-orphans
```

Then move the old checkout aside, clone the consolidated release, and follow **First installation** above. Never reuse an old `.env` for a clean installation; generate new secrets with `./deploy.sh init`.

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

See [helm-chart/README.md](../helm-chart/README.md) for full configuration reference.

## Manual Backup

### Database Backup

```bash
# Create backup
docker compose --env-file .env.server -f docker-compose.server.yml exec -T db \
  sh -c 'pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB"' > backup.sql

# Restore backup
docker compose --env-file .env.server -f docker-compose.server.yml exec -T db \
  sh -c 'psql -U "$POSTGRES_USER" "$POSTGRES_DB"' < backup.sql
```

### Volume Backup

```bash
# Stop containers
docker compose --env-file .env.server -f docker-compose.server.yml down

# Backup volume
docker run --rm -v essential-invoice_postgres_data:/data -v $(pwd):/backup alpine tar czf /backup/db-backup.tar.gz -C /data .

# Restore volume
docker run --rm -v essential-invoice_postgres_data:/data -v $(pwd):/backup alpine tar xzf /backup/db-backup.tar.gz -C /data
```
