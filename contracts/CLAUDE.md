# /contracts

The shared source of truth for all four roles. **Read-only for every Claude session.** If a change is needed, write a proposal for the user to raise with the team. Changes merge only through a PR approved by all four.

| Path | Contents | Owner |
|---|---|---|
| `db/` | SQL migrations for every table | Kevin |
| `ai/` | JSON schemas: ingredient item, label result | Sebi & Lucas |
| `fixtures/` | Sample responses that validate against `ai/`; the AI stubs return them and the app builds against them. Food ids and macros are illustrative, not checked against FDC | Sebi & Lucas |
| `openapi.yaml` | AI service spec: `POST /meal/photo`, `POST /meal/text`, `POST /label/read`, `GET /foods/search` | All |
| `ts/api.ts` | **Generated** from `openapi.yaml`; never edit by hand | All |
| `ts/macros.ts` | The single macro function (`per_100g × grams / 100`) | Lucas |

CI checks that the FastAPI-generated OpenAPI matches `openapi.yaml` and type-checks the app against `ts/`. If you change the spec, regenerate `api.ts` and update the AI service in the same PR.
