# Accounting API conventions

How the accounting frontend talks to tvs-accounting-bk: hosts, headers, the response envelope, errors, lists and the
client-side cache. The rules here apply to every endpoint in [API_ENDPOINTS.md](./API_ENDPOINTS.md).

The platform-wide standards live in the tvs-accounting-bk repository and are not repeated here:
`docs/API_RESPONSE_FORMAT.md` (envelope), `docs/AUDIT_FIELDS.md` (the six audit fields) and `docs/RBAC_ROLES.md` (permission ids).
Where this document is more specific, it records what the frontend depends on.

## 1. Hosts and environments

| Variable | Used for | Default |
| --- | --- | --- |
| `NEXT_PUBLIC_USE_MOCK_API` | `"false"` switches to the real APIs; anything else runs the in-browser mock | mock |
| `NEXT_PUBLIC_BACKEND_ACCOUNTING_API_URL` | Accounting API host; the client appends `/api/v1` | required when not mocked |
| `NEXT_PUBLIC_BACKEND_TROVESUITE_CORE_API_URL` | Core Platform host (sign-up, login, OTP, organisations); `/api/v1` appended | required when not mocked |
| `NEXT_PUBLIC_APP_ID` | Sent as `app-id`; must equal `App:AppId` on the API | `app-accounting` |
| `NEXT_PUBLIC_FRONTEND_CORE_URL` | Where "Sign out" and expired sessions go; unset means this app's `/auth/login` | unset |

`.env.example` lists them. The browser calls the API directly, so the API must allow the frontend origin in CORS
(methods `GET, POST, PUT, DELETE`; headers `authorization, content-type, app-id, org-id, bus-id, loc-id`).

## 2. Request headers

Every accounting call carries:

| Header | Value | Source |
| --- | --- | --- |
| `authorization` | `Bearer {jwt}` | Core login (or the Core shell hand-off) |
| `app-id` | `app-accounting` | build config |
| `org-id` | Organisation id | Core shell hand-off, or resolved after login ([AUTH_AND_ONBOARDING.md](./AUTH_AND_ONBOARDING.md#3-choosing-the-organisation-business-and-location)) |
| `bus-id` | Business (legal entity) id | as above |
| `loc-id` | Location id | as above |
| `content-type` | `application/json` | on `POST` and `PUT` |

`tenant_id` and `user_id` are read from the JWT claims, never from a header or body. The API stamps `user_id` into the audit
fields and into `posted_by`, `approved_by`, `locked_by` and the audit trail.

## 3. URLs and methods

- `/api/v1/{resource}/{action}`, e.g. `GET /journals/list`, `POST /journals/add`, `PUT /journals/update`.
- Ids go in the query string as `{resource}_id` (`?journal_id=…`), never in the path.
- `GET` reads, `POST` creates or runs an action (`/journals/approve`, `/revaluations/run`), `PUT` updates, `DELETE` removes.
  There is no `PATCH`.
- `PUT` bodies contain only the fields to change unless the endpoint says otherwise (party updates send the whole record).
- JSON is snake_case both ways. Dates are `YYYY-MM-DD`, timestamps ISO 8601 UTC, money is a JSON number with two decimals,
  exchange rates are base currency per one unit of the foreign currency with four decimals. Use decimals, not floats, server side.

## 4. Response envelope

```json
{
  "success": true,
  "status_code": 201,
  "detail": "JE-2026-0042 posted",
  "error": null,
  "data": { "id": "je_…", "number": "JE-2026-0042", "status": "POSTED" },
  "field_errors": null,
  "pagination": null
}
```

- `data` holds the shape listed under **Returns** in [API_ENDPOINTS.md](./API_ENDPOINTS.md). Deletes and voids return `data: null`.
- `detail` is shown to the user as a toast after every write, so it is user-facing copy. The expected messages are listed per
  operation in [PROCESSING_RULES.md](./PROCESSING_RULES.md). When there is nothing to say, return `"Success"`; the client hides it.
- `status_code` must equal the HTTP status.

## 5. Errors

```json
{
  "success": false,
  "status_code": 400,
  "detail": "Debits (GH₵ 1,200.00) and credits (GH₵ 1,185.00) differ by GH₵ 15.00.",
  "error": "VALIDATION_FAILED",
  "data": null,
  "field_errors": null,
  "pagination": null
}
```

The client shows `detail`, falls back to the joined `field_errors` values, then to `error`. A business-rule failure must
therefore put its message in `detail` even when it also fills `field_errors`.

| Status | `error` | When | Client behaviour |
| --- | --- | --- | --- |
| 400 | `MISSING_HEADER`, `INVALID_APP_ID` | A Trove header is missing, or `app-id` is wrong (`field_errors` names the header) | error message |
| 400 | `VALIDATION_FAILED` | Bad JSON, missing query parameter, or a business rule failed | error message; form stays open |
| 401 | `UNAUTHORIZED`, `TOKEN_EXPIRED` | No, bad or expired token | session cleared, back to login |
| 403 | `FORBIDDEN` (invalid platform context), permission errors | Not allowed | error message |
| 404 | `NOT_FOUND` | Unknown route or record | error message |
| 409 | `ORGANISATION_NOT_SET_UP` | Tenant has not completed `POST /organisation/setup` | routes to `/onboarding` |
| 500 | `INTERNAL_ERROR` | Anything unexpected | "The books could not be loaded" screen or error toast |

The order in which the checks run, and the exact messages, are in
[PROCESSING_RULES.md §1.2](./PROCESSING_RULES.md#12-request-pipeline-and-error-mapping). Validation is first-failure: return the
first rule that fails, in the documented order.

## 6. Lists and pagination

Every `/list` endpoint takes:

| Parameter | Meaning |
| --- | --- |
| `page` | 1-based, default 1 |
| `size` | default 20, maximum 500 |
| `sort_by`, `sort_order` | any field; `asc` or `desc` |
| `search` | case-insensitive free text over the fields named per module |
| module filters | equality on a field (`status`, `customer_id`, `is_active`, …); `from_date` / `to_date` are inclusive bounds on the list's date |

```json
{
  "success": true,
  "status_code": 200,
  "detail": "Success",
  "data": { "items": [ { "id": "acc_1000" } ] },
  "pagination": { "page": 1, "size": 500, "total": 742, "has_next": true }
}
```

The client loads each collection in full by requesting `size=500` and following `has_next`, so `size=500` must be accepted
and `has_next` must be accurate.

## 7. How the client caches

The frontend keeps a copy of each collection listed under `COLLECTIONS` in `src/services/catalogue.ts` (accounts, journals,
invoices, …) plus the organisation settings. After a successful write it reloads the collections the endpoint lists under
**Client reloads after success**. Two consequences for the API:

- A write must be fully committed before it responds. The reload follows immediately and must see the change.
- A write that changes rows in other collections (posting an invoice creates a journal; a receipt updates the invoice's
  `amount_paid`) must do so in the same transaction. The reload list in the catalogue is the frontend's view of which
  collections a write touches; if the API touches more, tell us and we add them.

Reports (`/reports/*`) and previews (`GET /revaluations/preview`) are fetched on demand, not cached.

## 8. The mock backend

Until the API is live, a service worker (MSW) answers every `/api/v1` call in the browser:

| File | Role |
| --- | --- |
| `src/services/catalogue.ts` | The endpoint contract. [API_ENDPOINTS.md](./API_ENDPOINTS.md) is generated from it |
| `src/mock/api/worker.ts` | Header checks, tenant lookup, setup gate, envelope |
| `src/mock/api/routes.ts` | One handler per endpoint |
| `src/mock/api/engine.ts` | Business rules: the reference for [PROCESSING_RULES.md](./PROCESSING_RULES.md) |
| `src/mock/api/core.ts` | Stand-in for the Core Platform `/landingpage` routes |
| `src/mock/api/db.ts` | One set of books per tenant in `localStorage` |

To run the frontend against a real API, set `NEXT_PUBLIC_USE_MOCK_API=false` and the two host variables. Nothing else changes:
the screens only call `src/core/apiClient.ts`, which sends the same requests to whichever host is configured. With the mock
running, the browser's network tab shows every request and response exactly as the real API should produce them.

## 9. Keeping the contract in step

1. Change `src/services/catalogue.ts` (and the mock handler in `src/mock/api/routes.ts`).
2. Run `npm run docs:api` to regenerate [API_ENDPOINTS.md](./API_ENDPOINTS.md).
3. `npm run docs:api -- --check` fails when the generated file is stale, when the catalogue lists an endpoint the mock does
   not serve, or when the mock serves an endpoint the catalogue does not list. Run it in CI.
