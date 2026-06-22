import { type FoundImage, type FinderOptions, type ImageFinder } from "./types.js";
import { findWikimediaImage, findWikimediaImageCandidates } from "./wikimedia.js";
import { findInternetArchiveImage, findInternetArchiveImageCandidates } from "./internetArchive.js";

// Registry of image source adapters, all normalized to the ImageFinder shape.
// The asset stage tries a chosen list in order and takes the first hit.

const wikimediaFinder: ImageFinder = async (query, opts) => {
  const c = await findWikimediaImage(query, opts);
  if (!c) return null;
  return {
    url: c.url,
    mime: c.mime,
    source: "wikimedia",
    license: c.license,
    width: c.width,
    height: c.height,
    title: c.title,
    descriptionUrl: c.descriptionUrl,
  };
};

export const IMAGE_SOURCES: Record<string, ImageFinder> = {
  wikimedia: wikimediaFinder,
  internetArchive: findInternetArchiveImage,
};

// Multi-candidate variants — return several ranked, license-clean images so the
// caller can vision-verify them in order (keyword search returns wrong subjects).
export type ImageCandidateFinder = (
  query: string,
  opts?: FinderOptions & { max?: number }
) => Promise<FoundImage[]>;

const wikimediaCandidates: ImageCandidateFinder = async (query, opts) =>
  (await findWikimediaImageCandidates(query, opts)).map((c) => ({
    url: c.url, mime: c.mime, source: "wikimedia", license: c.license,
    width: c.width, height: c.height, title: c.title, descriptionUrl: c.descriptionUrl,
  }));

export const IMAGE_CANDIDATE_SOURCES: Record<string, ImageCandidateFinder> = {
  wikimedia: wikimediaCandidates,
  internetArchive: findInternetArchiveImageCandidates,
};

export const DEFAULT_SOURCE_ORDER = ["wikimedia", "internetArchive"];

/** Resolve a list of source names to finders, in order, ignoring unknown names. */
export function resolveFinders(names: string[]): { name: string; find: ImageFinder }[] {
  return names
    .filter((n) => n in IMAGE_SOURCES)
    .map((n) => ({ name: n, find: IMAGE_SOURCES[n] }));
}

/** Resolve a list of source names to multi-candidate finders, in order. */
export function resolveCandidateFinders(names: string[]): { name: string; find: ImageCandidateFinder }[] {
  return names
    .filter((n) => n in IMAGE_CANDIDATE_SOURCES)
    .map((n) => ({ name: n, find: IMAGE_CANDIDATE_SOURCES[n] }));
}
