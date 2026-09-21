# PostPulse — LinkedIn + X live coach × TypeSafe Jev

Merged successor of `linkedin-post-analyzer` (PostIntel, :3300) and
`viral-post-analyzer` (Viral Potential, :3200), with a brand-new unified UI.
One composer, two platform brains, one backend.

## Run

```bash
cd postpulse
npm install
npm start
# open http://localhost:3400
```

Key lives only in `.env` (server side). Browser calls `/api/analyze`, `/api/compare`.

## New name + new UI

- **PostPulse** — warm paper editorial lab (Fraunces + Instrument Sans + JetBrains Mono),
  platform switch cards, big `/100` readout + pulse bar instead of the old ring gauges,
  unified tips / reach / history / raw-JSON deck. Nothing copied pixel-for-pixel.
- Platform switch changes the whole brain: goals, dims, examples, preview, limits.

## One request per judgment

`POST /api/analyze { text, platform: "linkedin" | "x", goal?, followers?, avgImpressions? }`

- `platform=linkedin` → state `{ post, goal, platform }`, questions:
  `post_type` **Choice** (story / contrarian / howto / company_news / hiring / milestone / advice / promo / other)
  + 8 × **Score** (hook, story, insight, readability, specific, authentic, cta, dwell)
  + 2 × **Noul** (`is_fluff` penalty ×12, `asks_question` bonus ×4).
  Composite: goal-weighted mean − fluff + question. Verdicts: Skip past / Solid / Standout / Top 1%.
- `platform=x` → state `{ post, goal, platform }`, questions:
  `post_type` **Choice** (launch / howto / list / take / story / question / joke / other)
  + 8 × **Score** (hook, feeling, repostable, fit, specific, fresh, clear, replies)
  + 3 × **Noul** guardrails (`is_rage_bait` −8, `is_ai_slop` −10, `is_ad` −6).
  Composite: goal-weighted mean − guardrails. Verdicts: Scroll past / Decent / Strong / Viral.

Goals: LinkedIn `reach / authority / leads`, X `growth / authority / leads` — weights live in code.

## Kept features (from both parents)

1. Goal presets reweight the composite in code.
2. LinkedIn “…see more” preview (~210 chars) + X first-line preview with thread hint.
3. Fluff detector (LinkedIn) / rage-bait + AI-slop + ad flags (X).
4. Local stats row — words, read time, paras, emojis, hashtags, questions.
5. Length meter — LinkedIn 90–220 word zone, X brevity/char meter.
6. Score history sparkline (session-only).
7. A/B compare tab — now platform-aware (`POST /api/compare { a, b, platform, goal, … }`).
8. Response cache keyed `platform::goal::text` (reach attached per request).
9. Offline fallback heuristics, clearly labelled.
10. Estimated views — followers (+ optional avg) → views range, upside, likes, multiplier.
    LinkedIn baseline = avg or followers × 12%; X = avg or followers × 10%.

## API

- `GET /api/config` → `{ model, hasKey, platforms: { linkedin: { label, maxChars, defaultGoal, goals, dims }, x: {...} } }`
- `POST /api/analyze` → `{ score, verdict, dims, tips, goal, platform, postType, fluff?, asksQuestion?, flags?, reach, latencyMs, model }`
- `POST /api/compare` → `{ a, b, winner, delta, platform }` (both sides carry `reach`)
