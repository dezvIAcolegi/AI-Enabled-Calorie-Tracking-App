# /eval (accuracy notebooks for the course reports)

Python notebooks that run the AI endpoints against labelled test sets and report accuracy.

| Path | Owner | Test set | Reports |
|---|---|---|---|
| `meal/` | Sebi | Meal photos with weighed portions | Gram and kcal error |
| `label/` | Lucas | Label photos: blurry, curved, Romanian/English | Field accuracy |

Use only your own photos (Gemini free tier may use prompts). Each owner edits only their subfolder.

Board: when an eval run produces new numbers for a report, post a `DONE` tagging `@team` with the metric and the commit it ran on (rules in the root `CLAUDE.md`).
