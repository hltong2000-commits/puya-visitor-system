# CloudBase Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deploy the PUYA visitor system to Tencent CloudBase with same-origin static hosting, an HTTP API, CloudBase PostgreSQL via `rdb()`, and a visible registration receipt.

**Architecture:** Keep local SQLite for development and the existing `pg` adapter only as a Vercel/Neon rollback path. Move HTTP-layer SQL behind a shared domain database interface. Use `@cloudbase/node-sdk` with `TCB_ENV_ID` and `CLOUDBASE_APIKEY` for production; initialize the empty schema once via CLI, never during function startup.

**Tech Stack:** Node.js 20, `node:http`, `node:test`, SQLite, `pg`, `@cloudbase/node-sdk`, Tencent CloudBase, Obsidian Markdown.

---

## File Map

- `db.js`: adapter selection and SQLite, rollback PostgreSQL, and CloudBase domain adapters.
- `server.js`: API routes calling domain methods, with no SQL strings.
- `test-server.js`: HTTP regression tests and fake-`rdb()` adapter tests.
- `cloudbase/schema.sql`: repeatable one-time PostgreSQL schema/index creation.
- `package.json`, `package-lock.json`: CloudBase SDK dependency.
- `cloudbaserc.json`: CloudBase function variables, static hosting, and gateway routes.
- `.env.example`, `.gitignore`: secret-safe deployment variable documentation.
- `README.md` and Obsidian notes: synchronized architecture, operations, and acceptance records.
- `public/assets/visitor-registration-qr.png`: regenerate only after final HTTPS/WeChat verification.

No intermediate commits or pushes; create one final verified commit on `main`.

### Task 1: Define and Test the Storage Contract

**Files:** `db.js`, `test-server.js`

- [ ] Export `databaseMode(env)` with this precedence: CloudBase when either `TCB_ENV_ID` or `CLOUDBASE_APIKEY` is present (and fail if the pair is incomplete); otherwise PostgreSQL when `DATABASE_URL` or any `PG*` field is present; otherwise SQLite outside production; production without a backend throws.
- [ ] Require every adapter to implement `kind`, `init`, `findAdmin`, `createAdmin`, `updateAdminPassword`, `findRecentVisitor`, `createVisitor`, `listVisitors`, `exportVisitors`, `findVisitorById`, `updateVisitorStatus`, and `createAuditLog`.
- [ ] Add tests for adapter selection, method presence, and fake CloudBase calls; run `node --test --test-name-pattern="databaseMode|CloudBase adapter" test-server.js` before implementation to observe expected failures.

### Task 2: Implement Adapters

**Files:** `db.js`, `package.json`, `package-lock.json`, `test-server.js`

- [x] Install `@cloudbase/node-sdk`.
- [x] Implement SQLite methods with the existing parameterized SQL and local DDL.
- [x] Keep the `pg` adapter parameterized and rollback-only; its `init()` performs `SELECT 1` and no DDL.
- [x] Implement CloudBase initialization with `cloudbase.init({ env: TCB_ENV_ID, accessKey: CLOUDBASE_APIKEY })` and structured `rdb()` operations (`select`, `insert`, `update`, `eq`, `gte`, `lt`, `or`, `order`, `range`, `maybeSingle`). Propagate SDK errors and escape keyword filter metacharacters.
- [x] Verify fake-client calls cover insert, duplicate lookup, filtered count/pagination, detail, update, and error propagation. Run focused tests and `npm test`.

### Task 3: Replace SQL in the HTTP Layer

**Files:** `server.js`, `test-server.js`

- [x] Map startup/login, duplicate detection, registration, list/count, CSV export, detail, status update, and audit logging to the shared database methods.
- [x] Change the failure test to throw from `db.createVisitor` and assert HTTP 500 without a receipt.
- [x] Run `npm test` and `rg -n "SELECT|INSERT|UPDATE" server.js`; the search must return no SQL.

### Task 4: Add CloudBase Schema and Deployment Variables

**Files:** `cloudbase/schema.sql`, `cloudbaserc.json`, `.env.example`, `.gitignore`

- [x] Create repeatable PostgreSQL DDL for `visitors`, `admin_users`, `audit_logs`, and existing indexes; include no credentials or seed password.
- [x] CloudBase function variables must be only `NODE_ENV`, `ADMIN_PASSWORD`, `TCB_ENV_ID`, and `CLOUDBASE_APIKEY`; do not inject `DATABASE_URL` or `PG*` into CloudBase.
- [ ] Keep Neon variables documented only under an explicit rollback section; keep `.env.local` ignored.
- [ ] Validate JSON, ignore rules, and `git diff --check`.

### Task 5: Synchronize Knowledge Base

**Files:** `README.md`, `01-业务方案/访客登记业务流程.md`, `02-产品设计/H5登记页设计.md`, `03-技术方案/系统架构.md`, `03-技术方案/部署与运维.md`, `05-实施路线/验收标准.md`, `docs/superpowers/specs/2026-08-28-visitor-system-design.md`

- [ ] State consistently that successful registration displays eight fields (including full mobile) and completes without front-desk/employee confirmation; receipt is current-page only.
- [ ] Record active flow: WeChat/mobile browser -> CloudBase static hosting -> same-origin `/api` gateway -> Node HTTP function -> CloudBase SDK `rdb()` -> PostgreSQL. Mark Vercel/Neon rollback and SQLite local-only.
- [ ] Document Shanghai region, variable names, one-time schema command, validation/deploy commands, health/browser/WeChat checks, and secret handling without values.
- [ ] Scan for contradictory phrases such as front-desk instructions or CloudBase `PG*` direct-connect assumptions.

### Task 6: Live CloudBase Acceptance

**Files:** ignored `.env.local`; later QR/docs updates

- [ ] Run local tests, `tcb validate --json`, diff check, and credential-pattern scan.
- [ ] Ask for explicit confirmation immediately before creating the persistent CloudBase API Key; store it only in `.env.local` and function settings.
- [ ] Execute `cloudbase/schema.sql` once via CLI, deploy function/hosting/gateway, and verify `/api/health` reports CloudBase PostgreSQL.
- [ ] Submit a unique integration record, verify the eight-field receipt and authenticated admin query, then generate/decode-check the fixed QR from the final HTTPS URL and test it in WeChat.
- [ ] Record only the verified URL/date in the knowledge base.

### Task 7: Final Single Commit and Push

- [ ] Run `npm test`, CloudBase validation, diff/secret scans, and review the exact diff.
- [ ] Stage only related files, confirm `scf_bootstrap` mode `100755`, and ensure `.env.local` is unstaged.
- [ ] Create one commit `feat: migrate visitor system to CloudBase`, push normally to `origin main`, and confirm a clean branch.
