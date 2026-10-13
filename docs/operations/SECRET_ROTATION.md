# Secret rotation runbook

Do not paste secrets into chat, screenshots, tickets, git or URLs. Previously exposed passwords and Firebase Admin keys must be considered compromised and changed/revoked through an approved operator procedure; this task does not revoke a possibly in-use production key.

Inventory secrets by environment: Admin keys, DB runtime/direct credentials, job bearer tokens, future PSP/webhook keys, rate-limit key, CI/provider access tokens and deployment-protection credentials. Public Firebase browser config is intentionally public; Admin credentials are not. Store each environment separately, grant least privilege and record owner/last rotation privately.

1. Create replacement credentials only in the intended environment; obtain approval for provider/billing changes.
2. Stage new server secrets in the provider store, update permitted fingerprints/configuration and rebuild public config if it changed. Test staging before production.
3. Deploy/restart all affected instances and scheduled callers. For job tokens, coordinate callers and handlers so requests fail closed rather than accepting a public fallback. There is no automatic dual-secret grace period in these handlers.
4. Verify health, authorized/unauthorized jobs, auth refresh, media, sandbox signed webhooks and outbox with synthetic staging data. A successful console key creation alone is insufficient.
5. Revoke the old credential only after ownership, propagation and recovery plan are confirmed. Review access logs and record private evidence. A production incident may require immediate revocation with explicit owner approval rather than a normal staged rotation.

DB rotation must update pooled and direct URLs for the same environment; runtime does not silently fall back to development. Admin-key rotation may require a complete restart due to initialized SDK singletons. Rate-limit-key rotation changes hashing and may reset limiter continuity; coordinate window/abuse controls. PSP secret rotation must honor that vendor's verified event overlap/reconciliation policy—no live vendor exists here.
