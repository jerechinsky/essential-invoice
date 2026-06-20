# Troubleshooting

## Common Issues

**PDF generation fails:**
- Ensure Chromium is installed in the Docker container
- Check logs: `docker compose logs backend`

**Email sending fails:**
- Verify SMTP settings in Settings page
- Test connection with the "Test" button
- Check if 2FA requires app password (Gmail, etc.)

**Bank notifications not received:**
- Verify IMAP settings
- Check that bank notification email filter is correct
- Ensure email is marked as unread in inbox

**Database connection errors:**
- Wait for database to be healthy before backend starts
- Check `docker compose logs db`

**Batch expense PDF import returns HTTP 413 or "Upload failed":**
- The bundled frontend Nginx allows 55 MiB API requests, matching 10 PDFs at 5 MiB each; rebuild/redeploy the frontend after upgrading
- For Kubernetes with Nginx Ingress, set `nginx.ingress.kubernetes.io/proxy-body-size: "55m"` in `ingress.annotations`
- Apply an equivalent request-body limit when using a different external reverse proxy

## Viewing Logs

```bash
# All logs
docker compose logs

# Backend logs
docker compose logs backend

# Database logs
docker compose logs db
```
