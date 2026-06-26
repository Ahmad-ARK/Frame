import React from "react";
import { Composition, Series, AbsoluteFill, staticFile, Audio } from "remotion";
import { StyleGuideProvider } from "./StyleGuideContext";
import { documentaryDark } from "./styleGuides/documentaryDark";
import { TitleCard, styleToTitleSpec } from "./compositions/TitleCard";
import { MapScene, styleToMapSpec } from "./compositions/MapScene";
import { TimelineScene, styleToTimelineSpec } from "./compositions/TimelineScene";
import { DataScene, styleToDataSpec } from "./compositions/DataScene";
import { ArchivalPhoto, styleToPhotoSpec } from "./compositions/ArchivalPhoto";
import { QuoteCard, styleToQuoteSpec } from "./compositions/QuoteCard";
import { ComparisonScene } from "./compositions/ComparisonScene";
import { OverlayLayer } from "./compositions/OverlayLayer";
import { CaptionLayer, type CaptionStyle } from "./compositions/CaptionLayer";
import { NewspaperScene, styleToNewspaperSpec } from "./compositions/NewspaperScene";
import { DocumentScene, styleToDocumentSpec } from "./compositions/DocumentScene";
import { GlobeScene, styleToGlobeSpec } from "./compositions/GlobeScene";
import { VideoScene, styleToVideoSpec } from "./compositions/VideoScene";
import type { Storyboard, Scene } from "./types/storyboard";
import { msToFrames } from "./utils/animation";

import phase0Storyboard from "../storyboards/soviet-afghan-war.json";
import fullStoryboard from "../storyboards/soviet-afghan-war-full.json";
import kashmirStoryboard from "../storyboards/kashmir-generated.json";
import mapModesStoryboard from "../storyboards/map-modes-showcase.json";
import dataTestStoryboard from "../storyboards/data-test.json";
import timelineTestStoryboard from "../storyboards/timeline-test.json";
import quoteTestStoryboard from "../storyboards/quote-test.json";
import titleTestStoryboard from "../storyboards/title-test.json";
import photoTestStoryboard from "../storyboards/photo-test.json";
import showcaseStoryboard from "../storyboards/showcase.json";
import assetTestStoryboard from "../storyboards/asset-test.storyboard.json";
import backlogTestStoryboard from "../storyboards/backlog-test.json";
import videoTestStoryboard from "../storyboards/video-test.json";

const FPS = 30;

/** Routes a storyboard scene to its Remotion component */
const SceneRenderer: React.FC<{ scene: Scene }> = ({ scene }) => {
  const durationMs = scene.durationMs ?? 5000;
  const style = (scene.visual.style ?? {}) as Record<string, any>;

  switch (scene.visual.type) {
    case "titleCard": {
      const t = styleToTitleSpec(style);
      if (!t.title) t.title = scene.narration;
      return <TitleCard durationMs={durationMs} title={t} />;
    }

    case "map":
      return <MapScene durationMs={durationMs} map={styleToMapSpec(style)} />;

    case "timeline":
      return <TimelineScene durationMs={durationMs} timeline={styleToTimelineSpec(style)} />;

    case "stat":
    case "chart":
      return <DataScene durationMs={durationMs} data={styleToDataSpec(style)} />;

    // archivalPhoto / genImage → mode-based image scene (single/montage/split/grid/annotated).
    // ArchivalPhoto resolves item.src via staticFile itself. Legacy: assets[0]/style.src → single.
    case "archivalPhoto":
    case "genImage": {
      const asset = scene.visual.assets?.[0];
      const photo = styleToPhotoSpec(style, {
        src: asset?.ref ?? style.src,
        caption: style.caption ?? scene.onScreenText,
        attribution: asset?.license?.attributionText ?? style.attribution,
      });
      return <ArchivalPhoto durationMs={durationMs} photo={photo} />;
    }

    case "quoteCard": {
      const q = styleToQuoteSpec(style);
      if (!q.quote) q.quote = scene.narration; // QuoteCard resolves portrait.src via staticFile itself
      return <QuoteCard durationMs={durationMs} quote={q} />;
    }

    case "comparison":
      return (
        <ComparisonScene
          durationMs={durationMs}
          heading={style.heading}
          left={style.left}
          right={style.right}
        />
      );

    case "newspaper":
      return <NewspaperScene durationMs={durationMs} newspaper={styleToNewspaperSpec(style)} />;

    case "document":
      return <DocumentScene durationMs={durationMs} document={styleToDocumentSpec(style)} />;

    case "globe":
      return <GlobeScene durationMs={durationMs} globe={styleToGlobeSpec(style)} />;

    // video → real archival/B-roll footage (single/montage/loop/freeze).
    // VideoScene resolves clip.src via staticFile itself. Legacy: assets[0]/style.src → single.
    case "video": {
      const asset = scene.visual.assets?.[0];
      const vid = styleToVideoSpec(style, {
        src: asset?.ref ?? style.src,
        caption: style.caption ?? scene.onScreenText,
        attribution: asset?.license?.attributionText ?? style.attribution,
      });
      return <VideoScene durationMs={durationMs} video={vid} />;
    }

    default:
      return (
        <AbsoluteFill style={{
          background: documentaryDark.color.bg,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: documentaryDark.color.textMuted,
          fontFamily: "monospace",
          fontSize: 24,
        }}>
          Scene type "{scene.visual.type}" not yet implemented
        </AbsoluteFill>
      );
  }
};

/** Full documentary — storyboard-driven. `captionStyle` defaults to "karaoke" (auto). */
const Documentary: React.FC<{ storyboard: Storyboard; captionStyle?: CaptionStyle }> = ({ storyboard, captionStyle = "karaoke" }) => (
  <StyleGuideProvider guide={documentaryDark}>
    <Series>
      {storyboard.scenes.map((scene) => (
        <Series.Sequence
          key={scene.id}
          durationInFrames={msToFrames(scene.durationMs ?? 5000, FPS)}
        >
          <SceneRenderer scene={scene} />
          {scene.visual.overlays && scene.visual.overlays.length > 0 && (
            <OverlayLayer overlays={scene.visual.overlays} />
          )}
          {/* Captions sit ABOVE overlays so they stay legible. */}
          <CaptionLayer wordTimings={scene.wordTimings} durationMs={scene.durationMs ?? 5000} styleId={captionStyle} />
          {scene.audioRef && <Audio src={staticFile(scene.audioRef)} />}
        </Series.Sequence>
      ))}
    </Series>
  </StyleGuideProvider>
);

const totalMs = (board: Storyboard) =>
  board.scenes.reduce((acc, s) => acc + (s.durationMs ?? 5000), 0);

/** Dev preview: a single ArchivalPhoto scene with placeholder image + lower-third. */
const ArchivalPhotoPreview: React.FC<{ photo: any }> = ({ photo }) => (
  <StyleGuideProvider guide={documentaryDark}>
    <ArchivalPhoto durationMs={6000} photo={photo} />
  </StyleGuideProvider>
);
const IMG = (id: string) => `https://picsum.photos/id/${id}/1280/960`;

const QuoteCardPreview: React.FC = () => (
  <StyleGuideProvider guide={documentaryDark}>
    <QuoteCard
      durationMs={6000}
      quote={{
        mode: "standard",
        quote: "I had no alternative; the time at my disposal was so short that I could not do a better job.",
        attribution: "Cyril Radcliffe",
        role: "Chairman, Boundary Commission · 1947",
      }}
    />
  </StyleGuideProvider>
);

const OverlayPreview: React.FC = () => (
  <StyleGuideProvider guide={documentaryDark}>
    <MapScene
      durationMs={9000}
      map={{
        mode: "locator", center: [66, 34], scale: 1300,
        camera: { keyframes: [{ atMs: 0, center: [66, 34], scale: 700 }, { atMs: 1500, center: [66, 34], scale: 1300 }] },
        highlights: [{ iso: "004", color: "primary", opacity: 0.7 }],
      }}
    />
    <OverlayLayer
      overlays={[
        { kind: "text", atMs: 700, durationMs: 4000, anchor: "topLeft", emphasis: true, text: "December 1979" },
        { kind: "image", atMs: 2400, durationMs: 5500, anchor: "right", src: "assets/overlay-demo/tanks.png", caption: "Soviet armour crosses the Amu Darya", attribution: "Generated · FLUX" },
        { kind: "stat", atMs: 5200, durationMs: 3500, anchor: "bottomLeft", value: "115,000", label: "Soviet troops" },
      ]}
    />
  </StyleGuideProvider>
);

const NewspaperPreview: React.FC<{ newspaper: any }> = ({ newspaper }) => (
  <StyleGuideProvider guide={documentaryDark}><NewspaperScene durationMs={6000} newspaper={newspaper} /></StyleGuideProvider>
);
const DocumentPreview: React.FC<{ document: any }> = ({ document }) => (
  <StyleGuideProvider guide={documentaryDark}><DocumentScene durationMs={6000} document={document} /></StyleGuideProvider>
);
const GlobePreview: React.FC<{ globe: any }> = ({ globe }) => (
  <StyleGuideProvider guide={documentaryDark}><GlobeScene durationMs={6000} globe={globe} /></StyleGuideProvider>
);

const TitleModePreview: React.FC<{ title: any }> = ({ title }) => (
  <StyleGuideProvider guide={documentaryDark}>
    <TitleCard durationMs={3000} title={title} />
  </StyleGuideProvider>
);

const QuoteModePreview: React.FC<{ quote: any }> = ({ quote }) => (
  <StyleGuideProvider guide={documentaryDark}>
    <QuoteCard durationMs={6000} quote={quote} />
  </StyleGuideProvider>
);

const TimelineModePreview: React.FC<{ timeline: any }> = ({ timeline }) => (
  <StyleGuideProvider guide={documentaryDark}>
    <TimelineScene durationMs={8000} timeline={timeline} />
  </StyleGuideProvider>
);

const DataModePreview: React.FC<{ data: any }> = ({ data }) => (
  <StyleGuideProvider guide={documentaryDark}>
    <DataScene durationMs={6000} data={data} />
  </StyleGuideProvider>
);

const MapFlowsPreview: React.FC = () => (
  <StyleGuideProvider guide={documentaryDark}>
    <MapScene
      durationMs={6000}
      map={{
        mode: "flows",
        center: [67, 33.5], scale: 1500,
        highlights: [{ iso: "586", color: "text", opacity: 0.18 }, { iso: "004", color: "primary", opacity: 0.5 }],
        markers: [
          { position: [73.05, 33.68], label: "ISI", sublabel: "Islamabad", atMs: 200, color: "accent" },
          { position: [69.17, 34.53], label: "MUJAHIDEEN", sublabel: "Kabul", atMs: 1600, color: "primary" },
        ],
        flows: [
          { from: [73.05, 33.68], to: [69.17, 34.53], atMs: 800, color: "accent" },
          { from: [73.05, 33.68], to: [65.7, 31.6], atMs: 1400, color: "accent" },
        ],
      }}
    />
  </StyleGuideProvider>
);

const MapComparePreview: React.FC = () => (
  <StyleGuideProvider guide={documentaryDark}>
    <MapScene
      durationMs={6000}
      map={{
        mode: "compare",
        center: [74, 28], scale: 900,
        highlights: [{ iso: "356", color: "accent", opacity: 0.5 }, { iso: "586", color: "primary", opacity: 0.55 }],
        sideLabels: [{ text: "INDIA", color: "accent" }, { text: "PAKISTAN", color: "primary" }],
      }}
    />
  </StyleGuideProvider>
);

const ComparisonPreview: React.FC = () => (
  <StyleGuideProvider guide={documentaryDark}>
    <ComparisonScene
      durationMs={6000}
      heading="Two claims, one valley"
      left={{ label: "India", value: "Instrument of Accession", description: "Signed by Maharaja Hari Singh, October 1947.", color: "accent" }}
      right={{ label: "Pakistan", value: "Muslim majority", description: "Argued Kashmir's demographics demanded accession to Pakistan.", color: "primary" }}
    />
  </StyleGuideProvider>
);

export const RemotionRoot: React.FC = () => {
  const p0 = phase0Storyboard as unknown as Storyboard;
  const full = fullStoryboard as unknown as Storyboard;
  const kashmir = kashmirStoryboard as unknown as Storyboard;
  const mapModes = mapModesStoryboard as unknown as Storyboard;
  const dataTest = dataTestStoryboard as unknown as Storyboard;
  const timelineTest = timelineTestStoryboard as unknown as Storyboard;
  const quoteTest = quoteTestStoryboard as unknown as Storyboard;
  const titleTest = titleTestStoryboard as unknown as Storyboard;
  const photoTest = photoTestStoryboard as unknown as Storyboard;
  const showcase = showcaseStoryboard as unknown as Storyboard;
  const assetTest = assetTestStoryboard as unknown as Storyboard;
  const backlogTest = backlogTestStoryboard as unknown as Storyboard;
  const videoTest = videoTestStoryboard as unknown as Storyboard;

  return (
    <>
      {/* GENERIC: renders ANY storyboard passed via inputProps (the backend job
          runner uses this with --props). Duration is computed from the storyboard. */}
      <Composition
        id="DynamicDocumentary"
        component={Documentary}
        durationInFrames={300}
        fps={FPS}
        width={1920}
        height={1080}
        defaultProps={{ storyboard: backlogTest, captionStyle: "karaoke" as CaptionStyle }}
        calculateMetadata={({ props }) => {
          const sb = (props as { storyboard?: Storyboard }).storyboard;
          const ms = sb?.scenes?.length ? totalMs(sb) : 5000;
          return { durationInFrames: Math.max(1, msToFrames(ms, FPS)) };
        }}
      />
      {/* Phase 0 proof — 20 seconds */}
      <Composition
        id="DocumentaryPhase0"
        component={Documentary}
        durationInFrames={msToFrames(totalMs(p0), FPS)}
        fps={FPS}
        width={1920}
        height={1080}
        defaultProps={{ storyboard: p0 }}
      />
      {/* Phase 1 full cut — ~83 seconds */}
      <Composition
        id="DocumentaryFull"
        component={Documentary}
        durationInFrames={msToFrames(totalMs(full), FPS)}
        fps={FPS}
        width={1920}
        height={1080}
        defaultProps={{ storyboard: full }}
      />
      {/* Asset-pipeline fixture — real Wikimedia images via staticFile */}
      <Composition
        id="AssetTest"
        component={Documentary}
        durationInFrames={msToFrames(totalMs(assetTest), FPS)}
        fps={FPS}
        width={1920}
        height={1080}
        defaultProps={{ storyboard: assetTest }}
      />
      {/* Vertical-slice: a fully generated storyboard (generate → research → render) */}
      <Composition
        id="DocumentaryKashmir"
        component={Documentary}
        durationInFrames={msToFrames(totalMs(kashmir), FPS)}
        fps={FPS}
        width={1920}
        height={1080}
        defaultProps={{ storyboard: kashmir }}
      />
      {/* SHOWCASE: all rebuilt scene types in one narrated cut */}
      <Composition
        id="SceneShowcase"
        component={Documentary}
        durationInFrames={msToFrames(totalMs(showcase), FPS)}
        fps={FPS}
        width={1920}
        height={1080}
        defaultProps={{ storyboard: showcase }}
      />
      {/* All image-scene modes (LLM-selected) in one cut */}
      <Composition
        id="PhotoModesTest"
        component={Documentary}
        durationInFrames={msToFrames(totalMs(photoTest), FPS)}
        fps={FPS}
        width={1920}
        height={1080}
        defaultProps={{ storyboard: photoTest }}
      />
      {/* All title modes (LLM-selected) in one cut */}
      <Composition
        id="TitleModesTest"
        component={Documentary}
        durationInFrames={msToFrames(totalMs(titleTest), FPS)}
        fps={FPS}
        width={1920}
        height={1080}
        defaultProps={{ storyboard: titleTest }}
      />
      {/* All quote modes (LLM-selected) in one cut */}
      <Composition
        id="QuoteModesTest"
        component={Documentary}
        durationInFrames={msToFrames(totalMs(quoteTest), FPS)}
        fps={FPS}
        width={1920}
        height={1080}
        defaultProps={{ storyboard: quoteTest }}
      />
      {/* All timeline modes (LLM-selected) in one cut */}
      <Composition
        id="TimelineModesTest"
        component={Documentary}
        durationInFrames={msToFrames(totalMs(timelineTest), FPS)}
        fps={FPS}
        width={1920}
        height={1080}
        defaultProps={{ storyboard: timelineTest }}
      />
      {/* All data modes (LLM-selected) in one cut */}
      <Composition
        id="DataModesTest"
        component={Documentary}
        durationInFrames={msToFrames(totalMs(dataTest), FPS)}
        fps={FPS}
        width={1920}
        height={1080}
        defaultProps={{ storyboard: dataTest }}
      />
      {/* All map modes in one cut */}
      <Composition
        id="MapModesShowcase"
        component={Documentary}
        durationInFrames={msToFrames(totalMs(mapModes), FPS)}
        fps={FPS}
        width={1920}
        height={1080}
        defaultProps={{ storyboard: mapModes }}
      />
      {/* Backlog types (newspaper / document / globe), LLM-selected modes, narrated */}
      <Composition
        id="BacklogModesTest"
        component={Documentary}
        durationInFrames={msToFrames(totalMs(backlogTest), FPS)}
        fps={FPS}
        width={1920}
        height={1080}
        defaultProps={{ storyboard: backlogTest }}
      />
      {/* Video/B-roll modes (single / montage / loop / freeze), real IA footage, narrated */}
      <Composition
        id="VideoModesTest"
        component={Documentary}
        durationInFrames={msToFrames(totalMs(videoTest), FPS)}
        fps={FPS}
        width={1920}
        height={1080}
        defaultProps={{ storyboard: videoTest }}
      />
      {/* Dev previews for the image-scene modes */}
      <Composition id="PhotoMontagePreview" component={ArchivalPhotoPreview} durationInFrames={msToFrames(6000, FPS)} fps={FPS} width={1920} height={1080} defaultProps={{ photo: { mode: "montage", items: [{ src: IMG("1015"), caption: "The refugees" }, { src: IMG("1016"), caption: "The border" }, { src: IMG("1018"), caption: "The aftermath" }] } }} />
      <Composition id="PhotoSplitPreview" component={ArchivalPhotoPreview} durationInFrames={msToFrames(6000, FPS)} fps={FPS} width={1920} height={1080} defaultProps={{ photo: { mode: "split", items: [{ src: IMG("1015"), caption: "1979" }, { src: IMG("1039"), caption: "2021" }] } }} />
      <Composition id="PhotoGridPreview" component={ArchivalPhotoPreview} durationInFrames={msToFrames(6000, FPS)} fps={FPS} width={1920} height={1080} defaultProps={{ photo: { mode: "grid", items: [{ src: IMG("1015") }, { src: IMG("1016") }, { src: IMG("1018") }, { src: IMG("1039") }, { src: IMG("1043") }, { src: IMG("1044") }] } }} />
      <Composition id="PhotoAnnotatedPreview" component={ArchivalPhotoPreview} durationInFrames={msToFrames(6000, FPS)} fps={FPS} width={1920} height={1080} defaultProps={{ photo: { mode: "annotated", items: [{ src: IMG("1043"), caption: "The Friendship Bridge", attribution: "Photo · Public Domain" }], annotation: { x: 0.62, y: 0.45, radius: 0.13, label: "Last Soviet soldier" } } }} />
      <Composition
        id="QuoteCardPreview"
        component={QuoteCardPreview}
        durationInFrames={msToFrames(6000, FPS)}
        fps={FPS}
        width={1920}
        height={1080}
      />
      <Composition id="OverlayPreview" component={OverlayPreview} durationInFrames={msToFrames(9000, FPS)} fps={FPS} width={1920} height={1080} />
      <Composition id="NewspaperHeadlinePreview" component={NewspaperPreview} durationInFrames={msToFrames(6000, FPS)} fps={FPS} width={1920} height={1080} defaultProps={{ newspaper: { mode: "headline", paper: "THE NEW YORK TIMES", date: "September 12, 2001", headline: "U.S. ATTACKED", dek: "Hijacked jets destroy twin towers and hit Pentagon." } }} />
      <Composition id="NewspaperMontagePreview" component={NewspaperPreview} durationInFrames={msToFrames(6000, FPS)} fps={FPS} width={1920} height={1080} defaultProps={{ newspaper: { mode: "montage", items: [{ headline: "Soviets Invade Afghanistan", paper: "The Times", date: "1979" }, { headline: "CIA Arms the Mujahideen", paper: "Washington Post", date: "1984" }, { headline: "Last Soviet Troops Leave", paper: "The Guardian", date: "1989" }, { headline: "U.S. Invades Afghanistan", paper: "Le Monde", date: "2001" }] } }} />
      <Composition id="DocumentTypedPreview" component={DocumentPreview} durationInFrames={msToFrames(6000, FPS)} fps={FPS} width={1920} height={1080} defaultProps={{ document: { mode: "typed", title: "MEMORANDUM", source: "NSC · JULY 3, 1979", lines: ["TO: The President", "FROM: Zbigniew Brzezinski", "", "We should consider covert support to the", "Afghan opposition. This aid would induce a", "Soviet military intervention.", "", "It is an opportunity we should not miss."], highlight: "induce a", stamp: "DECLASSIFIED" } }} />
      <Composition id="DocumentRedactedPreview" component={DocumentPreview} durationInFrames={msToFrames(6000, FPS)} fps={FPS} width={1920} height={1080} defaultProps={{ document: { mode: "redacted", title: "FIELD REPORT", source: "[REDACTED] · 1985", lines: ["Funds were routed through [REDACTED]", "to the following commanders:", "The total disbursed exceeded $3 billion.", "Weapons included Stinger missiles."], highlight: "exceeded $3 billion", stamp: "CLASSIFIED" } }} />
      <Composition id="GlobeLocatorPreview" component={GlobePreview} durationInFrames={msToFrames(6000, FPS)} fps={FPS} width={1920} height={1080} defaultProps={{ globe: { mode: "locator", center: [66, 34], highlights: [{ iso: "4", color: "primary", opacity: 0.85 }], markers: [{ position: [66, 34], label: "Afghanistan" }] } }} />
      <Composition id="GlobeArcsPreview" component={GlobePreview} durationInFrames={msToFrames(6000, FPS)} fps={FPS} width={1920} height={1080} defaultProps={{ globe: { mode: "arcs", center: [40, 35], highlights: [{ iso: "840", color: "accent", opacity: 0.6 }, { iso: "4", color: "primary", opacity: 0.8 }], arcs: [{ from: [-77, 38.9], to: [69.2, 34.5], atMs: 300, color: "accent" }, { from: [73, 33.7], to: [69.2, 34.5], atMs: 1200, color: "primary" }], markers: [{ position: [-77, 38.9], label: "Washington" }, { position: [69.2, 34.5], label: "Kabul" }] } }} />
      <Composition id="TitleImpactPreview" component={TitleModePreview} durationInFrames={msToFrames(3000, FPS)} fps={FPS} width={1920} height={1080} defaultProps={{ title: { mode: "impact", eyebrow: "Geopolitics · 1979–2021", title: "WHO WON THE\nSOVIET-AFGHAN WAR", subtitle: "Four stories. One pattern." } }} />
      <Composition id="TitleWordByWordPreview" component={TitleModePreview} durationInFrames={msToFrames(3000, FPS)} fps={FPS} width={1920} height={1080} defaultProps={{ title: { mode: "wordByWord", eyebrow: "The thesis", title: "VICTORY AND DEFEAT\nARE THE SAME WORD" } }} />
      <Composition id="TitleTypewriterPreview" component={TitleModePreview} durationInFrames={msToFrames(3000, FPS)} fps={FPS} width={1920} height={1080} defaultProps={{ title: { mode: "typewriter", eyebrow: "Declassified", title: "OPERATION CYCLONE", subtitle: "The largest covert program in CIA history." } }} />
      <Composition id="TitleLineRevealPreview" component={TitleModePreview} durationInFrames={msToFrames(3000, FPS)} fps={FPS} width={1920} height={1080} defaultProps={{ title: { mode: "lineReveal", title: "WE WILL KEEP\nPAYING FOR IT", subtitle: "The Afghans paid first." } }} />
      <Composition id="QuoteKineticPreview" component={QuoteModePreview} durationInFrames={msToFrames(6000, FPS)} fps={FPS} width={1920} height={1080} defaultProps={{ quote: { mode: "kinetic", quote: "Build a proxy. Declare victory. Abandon them. Then go to war with them when they become tomorrow's enemy.", emphasis: ["proxy", "victory", "war", "enemy"], attribution: "The Pattern" } }} />
      <Composition id="QuoteStatementPreview" component={QuoteModePreview} durationInFrames={msToFrames(6000, FPS)} fps={FPS} width={1920} height={1080} defaultProps={{ quote: { mode: "statement", quote: "This isn't a tragedy.\nIt's a pattern.", emphasis: ["pattern."] } }} />
      <Composition id="QuoteDocumentPreview" component={QuoteModePreview} durationInFrames={msToFrames(6000, FPS)} fps={FPS} width={1920} height={1080} defaultProps={{ quote: { mode: "document", quote: "We now have the opportunity of giving to the USSR its Vietnam War.", attribution: "Zbigniew Brzezinski", role: "National Security Advisor", source: "WHITE HOUSE MEMO · 1979" } }} />
      <Composition id="QuotePortraitPreview" component={QuoteModePreview} durationInFrames={msToFrames(6000, FPS)} fps={FPS} width={1920} height={1080} defaultProps={{ quote: { mode: "portrait", quote: "Regret what? That secret operation was an excellent idea.", attribution: "Zbigniew Brzezinski", role: "1998 interview", portrait: { caption: "Zbigniew Brzezinski" } } }} />
      <Composition id="TLHorizontalPreview" component={TimelineModePreview} durationInFrames={msToFrames(8000, FPS)} fps={FPS} width={1920} height={1080} defaultProps={{ timeline: { mode: "horizontal", heading: "The war and its aftermath", events: [{ date: "Jul 1979", title: "Operation Cyclone", color: "accent" }, { date: "Dec 1979", title: "Soviet invasion", color: "primary" }, { date: "1986", title: "Stinger missiles" }, { date: "Feb 1989", title: "Soviet withdrawal", color: "primary" }, { date: "Sep 2001", title: "9/11", color: "primary" }] } }} />
      <Composition id="TLErasPreview" component={TimelineModePreview} durationInFrames={msToFrames(8000, FPS)} fps={FPS} width={1920} height={1080} defaultProps={{ timeline: { mode: "eras", heading: "Four decades of consequence", eras: [{ from: "1979", to: "1989", label: "Soviet War", color: "primary" }, { from: "1989", to: "2001", label: "The Vacuum", color: "accent" }, { from: "2001", to: "2021", label: "America's War", color: "primary" }] } }} />
      <Composition id="TLMilestonesPreview" component={TimelineModePreview} durationInFrames={msToFrames(9000, FPS)} fps={FPS} width={1920} height={1080} defaultProps={{ timeline: { mode: "milestones", events: [{ date: "1979", title: "The trap is sprung", description: "Soviet tanks cross the Amu Darya.", color: "primary" }, { date: "1989", title: "The retreat", description: "The last Soviet soldier crosses the bridge.", color: "accent" }, { date: "2001", title: "The blowback", description: "The network America built strikes New York.", color: "primary" }] } }} />
      <Composition id="TLParallelPreview" component={TimelineModePreview} durationInFrames={msToFrames(8000, FPS)} fps={FPS} width={1920} height={1080} defaultProps={{ timeline: { mode: "parallel", heading: "Two players, one war", tracks: [{ label: "USA", color: "accent", events: [{ date: "1979", title: "Funds rebels" }, { date: "1986", title: "Sends Stingers" }] }, { label: "USSR", color: "primary", events: [{ date: "1979", title: "Invades" }, { date: "1989", title: "Withdraws" }] }] } }} />
      <Composition id="DataComparePreview" component={DataModePreview} durationInFrames={msToFrames(6000, FPS)} fps={FPS} width={1920} height={1080} defaultProps={{ data: { mode: "compare", title: "Who paid the real cost", items: [{ label: "Soviet Union", value: 15000, suffix: "", sublabel: "1979–89", color: "accent" }, { label: "Afghanistan", value: 2000000, sublabel: "1979–present", color: "primary" }] } }} />
      <Composition id="DataPictographPreview" component={DataModePreview} durationInFrames={msToFrames(6000, FPS)} fps={FPS} width={1920} height={1080} defaultProps={{ data: { mode: "pictograph", title: "The human cost", percent: 33, iconLabel: "of the dead were civilians", context: "Roughly one in three." } }} />
      <Composition id="DataDonutPreview" component={DataModePreview} durationInFrames={msToFrames(6000, FPS)} fps={FPS} width={1920} height={1080} defaultProps={{ data: { mode: "donut", title: "Where the $3B went", context: "$3B", slices: [{ label: "Weapons", value: 55 }, { label: "Training", value: 25 }, { label: "Logistics", value: 20 }] } }} />
      <Composition id="DataTrendPreview" component={DataModePreview} durationInFrames={msToFrames(6000, FPS)} fps={FPS} width={1920} height={1080} defaultProps={{ data: { mode: "trend", title: "Soviet troop levels", accent: "primary", points: [{ x: "1979", y: 30 }, { x: "1981", y: 85 }, { x: "1983", y: 105 }, { x: "1985", y: 115 }, { x: "1987", y: 110 }, { x: "1989", y: 0 }], lineLabel: "thousands" } }} />
      <Composition id="MapFlowsPreview" component={MapFlowsPreview} durationInFrames={msToFrames(6000, FPS)} fps={FPS} width={1920} height={1080} />
      <Composition id="MapComparePreview" component={MapComparePreview} durationInFrames={msToFrames(6000, FPS)} fps={FPS} width={1920} height={1080} />
      <Composition
        id="ComparisonPreview"
        component={ComparisonPreview}
        durationInFrames={msToFrames(6000, FPS)}
        fps={FPS}
        width={1920}
        height={1080}
      />
    </>
  );
};
