// License classification for fetched assets (build brief §7).
// "On Commons" != "free to use" — every file carries its own license, and a
// monetized channel must respect it. We branch:
//   PD / CC0      -> auto-accept, no attribution obligation
//   CC BY         -> accept, but REQUIRE an auto-generated attribution line
//   CC BY-SA      -> reject by default (share-alike is risky for commercial use)
//   non-free/unknown -> reject

export type AssetLicense = {
  type: string; // "PD" | "CC0" | "CC BY" | "CC BY-SA" | raw short name | "unknown"
  attributionRequired: boolean;
  attributionText?: string;
};

export type LicenseDecision = {
  accept: boolean;
  license: AssetLicense;
  reason: string;
};

/** Wikimedia `extmetadata` is a map of { value, source } — pull the value. */
export type ExtMetadata = Record<string, { value?: string } | undefined>;

const val = (ext: ExtMetadata, key: string): string =>
  (ext[key]?.value ?? "").toString();

/** Commons values are often HTML (links, spans). Reduce to plain text. */
function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;/g, " ")
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

function buildAttribution(ext: ExtMetadata, shortName: string): string {
  const artist = stripHtml(val(ext, "Artist"));
  const credit = stripHtml(val(ext, "Credit"));
  const who = artist || credit || "Unknown author";
  return `${who} · ${shortName || "Wikimedia Commons"} · via Wikimedia Commons`;
}

/**
 * Classifies a Commons file's license from its extmetadata and decides whether
 * it is usable for a commercial channel.
 */
export function classifyLicense(ext: ExtMetadata): LicenseDecision {
  const short = stripHtml(val(ext, "LicenseShortName"));
  const machine = (val(ext, "License") || short).toLowerCase();
  const norm = machine.replace(/\s+/g, "-");

  // Public domain / CC0 — no obligations.
  if (/(^|[^a-z])pd([^a-z]|$)|public-?domain|cc0|cc-zero/.test(norm)) {
    const type = /cc0|cc-zero/.test(norm) ? "CC0" : "PD";
    return {
      accept: true,
      license: { type, attributionRequired: false },
      reason: `${type} — no attribution required`,
    };
  }

  // CC BY-SA — share-alike; reject by default for commercial use.
  if (/cc-?by-?sa/.test(norm)) {
    return {
      accept: false,
      license: {
        type: "CC BY-SA",
        attributionRequired: true,
        attributionText: buildAttribution(ext, short),
      },
      reason: "CC BY-SA — share-alike, skipped for commercial use (override required)",
    };
  }

  // CC BY (not SA) — accept WITH attribution.
  if (/cc-?by/.test(norm)) {
    return {
      accept: true,
      license: {
        type: "CC BY",
        attributionRequired: true,
        attributionText: buildAttribution(ext, short),
      },
      reason: "CC BY — accepted with attribution",
    };
  }

  // Anything else: non-free, fair-use, or unrecognized — skip.
  return {
    accept: false,
    license: { type: short || "unknown", attributionRequired: true },
    reason: `Unrecognized/non-free license (${short || "unknown"}) — skipped`,
  };
}
