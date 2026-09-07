# Planned feature: proxy-aware rate limiting

Status: **planned; not implemented**.

## Current behavior and interim decision

The rate-limiting redesign from commit `5324a5c` was reverted. For the current single-user installation, the original global IP limiter remains in place with its allowance increased from 100 to **1,000 requests per 15 minutes**. Login retains its separate 10-request limit and forgot-password its 5-request limit, both per IP per 15 minutes. Health probes bypass throttling.

This reduces interruptions during normal navigation without introducing the redesign now. It does not separate users sharing an IP or solve proxy address detection. Express still trusts one proxy hop, and the frontend can clear a saved session when `/auth/me` fails temporarily. The previous configurable `TRUST_PROXY` setting and session retry UI are not available.

## Proposed implementation

1. **Limit requests before JWT verification.** Add a generous, configurable IP burst limiter before authentication. The previous redesign verified JWTs before applying account limits and only counted invalid credentials after verification. A request already receiving 429 could therefore still perform verification. Retain protection for login and password-reset operations as well.
2. **Apply account quotas after verification.** Use the verified user ID as the key and share one account allowance across protected API, profile, and logo routes. Different tokens for the same account must share the quota. Never trust an unverified JWT payload to choose an account key. Choose the burst and account limits together so normal navigation and multiple users sharing a public IP remain practical.
3. **Resolve client IPs at a trusted boundary.** Support direct internal access through ingress and public access through Cloudflare. Configure the ingress controller to trust forwarded identity only from known upstream proxies. The presence of `CF-Connecting-IP` alone is not proof that a request came through Cloudflare.
4. **Preserve sessions through temporary failures.** On `/auth/me`, clear credentials only for authentication failures (401/403). Keep the token on 429, network errors, and server failures; show a localized retry action and respect `Retry-After` for any automatic retry.
5. **Document deployment and storage choices.** Provide tested Nginx ingress and Traefik examples for the supported versions, with matching application trust configuration. State that in-memory limits are per process; use a shared store if deployment-wide limits across replicas are required.

## Proxy deployment design

The bundled Helm chart routes `/api` from ingress directly to the backend. Routing everything through the frontend Nginx adds another proxy hop. Cloudflare adds another public-path hop while the internal path may remain shorter. Do not pick a larger hop count without checking both paths: a shorter path could then allow a client-supplied address to be trusted.

For Nginx ingress, investigate restoring the visitor address from `CF-Connecting-IP` only for connections from Cloudflare's current published IP ranges, then forwarding a normalized client address. Direct internal requests must use their actual source address and ignore forged Cloudflare headers.

For Traefik, configure forwarded-header trust for known upstream addresses and verify the actual `X-Forwarded-For` chain reaching the backend. Trusted forwarding can retain the Cloudflare hop in that chain, so an application trust count copied from Nginx may select a proxy address. Prefer explicit trusted proxy IPs/CIDRs when path lengths vary, or a verified normalization strategy at ingress. Do not enable blanket trust of forwarded headers.

Confirm that the cluster load balancer and Service networking preserve the source information required by this design. Restrict direct backend access to intended ingress paths. Maintain trusted ranges as infrastructure changes.

References for implementation: [Express proxy trust](https://expressjs.com/en/guide/behind-proxies/), [Traefik entry points](https://doc.traefik.io/traefik/reference/install-configuration/entrypoints/), [Nginx real-IP module](https://nginx.org/en/docs/http/ngx_http_realip_module.html), [Cloudflare IP ranges](https://www.cloudflare.com/ips/), and [CodeQL missing rate limiting](https://codeql.github.com/codeql-query-help/javascript/js-missing-rate-limiting/).

## Acceptance checks

- Normal navigation remains usable, including repeated profile checks and logo downloads.
- Users sharing an IP have independent account quotas; multiple tokens and endpoints share the same account quota.
- Once the pre-authentication quota is exhausted, further requests do not call JWT verification. Forged and identity-less tokens cannot consume a victim's account quota.
- Login and password-reset throttling, account quotas, and the pre-authentication burst limit have documented interactions, including users sharing an IP.
- Direct internal and Cloudflare paths resolve the real visitor address for each supported ingress. Forged forwarded headers do not bypass limits.
- Health probes remain available; throttled responses include retry information and requests succeed after expiry.
- Temporary session-check failures retain credentials and offer recovery in Czech and English, on mobile and desktop, in light and dark themes.
- Run behavioral tests and a fresh CodeQL scan. Verify the authorization warnings are resolved by middleware ordering rather than suppressing the rule.
