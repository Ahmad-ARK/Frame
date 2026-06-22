#!/usr/bin/env python
"""Generate narration audio with edge-tts AND per-word timestamps.

edge-tts returns SentenceBoundary (and sometimes WordBoundary) events. We
capture whatever boundary granularity the server gives and interpolate per-word
timings within each segment by character length, so downstream enrichment can
fire visuals on the exact moment a word is spoken (build brief §8).

Usage:
  python edge_tts_words.py --text-file in.txt --voice en-US-ChristopherNeural \
      --out-audio out.mp3 --out-timings out.json
Writes the mp3 and a JSON: { "words": [ {"word","startMs","endMs"} ], "durationMs": N }
"""
import argparse, asyncio, json, re
import edge_tts


def split_words(text):
    return [w for w in re.findall(r"\S+", text)]


def interpolate(segment_text, start_ms, dur_ms):
    """Distribute a segment's duration across its words by character length."""
    words = split_words(segment_text)
    if not words:
        return []
    total_chars = sum(len(w) for w in words)
    out = []
    t = start_ms
    for w in words:
        share = (len(w) / total_chars) if total_chars else (1 / len(words))
        wdur = dur_ms * share
        out.append({"word": w.strip(".,;:!?\"'()"), "startMs": round(t), "endMs": round(t + wdur)})
        t += wdur
    return out


async def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--text-file", required=True)
    ap.add_argument("--voice", default="en-US-ChristopherNeural")
    ap.add_argument("--out-audio", required=True)
    ap.add_argument("--out-timings", required=True)
    args = ap.parse_args()

    with open(args.text_file, "r", encoding="utf-8") as f:
        text = f.read().strip()

    comm = edge_tts.Communicate(text, args.voice)
    words = []
    last_end = 0
    with open(args.out_audio, "wb") as audio:
        async for ch in comm.stream():
            t = ch.get("type")
            if t == "audio":
                audio.write(ch["data"])
            elif t in ("WordBoundary", "SentenceBoundary"):
                start = ch["offset"] / 10000.0  # 100ns → ms
                dur = ch["duration"] / 10000.0
                if t == "WordBoundary":
                    words.append({"word": ch["text"].strip(".,;:!?\"'()"), "startMs": round(start), "endMs": round(start + dur)})
                else:
                    words.extend(interpolate(ch["text"], start, dur))
                last_end = max(last_end, start + dur)

    with open(args.out_timings, "w", encoding="utf-8") as f:
        json.dump({"words": words, "durationMs": round(last_end)}, f)


if __name__ == "__main__":
    asyncio.run(main())
