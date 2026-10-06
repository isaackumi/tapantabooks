# Accounting frontend: backend integration guide

These documents are the contract between this frontend and **tvs-accounting-bk**. The frontend already runs end to end on an
in-browser mock of the API, and the mock enforces the rules described here. When the real API behaves the same way, switching
over is a configuration change (`NEXT_PUBLIC_USE_MOCK_API=false`).

| Document | Read it for |
| --- | --- |
| [AUTH_AND_ONBOARDING.md](./AUTH_AND_ONBOARDING.md) | Sign-up, login, OTP and first-run setup; which parts are Core Platform and which are Accounting; base currency |
| [API_CONVENTIONS.md](./API_CONVENTIONS.md) | Hosts, headers, envelope, error codes, pagination, how the client caches, the mock |
| [API_ENDPOINTS.md](./API_ENDPOINTS.md) | Every endpoint: method, path, query parameters, body, response, permission (generated) |
| [DATA_MODEL.md](./DATA_MODEL.md) | Every entity and request body, field by field, with suggested tables |
| [PROCESSING_RULES.md](./PROCESSING_RULES.md) | What each write must validate and do: messages, journals posted, audit events, report maths |

**Suggested reading order:** this page, API_CONVENTIONS, AUTH_AND_ONBOARDING, then API_ENDPOINTS and DATA_MODEL side by side
while implementing each module, with PROCESSING_RULES for the module's writes.

## Where the truth lives

| Question | Source | Doc generated or written from it |
| --- | --- | --- |
| Which endpoints exist and what they take | `src/services/catalogue.ts` | API_ENDPOINTS.md (`npm run docs:api`) |
| What a write must check and do | `src/mock/api/engine.ts` | PROCESSING_RULES.md |
| Field names and types | `src/models/accounting.ts` | DATA_MODEL.md |
| Status codes and error codes | `src/mock/api/worker.ts`, `src/mock/api/http.ts` | API_CONVENTIONS.md, PROCESSING_RULES.md §1.2 |
| Core sign-up and login behaviour | tvs-coreplatform-bk `src/entities/landingpage` | AUTH_AND_ONBOARDING.md |

If a document and the code disagree, the code is right and the document needs fixing. Raise anything in the API that should
behave differently from the mock as a change to both.

## Open questions

Each document ends with the decisions it needs from backend:
[auth and onboarding](./AUTH_AND_ONBOARDING.md#7-open-questions-for-core-and-backend) and
[processing rules](./PROCESSING_RULES.md#18-open-questions-for-backend). The processing rules also list
[mock shortcuts the API must not copy](./PROCESSING_RULES.md#19-mock-simplifications-the-api-must-not-copy).

## Trying it

```bash
npm install
npm run dev            # http://localhost:3005, mock backend
```

Sign in with **Continue with the demo company**, or create an account at `/auth/sign-up` to go through the new-company flow
(every one-time code in the mock is `123456`). The browser's network tab shows each request and response exactly as the real
API should produce them.

To point at real services, copy `.env.example` to `.env.local` and set the hosts.
