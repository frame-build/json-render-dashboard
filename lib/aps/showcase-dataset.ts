import { readFile } from "node:fs/promises";
import path from "node:path";
import { gunzipSync } from "node:zlib";

export type ShowcaseElementKind =
  | "reference-level"
  | "direct-instance"
  | "instance"
  | "subcomponent"
  | "group";

export type ShowcaseQuantityKey =
  | "length"
  | "area"
  | "volume"
  | "width"
  | "height"
  | "thickness"
  | "perimeter";

export interface ShowcaseElement {
  dbId: number;
  externalId: string | null;
  name: string | null;
  kind: ShowcaseElementKind;
  category: string | null;
  family: string | null;
  type: string | null;
  parent: string | null;
  level: string | null;
  topLevel: string | null;
  material: string | null;
  activity: string | null;
  typeName: string | null;
  comments: string | null;
  finish: string | null;
  function: string | null;
  quantities: Record<ShowcaseQuantityKey, number | null>;
}

export interface ShowcaseDataset {
  version: number;
  generatedAt: string;
  quantityUnits: Record<ShowcaseQuantityKey, string | null>;
  elements: ShowcaseElement[];
}

export interface ShowcaseFacetValue {
  value: string;
  count: number;
}

export interface ShowcaseDatasetSummary {
  version: number;
  generatedAt: string;
  source: {
    objectTree: string;
    properties: string;
  };
  counts: {
    totalNodes: number;
    leafNodes: number;
    quantifiableLeafNodes: number;
  };
  quantityCoverage: Record<ShowcaseQuantityKey, number>;
  quantityUnits: Record<ShowcaseQuantityKey, string | null>;
  facets: {
    kinds: ShowcaseFacetValue[];
    categories: ShowcaseFacetValue[];
    families: ShowcaseFacetValue[];
    types: ShowcaseFacetValue[];
    levels: ShowcaseFacetValue[];
    materials: ShowcaseFacetValue[];
    activities: ShowcaseFacetValue[];
  };
}

export interface ShowcaseDatasetFilters {
  kinds?: ShowcaseElementKind[];
  categories?: string[];
  families?: string[];
  types?: string[];
  levels?: string[];
  materials?: string[];
  activities?: string[];
  search?: string;
}

const elementsPath = path.join(
  process.cwd(),
  "data",
  "aps",
  "showcase",
  "normalized",
  "elements.json.gz",
);
const summaryPath = path.join(
  process.cwd(),
  "data",
  "aps",
  "showcase",
  "normalized",
  "summary.json",
);

let datasetPromise: Promise<ShowcaseDataset> | null = null;
let summaryPromise: Promise<ShowcaseDatasetSummary> | null = null;

async function readGzipJson<T>(filePath: string): Promise<T> {
  const compressed = await readFile(filePath);
  return JSON.parse(gunzipSync(compressed).toString("utf8")) as T;
}

async function readJson<T>(filePath: string): Promise<T> {
  return JSON.parse(await readFile(filePath, "utf8")) as T;
}

export async function getShowcaseDataset() {
  datasetPromise ??= readGzipJson<ShowcaseDataset>(elementsPath);
  return datasetPromise;
}

export async function getShowcaseDatasetSummary() {
  summaryPromise ??= readJson<ShowcaseDatasetSummary>(summaryPath);
  return summaryPromise;
}

export async function getShowcaseElementByDbId(dbId: number) {
  const dataset = await getShowcaseDataset();
  return dataset.elements.find((element) => element.dbId === dbId) ?? null;
}

function matchesFacet(
  value: string | null,
  accepted: string[] | undefined,
): boolean {
  if (!accepted || accepted.length === 0) return true;
  if (!value) return false;
  return accepted.includes(value);
}

export function filterShowcaseElements(
  elements: ShowcaseElement[],
  filters: ShowcaseDatasetFilters,
) {
  const search = filters.search?.trim().toLowerCase();

  return elements.filter((element) => {
    if (!matchesFacet(element.kind, filters.kinds)) return false;
    if (!matchesFacet(element.category, filters.categories)) return false;
    if (!matchesFacet(element.family, filters.families)) return false;
    if (!matchesFacet(element.type, filters.types)) return false;
    if (!matchesFacet(element.level, filters.levels)) return false;
    if (!matchesFacet(element.material, filters.materials)) return false;
    if (!matchesFacet(element.activity, filters.activities)) return false;

    if (!search) return true;

    const haystack = [
      element.name,
      element.externalId,
      element.category,
      element.family,
      element.type,
      element.parent,
      element.level,
      element.topLevel,
      element.material,
      element.activity,
      element.typeName,
      element.comments,
      element.finish,
      element.function,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    return haystack.includes(search);
  });
}

export function summarizeShowcaseElements(elements: ShowcaseElement[]) {
  return elements.reduce(
    (summary, element) => {
      summary.elementCount += 1;

      for (const [key, value] of Object.entries(element.quantities) as Array<
        [ShowcaseQuantityKey, number | null]
      >) {
        if (value == null) continue;
        summary.totals[key] += value;
      }

      return summary;
    },
    {
      elementCount: 0,
      totals: {
        length: 0,
        area: 0,
        volume: 0,
        width: 0,
        height: 0,
        thickness: 0,
        perimeter: 0,
      } as Record<ShowcaseQuantityKey, number>,
    },
  );
}
