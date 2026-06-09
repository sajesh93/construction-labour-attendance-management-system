# Phase 5 — Admin Panel Architecture (Next.js)

Next.js (App Router) · TypeScript · Material UI (MUI v6). Used by Super Admin and
Site Admin for management; Supervisors get read/summary views.

## 1. Project Structure
```
admin/
├── app/
│   ├── (auth)/login/
│   ├── (dashboard)/
│   │   ├── layout.tsx              # shell: nav, role-aware menu, org/site switcher
│   │   ├── page.tsx                # dashboard KPIs
│   │   ├── organizations/
│   │   ├── sites/[id]/(settings|shifts|devices)/
│   │   ├── vendors/
│   │   ├── workers/[id]/
│   │   ├── attendance/             # daily/active views
│   │   ├── corrections/            # approval queue
│   │   ├── reports/
│   │   ├── audit/
│   │   └── users/
│   └── api/                        # route handlers (BFF: token refresh, signed-url proxy)
├── lib/
│   ├── api/                        # generated OpenAPI client + typed fetchers
│   ├── auth/                       # session (httpOnly cookie), RBAC helpers
│   ├── query/                      # TanStack Query setup
│   └── rbac/                       # permission gates
├── components/                     # MUI-based design system wrappers
└── theme/                          # M3-aligned MUI theme, light/dark
```

## 2. Rendering & Data
- **Server Components** for initial data fetch (lists, detail pages) using the
  caller's session; **client components** for interactive tables, forms, dialogs.
- **TanStack Query** on the client for mutations + cache invalidation.
- API client generated from the backend `openapi.json` → end-to-end types.

## 3. Auth & Session
- Login posts to backend `/auth/login`; tokens stored in **httpOnly, secure,
  sameSite cookies** (access + refresh). The browser never sees raw tokens in JS.
- A Next.js **route handler / middleware** refreshes the access token using the
  refresh cookie when expired (rotation handled server-side).
- `middleware.ts` guards `(dashboard)` routes; unauthenticated → `/login`.

## 4. RBAC in the UI
- Permission set returned by `/auth/me` drives menu visibility and action gating.
- Server-side enforcement is authoritative; UI gating is UX only.
- Scope-aware: Site Admin sees only assigned sites (org/site switcher filtered);
  Supervisor sees read-only attendance + summaries, can open correction requests.

## 5. Key Screens
| Screen | Capabilities |
|---|---|
| Dashboard | KPIs: present today, open sessions, pending corrections, late arrivals |
| Organizations | CRUD (Super Admin) |
| Sites | CRUD, **settings editor** (verification mode, countdown, cooldown, geo toggle+radius, photo policy+pct), shifts (incl. overnight), devices authorize/revoke |
| Vendors | CRUD |
| Workers | List w/ search & filters; profile editor; photo upload; credential (NFC UID/QR) binding; site assignment; exit/rehire; Aadhaar shown masked, reveal gated + audited |
| Attendance | Daily grid per site; live active sessions; cross-site flags |
| Corrections | Approval queue: view diff (old→proposed), approve/reject with notes; nothing changes until approved |
| Reports | Build report (type/format/range), async job status, download signed link |
| Audit | Filterable immutable trail with old/new value diff viewer |
| Users | Manage admins/supervisors/watchmen; assign site scopes |

## 6. Forms & Validation
- `react-hook-form` + `zod` schemas mirroring backend validation; server remains
  the source of truth (handles 422 problem+json, maps field errors back to form).

## 7. Security
- httpOnly cookies, CSRF protection on mutations (double-submit token or
  same-site + custom header), CSP/HSTS headers, no secrets in client bundle.
- Signed download URLs for report exports proxied through a route handler.
- Sensitive reveals (Aadhaar) require explicit action → backend logs an audit read.

## 8. Testing (admin)
- **Unit**: rbac gates, form schemas, fetchers (Vitest/Jest).
- **Component**: key forms/dialogs (Testing Library).
- **E2E**: Playwright — login, create worker, edit site settings, approve a
  correction (verify attendance changes only after approval), generate a report.
- Target 80%+ on lib + critical flows.
