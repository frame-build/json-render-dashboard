export const APP_DISPLAY_NAME = "json-render-dashboard";

function collapseWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

export function cleanDashboardTitle(value?: string | null) {
  const title = collapseWhitespace(value?.trim() ?? "");
  if (!title) {
    return "Showcase Dashboard";
  }

  const withoutPrefix = title
    .replace(/^aps\s+dashboard(?:\s+showcase)?\s*[:\-|]?\s*/i, "")
    .replace(/^shared\s+dashboard\s*[:\-|]?\s*/i, "")
    .replace(/\|\s*shared dashboard$/i, "")
    .trim();

  return withoutPrefix || "Showcase Dashboard";
}

export function toRepoStyleDashboardName(value?: string | null) {
  const cleaned = cleanDashboardTitle(value);
  const tokens = cleaned
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .map((token) => token.trim())
    .filter(Boolean);

  const compactTokens =
    tokens.length > 1 ? tokens.filter((token) => token !== "the") : tokens;

  return (compactTokens.length > 0
    ? compactTokens
    : ["showcase", "dashboard"]
  )
    .slice(0, 6)
    .join("-");
}
