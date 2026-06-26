# Frame

**Turn a script, a topic, or your own voice into a finished faceless documentary — and review only the few choices that are actually yours to make.**

Frame is an automated documentary video pipeline with a guided studio on top. You bring narration; Frame writes (or imports) the script, voices it, composes motion-graphics scenes, sources real archival footage and images, burns in word-synced captions, and renders a finished video. The studio walks you through a short review — script, visuals, captions — and then renders.

The pipeline is **structured-JSON first**: the LLM only ever emits a storyboard (scene types + data). Deterministic [Remotion](https://www.remotion.dev/) components render that storyboard. The model never writes render code, so output is consistent and the prebuilt scene library is the moat.

---

## How it works

```
script / topic / audio
        │
        ▼
   ┌─────────────────────────── prepare ───────────────────────────┐
   │  import/generate   →   voiceover   →   enrich   →   assets     │
   │  (script→storyboard)   (TTS + word    (LLM picks    (fetch real │
   │                         timings, or    scene types   footage/   │
   │                         your audio)    + data)        images,    │
   │                                                       or FLUX)    │
   └───────────────────────────────────────────────────────────────┘
        │
        ▼
   review  →  Script · Visuals · Captions   (the studio)
        │
        ▼
   render (Remotion)  →  MP4
```

- **Scenes are a library, not freeform.** The model classifies each beat into a prebuilt scene type — map, globe, timeline, stat/chart, quote, title, archival photo, newspaper, document, video/B-roll — and fills in its data. Each type is a deterministic Remotion component.
- **Visuals are real.** Images and footage are searched from Wikimedia Commons and the Internet Archive (license-checked), vision-verified for relevance, and only AI-generated (via self-hosted FLUX) when no real source exists.
- **Captions are word-synced.** Word-level timings come from Whisper (aligned to the known script), so captions track the voice precisely — including when you bring your own narration.
- **Prepare is resumable.** Each step is checkpointed; if a step fails (e.g. a transient model error), a retry resumes from the last completed step instead of redoing everything.

## Repository layout

| Path | What it is |
|------|------------|
| `pipeline/` | Node/TypeScript engine — script import/generation, enrichment, asset sourcing, voiceover, the HTTP API + job queue (`src/server`), and CLIs (`src/cli`). |
| `remotion/` | The Remotion project — one deterministic component per scene type, rendered from a storyboard. |
| `studio/` | Vite + React review studio (the wizard UI). Talks to the pipeline API. |
| `pipeline/modal/` | Optional self-hosted FLUX.1-dev image endpoints (deploy to Modal). |

## Prerequisites

- **Node.js 18+** (pipeline, studio, and Remotion).
- **ffmpeg / ffprobe** on your `PATH` (audio slicing, frame sampling).
- **Python 3.9+** with **[`openai-whisper`](https://github.com/openai/whisper)** and **[`edge-tts`](https://github.com/rany2/edge-tts)** for word timings and text-to-speech. A CUDA GPU makes Whisper ~10× faster but isn't required.
- A **Google AI Studio (Gemini) API key** for script generation, enrichment, and vision verification — [get one here](https://aistudio.google.com/apikey).
- *(Optional)* A **Modal** account if you want AI-generated images via FLUX.1-dev.

## Setup

```bash
git clone https://github.com/Ahmad-ARK/Frame.git
cd Frame

# 1. Configure secrets
cp pipeline/.env.example pipeline/.env
#   then edit pipeline/.env and add your GEMINI_API_KEY (FLUX_* are optional)

# 2. Install dependencies
( cd pipeline  && npm install )
( cd remotion  && npm install )
( cd studio    && npm install )

# 3. Python tools (one-time)
pip install openai-whisper edge-tts
```

## Running

Two processes — the pipeline API and the studio.

```bash
# Terminal 1 — pipeline API (http://localhost:8787)
cd pipeline && npm run serve

# Terminal 2 — studio (http://localhost:5173)
cd studio && npm run dev
```

Open **http://localhost:5173**. Start a new film from a script (or topic, or your own audio), review the script → visuals → captions, then render. Films process in the background and appear in the Library when ready.

> The studio proxies `/api/*` to the pipeline on port 8787 (see `studio/vite.config.ts`), so there's no CORS to configure.

### Using the CLIs directly (advanced)

The pipeline stages are also runnable on their own from `pipeline/`:

```bash
npm run generate -- "your topic"        # topic → storyboard
npm run import    -- script.txt         # your script → storyboard
npm run voiceover -- <storyboard.json>  # TTS + word timings
npm run enrich    -- <storyboard.json>  # LLM scene composition
npm run assets    -- <storyboard.json>  # fetch real footage/images
npm run audio     -- <storyboard.json> recording.mp3   # bring your own narration
```

## Configuration

All secrets live in `pipeline/.env` (git-ignored). See `pipeline/.env.example`:

| Variable | Required | Purpose |
|----------|----------|---------|
| `GEMINI_API_KEY` | yes | Script generation, enrichment, vision verification. |
| `GEMINI_MODEL` | no | Override the default model. |
| `FLUX_MODAL_KEY` / `FLUX_MODAL_SECRET` | for AI images | Modal proxy-auth tokens. |
| `FLUX_ENDPOINT` | for AI images | Your Modal single-image endpoint URL. |
| `FLUX_BATCH_ENDPOINT` | optional | Batched FLUX endpoint (see `pipeline/modal/README.md`) — cheaper for many images. |

Server-side options (set in the environment when running `npm run serve`): `PORT` (default 8787), `API_KEYS` (comma-separated bearer keys; unset = open dev mode), `WHISPER_MODEL` (default `small`), `LOG_LEVEL`.

## Notes

- **Bring-your-own-voice.** Upload a narration recording and Frame transcribes it, aligns it to the script, slices it per scene, and captions it — no TTS.
- **Costs.** Gemini's free tier is rate-limited; heavy use needs a paid key. FLUX runs on your own Modal GPU (scale-to-zero); see `pipeline/modal/README.md` for batching to keep costs down.
- **Output.** Rendered MP4s land in `pipeline/out/server-outputs/` and are served by the API; intermediate artifacts (storyboards, prepared work, downloaded media) are git-ignored and regenerable.
