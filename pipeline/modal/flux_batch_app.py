# Batched FLUX.1-dev endpoint for Modal — the version that actually saves credits.
#
# WHY THIS SAVES MONEY (vs. the single-prompt endpoint):
#   Modal bills per GPU-second of container runtime. This endpoint accepts a LIST
#   of prompts and runs them as ONE batched forward pass on a SINGLE warm L40S:
#     • one cold start amortized over N images (not N cold starts), and
#     • better GPU utilization per step (a 2–4 batch is more efficient than 2–4
#       separate batch-1 runs), so cost-per-image drops — modestly for a 12B model
#       at high res, more at lower res / fewer steps.
#   Firing N concurrent requests at the OLD single endpoint does the opposite:
#   Modal scales out to N containers (N GPUs, each cold-starting) = more cost.
#
# DEPLOY (you do this — Claude never handles your Modal secrets):
#   pip install modal && modal setup
#   modal deploy pipeline/modal/flux_batch_app.py
#   # copy the printed web URL, then in pipeline/.env:
#   #   FLUX_BATCH_ENDPOINT=https://<you>--flux-batch-generate.modal.run
#   # (FLUX_MODAL_KEY / FLUX_MODAL_SECRET stay the same proxy-auth tokens.)
#
# The pipeline's flux.ts generateFluxImages() will then send prompts here in
# chunks of `batchSize` (default 3). Leave FLUX_BATCH_ENDPOINT unset to keep using
# the single-image endpoint.

import base64
import io
import os

import modal

MODEL = "black-forest-labs/FLUX.1-dev"

image = (
    modal.Image.debian_slim(python_version="3.11")
    .pip_install(
        "torch==2.4.0",
        "diffusers==0.31.0",
        "transformers==4.44.2",
        "accelerate==0.34.2",
        "sentencepiece",
        "protobuf",
        "fastapi[standard]",
    )
    # FLUX.1-dev is gated on HuggingFace — set this secret in the Modal dashboard
    # (Secrets → new "huggingface-secret" with HF_TOKEN=...). Same token you used
    # for the single-prompt app.
    .env({"HF_HUB_ENABLE_HF_TRANSFER": "1"})
)

app = modal.App("flux-batch", image=image)


@app.cls(
    gpu="L40S",
    # Keep the model loaded between requests so back-to-back generations in one
    # pipeline run reuse the warm container (one cold start total). 300s idle then
    # scale to zero so you pay nothing when not generating. Set min_containers=1
    # only if you generate often enough that always-warm beats per-run cold starts.
    scaledown_window=300,
    secrets=[modal.Secret.from_name("huggingface-secret")],
    timeout=600,
)
class FluxBatch:
    @modal.enter()
    def load(self):
        import torch
        from diffusers import FluxPipeline

        self.pipe = FluxPipeline.from_pretrained(
            MODEL, torch_dtype=torch.bfloat16, token=os.environ.get("HF_TOKEN")
        ).to("cuda")

    @modal.fastapi_endpoint(method="POST", requires_proxy_auth=True)
    def generate(self, payload: dict):
        """POST { prompts:[...], width, height, steps, guidance } -> { images:[b64png] }.

        `prompts` is generated in ONE batched pass. Keep the list small (~2–4 at
        1536×864) so it fits the L40S's 48 GB — the client already chunks by
        `batchSize`, so this just processes whatever list it receives.
        """
        import torch

        prompts = payload.get("prompts") or []
        if not prompts:
            return {"images": []}

        width = int(payload.get("width", 1536))
        height = int(payload.get("height", 864))
        steps = int(payload.get("steps", 28))
        guidance = float(payload.get("guidance", 3.5))

        result = self.pipe(
            prompt=prompts,  # a list -> batched generation
            width=width,
            height=height,
            num_inference_steps=steps,
            guidance_scale=guidance,
            generator=torch.Generator("cuda").manual_seed(0),
        )

        images_b64 = []
        for img in result.images:
            buf = io.BytesIO()
            img.save(buf, format="PNG")
            images_b64.append(base64.b64encode(buf.getvalue()).decode("ascii"))
        return {"images": images_b64}
