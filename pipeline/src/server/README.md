# Backend API (first slice)

A thin HTTP API + in-process job worker that wraps the pipeline engine so a
frontend can drive it: submit a job → poll status → get an mp4 URL. Reuses the
existing functions (`importScript`, `generateStoryboard`, `enrichStoryboard`,
`enrichStoryboardAssets`) and spawns the voiceover + Remotion-render CLIs.

## Run

```bash
cd pipeline
# optional auth: comma-separated keys. If unset, auth is DISABLED (dev mode).
API_KEYS=dev-key-123 PORT=8787 npm run serve
```

## Endpoints

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/jobs` | create a job → `202 { id, status }` |
| `GET`  | `/jobs/:id` | poll one job → `{ status, stage, progress, outputUrl, error }` |
| `GET`  | `/jobs` | list your jobs |
| `GET`  | `/outputs/:id.mp4` | stream the finished video (Range-enabled) |
| `GET`  | `/health` | liveness |

All `/jobs*` routes require `Authorization: Bearer <key>` when `API_KEYS` is set.

## Job modes

```jsonc
// render an already-enriched + voiced storyboard (no LLM/network needed)
{ "mode": "render", "storyboardId": "backlog-test", "captionStyle": "karaoke" }

// bring your own script → full pipeline (needs Gemini + network)
{ "mode": "import", "script": "<your prose>", "topic": "My Title", "thesis": "…" }

// topic → LLM writes the script → full pipeline (needs Gemini + network)
{ "mode": "generate", "topic": "How X happened", "thesis": "…" }

// bring your OWN narration recording instead of TTS (audioPath on the server).
// `script` optional — if omitted, the audio is transcribed (whisper).
{ "mode": "audio", "audioPath": "/abs/path/recording.mp3", "script": "<optional>", "topic": "…" }
```

`import`/`generate` run `… → voiceover(edge-tts) → enrich → assets → render`;
`audio` swaps voiceover for `align-audio` (whisper transcribe → align → per-scene
slices with accurate word timings); `render` skips straight to rendering.

> Word timings come from **whisper** (openai-whisper) aligned to the actual audio —
> far more accurate than edge-tts's sentence-boundary interpolation. The TTS path
> uses it too (`--no-whisper` on the voiceover CLI opts out).

## Example

```bash
curl -s -XPOST localhost:8787/jobs -H 'Authorization: Bearer dev-key-123' \
  -H 'Content-Type: application/json' \
  -d '{"mode":"render","storyboardId":"backlog-test"}'
# -> {"id":"<uuid>","status":"queued"}

curl -s localhost:8787/jobs/<uuid> -H 'Authorization: Bearer dev-key-123'
# -> {"status":"running","stage":"render","progress":0.9,...}
# when done: {"status":"succeeded","outputUrl":"/outputs/<uuid>.mp4"}
```

## This is a SCAFFOLD — production swaps

- **Worker**: single in-process FIFO (concurrency 1). → BullMQ/Redis + dedicated
  render workers, or **Remotion Lambda** for the render tier.
- **Store**: in-memory `Map` (lost on restart). → Postgres.
- **Auth**: API-key env list. → Clerk/Auth0/Supabase sessions + scoped keys.
- **Outputs**: local dir served by the API. → S3/R2 + CDN (pre-signed URLs).
- **Deps**: Gemini free tier / edge-tts / Nominatim are dev-grade — swap for paid,
  rate-limited-per-user services at scale.
