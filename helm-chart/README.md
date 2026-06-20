# Essential Invoice Helm Chart

A Helm chart for deploying Essential Invoice on Kubernetes — a self-hosted invoicing application for Czech freelancers.

## Prerequisites

- Kubernetes 1.24+
- Helm 3.x
- PV provisioner (for PostgreSQL persistence)

## Installation

### Add dependency and install

```bash
cd helm-chart
helm dependency update
helm install essential-invoice . \
  --namespace essential-invoice \
  --create-namespace \
  --set jwtSecret=$(openssl rand -base64 32) \
  --set encryptionKey=$(openssl rand -hex 32) \
  --set postgresql.auth.password=$(openssl rand -base64 16)
```

### Using a values file

```bash
helm install essential-invoice . \
  --namespace essential-invoice \
  --create-namespace \
  -f my-values.yaml
```

## Uninstall

```bash
helm uninstall essential-invoice -n essential-invoice
```

> **Note**: The PostgreSQL PVC is not deleted on uninstall. Delete it manually if needed:
> `kubectl delete pvc -l app.kubernetes.io/instance=essential-invoice -n essential-invoice`

## Configuration Reference

### Service Account

| Parameter | Description | Default |
|---|---|---|
| `serviceAccount.create` | Create a dedicated ServiceAccount | `true` |
| `serviceAccount.name` | ServiceAccount name (auto-generated if empty) | `""` |
| `serviceAccount.annotations` | Annotations (e.g. IRSA role ARN) | `{}` |

### Backend

| Parameter | Description | Default |
|---|---|---|
| `backend.image.repository` | Backend image | `ghcr.io/vdovhanych/essential-invoice/backend` |
| `backend.image.tag` | Image tag | `latest` |
| `backend.replicas` | Number of replicas | `1` |
| `backend.port` | Container port | `3001` |
| `backend.service.type` | Service type | `ClusterIP` |
| `backend.strategy` | Deployment strategy | `{}` |
| `backend.podAnnotations` | Additional pod annotations | `{}` |
| `backend.podSecurityContext` | Pod security context | `{runAsNonRoot: true, runAsUser: 1000, ...}` |
| `backend.securityContext` | Container security context | `{allowPrivilegeEscalation: false, ...}` |
| `backend.resources.requests.memory` | Memory request | `128Mi` |
| `backend.resources.requests.cpu` | CPU request | `100m` |
| `backend.resources.limits.memory` | Memory limit | `512Mi` |
| `backend.resources.limits.cpu` | CPU limit | `500m` |
| `backend.env.NODE_ENV` | Node environment | `production` |
| `backend.env.EMAIL_POLLING_INTERVAL` | Email polling interval (seconds) | `600` |
| `backend.env.RECURRING_INVOICE_INTERVAL` | Recurring invoice check interval (seconds) | `86400` |
| `backend.env.CORS_ORIGIN` | Allowed CORS origin | `*` |
| `backend.extraEnv` | Additional env vars (list) | `[]` |
| `backend.extraEnvFrom` | Additional envFrom sources | `[]` |
| `backend.autoscaling.enabled` | Enable HPA | `false` |
| `backend.autoscaling.minReplicas` | Min replicas | `1` |
| `backend.autoscaling.maxReplicas` | Max replicas | `5` |
| `backend.autoscaling.targetCPUUtilizationPercentage` | Target CPU % | `80` |
| `backend.pdb.enabled` | Enable PodDisruptionBudget | `false` |
| `backend.pdb.minAvailable` | Min available pods | `1` |

### Frontend

| Parameter | Description | Default |
|---|---|---|
| `frontend.image.repository` | Frontend image | `ghcr.io/vdovhanych/essential-invoice/frontend` |
| `frontend.image.tag` | Image tag | `latest` |
| `frontend.replicas` | Number of replicas | `1` |
| `frontend.port` | Container port | `80` |
| `frontend.service.type` | Service type | `ClusterIP` |
| `frontend.strategy` | Deployment strategy | `{}` |
| `frontend.podAnnotations` | Additional pod annotations | `{}` |
| `frontend.podSecurityContext` | Pod security context | `{runAsNonRoot: true, runAsUser: 101, ...}` |
| `frontend.securityContext` | Container security context | `{readOnlyRootFilesystem: true, ...}` |
| `frontend.resources.requests.memory` | Memory request | `64Mi` |
| `frontend.resources.requests.cpu` | CPU request | `50m` |
| `frontend.resources.limits.memory` | Memory limit | `256Mi` |
| `frontend.resources.limits.cpu` | CPU limit | `200m` |
| `frontend.autoscaling.enabled` | Enable HPA | `false` |
| `frontend.autoscaling.minReplicas` | Min replicas | `1` |
| `frontend.autoscaling.maxReplicas` | Max replicas | `5` |
| `frontend.autoscaling.targetCPUUtilizationPercentage` | Target CPU % | `80` |
| `frontend.pdb.enabled` | Enable PodDisruptionBudget | `false` |
| `frontend.pdb.minAvailable` | Min available pods | `1` |

### Ingress

| Parameter | Description | Default |
|---|---|---|
| `ingress.enabled` | Enable ingress | `false` |
| `ingress.className` | Ingress class name | `""` |
| `ingress.annotations` | Ingress annotations | `{}` |
| `ingress.host` | Hostname | `""` |
| `ingress.pathType` | Path type for ingress rules | `Prefix` |
| `ingress.tls` | TLS configuration | `[]` |

### Secrets

| Parameter | Description | Default |
|---|---|---|
| `jwtSecret` | JWT signing secret (required) | `""` |
| `encryptionKey` | AES-256 encryption key for secrets at rest (64-char hex, required) | `""` |
| `existingSecret` | Use existing secret (key: `JWT_SECRET`, `ENCRYPTION_KEY`; also `DB_PASSWORD` for external DB) | `""` |

### PostgreSQL (Bitnami subchart)

| Parameter | Description | Default |
|---|---|---|
| `postgresql.enabled` | Deploy PostgreSQL subchart | `true` |
| `postgresql.auth.database` | Database name | `essential_invoice` |
| `postgresql.auth.username` | Username | `postgres` |
| `postgresql.auth.password` | Password (required) | `""` |
| `postgresql.auth.existingSecret` | Existing secret for DB password | `""` |
| `postgresql.primary.persistence.enabled` | Enable PVC | `true` |
| `postgresql.primary.persistence.size` | PVC size | `5Gi` |

### External Database

To use an external database instead of the subchart:

```yaml
postgresql:
  enabled: false
  external:
    host: my-postgres.example.com
    port: 5432
    database: essential_invoice
    username: postgres
    password: my-password
```

## Examples

### With ingress and TLS (nginx + cert-manager)

> **Warning**: Do not commit secrets to version control. Use `--set` flags or `existingSecret` for production.

```yaml
jwtSecret: "my-jwt-secret"  # example only — use --set or existingSecret in production

ingress:
  enabled: true
  className: nginx
  host: invoice.example.com
  annotations:
    cert-manager.io/cluster-issuer: letsencrypt-prod
    nginx.ingress.kubernetes.io/proxy-body-size: "55m"
  tls:
    - secretName: essential-invoice-tls
      hosts:
        - invoice.example.com

postgresql:
  auth:
    password: "my-db-password"
  primary:
    persistence:
      size: 10Gi
```

### Using existing secrets

```bash
# Create a secret for the application (JWT)
kubectl create secret generic essential-invoice-app \
  --from-literal=JWT_SECRET=$(openssl rand -base64 32) \
  -n essential-invoice

# Create a separate secret for PostgreSQL (Bitnami expects "postgres-password" key)
kubectl create secret generic essential-invoice-db \
  --from-literal=postgres-password=my-db-password \
  -n essential-invoice

# Reference them in values
helm install essential-invoice . \
  --set existingSecret=essential-invoice-app \
  --set postgresql.auth.existingSecret=essential-invoice-db \
  -n essential-invoice
```

### With extra environment variables

```yaml
backend:
  extraEnv:
    - name: SMTP_HOST
      value: "smtp.example.com"
    - name: SMTP_PASSWORD
      valueFrom:
        secretKeyRef:
          name: smtp-secret
          key: password
  extraEnvFrom:
    - secretRef:
        name: smtp-credentials
```

### With IRSA (AWS)

```yaml
serviceAccount:
  annotations:
    eks.amazonaws.com/role-arn: arn:aws:iam::123456789:role/essential-invoice
```
