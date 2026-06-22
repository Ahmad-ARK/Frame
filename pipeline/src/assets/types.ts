import { type AssetLicense } from "./license.js";
import { type AssetSource } from "../schema/storyboard.js";

/** A license-clean image found by a source adapter, ready to download. */
export type FoundImage = {
  url: string; // direct, downloadable image URL
  mime: string; // image/jpeg | image/png
  source: AssetSource;
  license: AssetLicense;
  width?: number;
  height?: number;
  title?: string;
  descriptionUrl?: string; // human-facing source page
};

export type FinderOptions = {
  searchLimit?: number;
  allowShareAlike?: boolean;
};

/** A source adapter: query -> best license-clean image, or null. */
export type ImageFinder = (
  query: string,
  opts?: FinderOptions
) => Promise<FoundImage | null>;
