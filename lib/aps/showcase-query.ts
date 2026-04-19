import {
  filterShowcaseElements,
  getShowcaseDataset,
  summarizeShowcaseElements,
  type ShowcaseDatasetFilters,
  type ShowcaseElement,
  type ShowcaseElementKind,
  type ShowcaseQuantityKey,
} from "@/lib/aps/showcase-dataset";

export interface ShowcaseTakeoffQueryInput extends ShowcaseDatasetFilters {
  rowLimit?: number;
  groupLimit?: number;
  facetLimit?: number;
  maxDbIdsForIsolation?: number;
}

export interface ShowcaseTakeoffQueryResult {
  filters: ShowcaseDatasetFilters;
  summary: {
    elementCount: number;
    totals: Record<ShowcaseQuantityKey, number>;
    quantityUnits: Record<ShowcaseQuantityKey, string | null>;
  };
  totalRowCount: number;
  facets: {
    kinds: Array<{ value: ShowcaseElementKind; count: number }>;
    categories: Array<{ value: string; count: number }>;
    families: Array<{ value: string; count: number }>;
    types: Array<{ value: string; count: number }>;
    levels: Array<{ value: string; count: number }>;
    materials: Array<{ value: string; count: number }>;
    activities: Array<{ value: string; count: number }>;
  };
  grouped: {
    byType: Array<ShowcaseGroupRow>;
    byLevel: Array<ShowcaseGroupRow>;
    byMaterial: Array<ShowcaseGroupRow>;
    byActivity: Array<ShowcaseGroupRow>;
  };
  rows: ShowcaseTakeoffRow[];
  viewer: {
    canIsolate: boolean;
    isolatedDbIds: number[] | null;
  };
}

export interface ShowcaseTakeoffRow {
  dbId: number;
  name: string | null;
  category: string | null;
  family: string | null;
  type: string | null;
  level: string | null;
  material: string | null;
  activity: string | null;
  length: number | null;
  area: number | null;
  volume: number | null;
}

export interface ShowcaseGroupRow {
  label: string;
  count: number;
  length: number;
  area: number;
  volume: number;
  dbIds: number[];
}

function normalizeFilterValues(values?: string[] | null) {
  if (!values) return undefined;

  const normalized = [...new Set(values.map((value) => value.trim()).filter(Boolean))];
  return normalized.length > 0 ? normalized : undefined;
}

function normalizeKindValues(values?: ShowcaseElementKind[] | null) {
  if (!values) return undefined;

  const normalized = [...new Set(values.map((value) => value.trim()))].filter(
    Boolean,
  ) as ShowcaseElementKind[];

  return normalized.length > 0 ? normalized : undefined;
}

function normalizeFilters(input: ShowcaseTakeoffQueryInput): ShowcaseDatasetFilters {
  return {
    kinds: normalizeKindValues(input.kinds),
    categories: normalizeFilterValues(input.categories),
    families: normalizeFilterValues(input.families),
    types: normalizeFilterValues(input.types),
    levels: normalizeFilterValues(input.levels),
    materials: normalizeFilterValues(input.materials),
    activities: normalizeFilterValues(input.activities),
    search: input.search?.trim() || undefined,
  };
}

function incrementFacet(map: Map<string, number>, value: string | null) {
  if (!value) return;
  map.set(value, (map.get(value) ?? 0) + 1);
}

function serializeFacetMap(
  map: Map<string, number>,
  limit: number,
): Array<{ value: string; count: number }> {
  return [...map.entries()]
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count;
      return a.value.localeCompare(b.value);
    })
    .slice(0, limit);
}

function buildGroupedRows(
  elements: ShowcaseElement[],
  key: "type" | "level" | "material" | "activity",
  limit: number,
) {
  const groups = new Map<string, ShowcaseGroupRow>();

  for (const element of elements) {
    const label =
      key === "type" ? element.type ?? element.typeName : element[key];
    if (!label) continue;

    const existing = groups.get(label) ?? {
      label,
      count: 0,
      length: 0,
      area: 0,
      volume: 0,
      dbIds: [],
    };

    existing.count += 1;
    existing.length += element.quantities.length ?? 0;
    existing.area += element.quantities.area ?? 0;
    existing.volume += element.quantities.volume ?? 0;
    existing.dbIds.push(element.dbId);

    groups.set(label, existing);
  }

  return [...groups.values()]
    .sort((a, b) => {
      if (b.area !== a.area) return b.area - a.area;
      if (b.volume !== a.volume) return b.volume - a.volume;
      if (b.length !== a.length) return b.length - a.length;
      return b.count - a.count;
    })
    .slice(0, limit);
}

function toRow(element: ShowcaseElement): ShowcaseTakeoffRow {
  return {
    dbId: element.dbId,
    name: element.name,
    category: element.category,
    family: element.family,
    type: element.type ?? element.typeName,
    level: element.level,
    material: element.material,
    activity: element.activity,
    length: element.quantities.length,
    area: element.quantities.area,
    volume: element.quantities.volume,
  };
}

export async function queryShowcaseTakeoff(
  input: ShowcaseTakeoffQueryInput,
): Promise<ShowcaseTakeoffQueryResult> {
  const filters = normalizeFilters(input);
  const dataset = await getShowcaseDataset();
  const filtered = filterShowcaseElements(dataset.elements, filters);
  const summary = summarizeShowcaseElements(filtered);

  const rowLimit =
    typeof input.rowLimit === "number"
      ? Math.max(1, Math.min(input.rowLimit, 5000))
      : null;
  const groupLimit = Math.max(1, Math.min(input.groupLimit ?? 12, 30));
  const facetLimit = Math.max(1, Math.min(input.facetLimit ?? 200, 500));
  const maxDbIdsForIsolation = Math.max(
    1,
    Math.min(input.maxDbIdsForIsolation ?? 4000, 10000),
  );
  const sortedRows = filtered
    .slice()
    .sort((a, b) => (b.quantities.area ?? 0) - (a.quantities.area ?? 0));

  const kindCounts = new Map<string, number>();
  const categoryCounts = new Map<string, number>();
  const familyCounts = new Map<string, number>();
  const typeCounts = new Map<string, number>();
  const levelCounts = new Map<string, number>();
  const materialCounts = new Map<string, number>();
  const activityCounts = new Map<string, number>();

  for (const element of filtered) {
    incrementFacet(kindCounts, element.kind);
    incrementFacet(categoryCounts, element.category);
    incrementFacet(familyCounts, element.family);
    incrementFacet(typeCounts, element.type ?? element.typeName);
    incrementFacet(levelCounts, element.level);
    incrementFacet(materialCounts, element.material);
    incrementFacet(activityCounts, element.activity);
  }

  const isolatedDbIds =
    filtered.length <= maxDbIdsForIsolation
      ? filtered.map((element) => element.dbId)
      : null;

  return {
    filters,
    summary: {
      elementCount: summary.elementCount,
      totals: summary.totals,
      quantityUnits: dataset.quantityUnits,
    },
    totalRowCount: sortedRows.length,
    facets: {
      kinds: serializeFacetMap(kindCounts, facetLimit) as Array<{
        value: ShowcaseElementKind;
        count: number;
      }>,
      categories: serializeFacetMap(categoryCounts, facetLimit),
      families: serializeFacetMap(familyCounts, facetLimit),
      types: serializeFacetMap(typeCounts, facetLimit),
      levels: serializeFacetMap(levelCounts, facetLimit),
      materials: serializeFacetMap(materialCounts, facetLimit),
      activities: serializeFacetMap(activityCounts, facetLimit),
    },
    grouped: {
      byType: buildGroupedRows(filtered, "type", groupLimit),
      byLevel: buildGroupedRows(filtered, "level", groupLimit),
      byMaterial: buildGroupedRows(filtered, "material", groupLimit),
      byActivity: buildGroupedRows(filtered, "activity", groupLimit),
    },
    rows: (rowLimit ? sortedRows.slice(0, rowLimit) : sortedRows).map(toRow),
    viewer: {
      canIsolate: isolatedDbIds !== null,
      isolatedDbIds,
    },
  };
}
