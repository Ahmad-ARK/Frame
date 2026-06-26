// The broadcast-monitor frame: a beveled bezel with four corner screws around a
// 16:9 screen. The reviewer sees a *picture*, never a scene-type label — the
// preview inside is deliberately abstract (a vignette + scanlines + a caption
// strip), so the prebuilt-scene machinery stays invisible. Pass children to
// render a real <Player> later without touching callers.
import type { ReactNode } from "react";

export function Bezel({ children, caption }: { children?: ReactNode; caption?: ReactNode }) {
  return (
    <div className="bezel">
      <span className="scr a" /><span className="scr b" /><span className="scr c" /><span className="scr d" />
      <div className="screen-in">
        {children ?? <AbstractFrame caption={caption} />}
      </div>
    </div>
  );
}

/** A content-agnostic still that reads as "documentary frame" without revealing
 *  how it was built, and without implying any specific subject. Just a vignette
 *  globe + scanlines + an optional caption. Used until the live @remotion/player
 *  is wired in. (No hardcoded year/place — that was sample-specific.) */
function AbstractFrame({ caption }: { caption?: ReactNode }) {
  return (
    <>
      <div className="scn-globe" />
      {caption && <div className="scn-cap">{caption}</div>}
      <div className="scn-scan" />
    </>
  );
}
