# Decision Register (Phase 0 Carryovers)

Status date: 2026-02-19

| Decision | Current state | Owner | Target date | Notes |
|---|---|---|---|---|
| Final freshness SLA (1s/3s/5s) | Open | Eng + Product | 2026-02-26 | MVP proxy uses 3s p95 threshold |
| KPI catalog freeze | Open | Product + Analytics | 2026-02-26 | Current metadata exposed via `/api/v1/meta/kpis` |
| Auth/RBAC depth for MVP | Open | Security + Eng | 2026-02-27 | Placeholder auth middleware exists |
| Document inline format policy | Open | Product + Security | 2026-02-26 | Allowlist exists; final policy pending |
| Kanban launch mode (read-only/editable) | Open | Product + Delivery | 2026-02-25 | Default read-only, env-gated editable mode |
| Data retention window (30/90/180 days) | Open | Product + Ops | 2026-02-28 | Needed for storage projections |
| Capacity targets | Open | Eng + Ops | 2026-02-28 | Needed for load test definition |
