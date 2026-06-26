# Self-hosted Qwen2.5-VL endpoint on Modal — replaces Gemini for BOTH the
# pipeline's LLM work (script import, scene enrichment) AND its vision work
# (verifying that fetched footage/images actually depict the subject). One model
# does both because Qwen2.5-VL is a vision-language model.
#
# WHY: removes the Gemini free-tier 20-requests/day cap and the external billing
# dependency. You pay Modal GPU-seconds (scale-to-zero), nothing when idle.
#
# DEPLOY (you do this — Claude never handles your Modal secrets):
#   pip install modal && modal setup
#   modal deploy pipeline/modal/qwen_vl_app.py
#   # copy the printed URL, then in pipeline/.env:
#   #   LLM_PROVIDER=qwen
#   #   QWEN_ENDPOINT=https://<you>--qwen-vl-generate.modal.run
#   #   (FLUX_MODAL_KEY / FLUX_MODAL_SECRET are reused as the proxy-auth tokens)
#
# Qwen2.5-VL-7B-Instruct is Apache-2.0 (NOT gated) so no HuggingFace token needed.
# For higher quality at more GPU cost, switch MODEL to "Qwen/Qwen2.5-VL-32B-Instruct"
# (use an AWQ build + a bigger GPU, or it won't fit one L40S).

import base64
import os

import modal

MODEL = os.environ.get("QWEN_MODEL", "Qwen/Qwen2.5-VL-7B-Instruct")

image = (
    modal.Image.debian_slim(python_version="3.11")
    .pip_install(
        "torch==2.5.1",
        "transformers==4.49.0",   # Qwen2.5-VL support landed here
        "accelerate==1.3.0",
        "qwen-vl-utils==0.0.8",
        "pillow",
        "fastapi[standard]",
    )
    .env({"HF_HUB_ENABLE_HF_TRANSFER": "1"})
)

app = modal.App("qwen-vl", image=image)


@app.cls(
    gpu="L40S",            # 7B fits comfortably; A10G (24GB) also works and is cheaper
    scaledown_window=300,  # stay warm 5 min between calls, then scale to zero
    timeout=600,
)
class QwenVL:
    @modal.enter()
    def load(self):
        import torch
        from transformers import AutoProcessor, Qwen2_5_VLForConditionalGeneration

        self.torch = torch
        self.model = Qwen2_5_VLForConditionalGeneration.from_pretrained(
            MODEL, torch_dtype="auto", device_map="auto"
        )
        self.processor = AutoProcessor.from_pretrained(MODEL)

    @modal.fastapi_endpoint(method="POST", requires_proxy_auth=True)
    def generate(self, payload: dict):
        """POST { system, user, images?:[{data:b64, mimeType}], temperature?, max_tokens? }
        -> { text }. `text` is the model's raw output (the pipeline parses JSON)."""
        from qwen_vl_utils import process_vision_info

        system = payload.get("system") or ""
        user = payload.get("user") or ""
        images = payload.get("images") or []
        temperature = float(payload.get("temperature", 0.2))
        max_tokens = int(payload.get("max_tokens", 4096))

        content = []
        for img in images:
            data, mime = img.get("data"), img.get("mimeType", "image/jpeg")
            if data:
                content.append({"type": "image", "image": f"data:{mime};base64,{data}"})
        content.append({"type": "text", "text": user})

        messages = []
        if system:
            messages.append({"role": "system", "content": system})
        messages.append({"role": "user", "content": content})

        text = self.processor.apply_chat_template(messages, tokenize=False, add_generation_prompt=True)
        image_inputs, video_inputs = process_vision_info(messages)
        inputs = self.processor(
            text=[text], images=image_inputs or None, videos=video_inputs or None,
            padding=True, return_tensors="pt",
        ).to(self.model.device)

        gen_kwargs = {"max_new_tokens": max_tokens}
        if temperature and temperature > 0:
            gen_kwargs.update(do_sample=True, temperature=temperature)
        else:
            gen_kwargs.update(do_sample=False)

        with self.torch.no_grad():
            generated = self.model.generate(**inputs, **gen_kwargs)
        trimmed = [out[len(inp):] for inp, out in zip(inputs.input_ids, generated)]
        out_text = self.processor.batch_decode(
            trimmed, skip_special_tokens=True, clean_up_tokenization_spaces=False
        )[0]
        return {"text": out_text}
