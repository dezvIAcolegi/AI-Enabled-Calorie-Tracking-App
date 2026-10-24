# Phase 0: Gemini Flash model check (24 Oct 2026)

10 photos through `gemini-3.5-flash` and `gemini-3.5-flash-lite`, both with `thinking_level="minimal"`,
images resized to 1024 px. Script: `phase0_model_check.py`; raw output: `phase0_results.json`.
No FDC matching and no weighed portions yet, so this checks detection, plausibility of grams and speed only.

Most photos are stock or web images (single products on white, no plate), not the meal test set. They
stay out of the repo. The Phase 1 test set needs our own photos with weighed portions.

## Decision

**`gemini-3.5-flash`, thinking `minimal`.** `gemini-3.5-flash-lite` as the fallback on 429/503.

| | 3.5-flash | 3.5-flash-lite |
|---|---|---|
| Time per photo | 1.4–2.5 s | 1.1–3.5 s |
| Sandwich | bread, ham, cheese, cucumber, cream cheese | same, but "mayonnaise" for the cream cheese |
| Ramen, spaghetti | split into noodles/broth/pork/…, sauce/pasta | one item each ("ramen noodle soup 600 g") |
| Whole bread loaf | 400 g (plausible) | 150 g (too low) |
| Two fried eggs | one item, 110 g | two items, 50 g each |

Other models tried on a text prompt: `gemini-3.8-flash` was correct but took 38–50 s even with thinking
`low` (no `minimal`), far over the 8 s target. `gemini-2.5-flash` is closed to new users.

## Findings for Phase 1

- **Free-tier quota is tight.** `3.5-flash` returned 429 after about 10 requests in a few minutes and
  worked again a minute later; `3.5-flash-lite` kept going. Needs retry with backoff, the lite fallback,
  caching, and recorded responses in unit tests.
- **503 "high demand"** also happened once on `3.5-flash`.
- **Gemini's `response_schema` rejects bounds** (`exclusiveMinimum` from Pydantic `gt=0`). Send a plain
  schema and validate bounds with Pydantic afterwards.
- **Grams without a scale reference are guesses.** The same cheese photo got 250 g and 450 g. Photos with
  a plate or cutlery look much more consistent. Supports the "reference object" improvement in Phase 2.
- **`mixed_dish` is set inconsistently** (sandwich yes on lite, no on flash; spaghetti flagged even when
  split). Needs a tighter definition in the prompt.
- **Counts get merged** (two tomatoes → one item of 180 g, two eggs → one item of 110 g). Fine for
  calories, but the app may want "2 × egg".
