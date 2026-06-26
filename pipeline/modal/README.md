# Modal FLUX endpoints

The pipeline generates `genImage` stills with FLUX.1-dev hosted on Modal.

## Two endpoints

| Env var | Endpoint | Used by | Cost behaviour |
|---|---|---|---|
| `FLUX_ENDPOINT` | single-prompt (your existing app) | `generateFluxImage()` | one image per request |
| `FLUX_BATCH_ENDPOINT` | `flux_batch_app.py` (this folder) | `generateFluxImages()` | N prompts per request on **one warm L40S** |

`generateFluxImages()` automatically prefers the batch endpoint when
`FLUX_BATCH_ENDPOINT` is set, sending prompts in chunks of `batchSize` (default 3).
If it's unset, it falls back to the single endpoint at `fluxConcurrency` (default
**1** — one warm container, back-to-back, so the fallback never *increases* cost).

## Why batching is the real saving

Modal bills **per GPU-second of container runtime**, and the container is
scale-to-zero (you pay nothing while idle). The waste is the **cold start**: each
call to a cold container reloads the 12B model into the GPU — GPU-seconds you pay
for that produce no image.

- **Batch endpoint:** N prompts → one container, one cold start, one batched
  forward pass. Cost-per-image drops by amortizing the cold start and improving
  GPU utilisation (more so at lower res / fewer steps; modestly for 12B at
  1536×864, where the GPU is already fairly saturated).
- **Concurrent requests to the *single* endpoint:** Modal scales out to one L40S
  **per** request, each cold-starting → *more* cost, just faster. That's why the
  client default for the fallback is concurrency 1.

VRAM: the L40S has 48 GB; FLUX weights take ~24 GB, so a batch of ~2–4 at
1536×864 fits. That's the `batchSize` ceiling.

Other cost knobs (no code change): drop `steps` 28→20, keep resolution sane,
`scaledown_window` to balance warm-reuse vs idle cost (set `min_containers=1` only
if you generate often enough that always-warm beats per-run cold starts).

## Deploy

You run this (Claude never handles your Modal/HF secrets):

```bash
pip install modal && modal setup
modal deploy pipeline/modal/flux_batch_app.py
```

Then in `pipeline/.env`:

```
FLUX_BATCH_ENDPOINT=https://<you>--flux-batch-generate.modal.run
# FLUX_MODAL_KEY / FLUX_MODAL_SECRET stay the same proxy-auth tokens
```

FLUX.1-dev is gated on HuggingFace — add a Modal secret named `huggingface-secret`
with `HF_TOKEN=...` (same token as your single-prompt app).

Notes:
- `@modal.fastapi_endpoint(requires_proxy_auth=True)` requires a recent Modal
  (`pip install -U modal`). On older versions use `@modal.web_endpoint(...)` and
  configure proxy auth in the dashboard — the decorator name is the only change.
