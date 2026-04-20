import type { Spec } from "@json-render/react";
import {
  getShareSpecVersion,
  SHARE_SPEC_VERSION,
} from "@/lib/render/share-spec-version";

type JsonLike = Record<string, unknown>;

const SHELL_TYPE = "ShowcaseDashboardLayout";
const PASSTHROUGH_ROOT_TYPES = new Set(["PromptRefinementChooser"]);
const CONTAINER_TYPES = new Set(["Card", "Stack", "Grid", "Tabs", "TabContent"]);
const FILTER_TYPES = new Set(["SelectInput", "TextInput", "RadioGroup"]);
const CHART_TYPES = new Set(["BarChart", "LineChart", "PieChart"]);
const MIN_FILTER_CONTROLS = 4;
const DIRECT_CHART_LIMIT = 1;
const PAGED_CHART_THRESHOLD = 6;
const DETAIL_PRIMARY_PAGE_SIZE = 25;
const DETAIL_SECONDARY_PAGE_SIZE = 12;
const DETAIL_ROW_COLUMNS = [
  { key: "name", label: "Name" },
  { key: "category", label: "Category" },
  { key: "type", label: "Type" },
  { key: "level", label: "Level" },
  { key: "material", label: "Material" },
  { key: "area", label: "Area" },
  { key: "volume", label: "Volume" },
];
const GROUPED_DETAIL_COLUMNS = [
  { key: "label", label: "Label" },
  { key: "count", label: "Count" },
  { key: "length", label: "Length" },
  { key: "area", label: "Area" },
  { key: "volume", label: "Volume" },
];

interface NodeInfo {
  key: string;
  type: string;
  depth: number;
  subtreeSize: number;
  metricCount: number;
  filterCount: number;
  chartCount: number;
  tableCount: number;
  viewerCount: number;
}

function isJsonLike(value: unknown): value is JsonLike {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function hasStatePathValue(state: JsonLike, path: string) {
  const segments = path.split("/").filter(Boolean);
  let current: unknown = state;

  for (const segment of segments) {
    if (!isJsonLike(current) || !(segment in current)) {
      return false;
    }

    current = current[segment];
  }

  return true;
}

function withStatePathDefault(
  state: JsonLike,
  path: string,
  value: unknown,
): JsonLike {
  if (hasStatePathValue(state, path)) {
    return state;
  }

  const segments = path.split("/").filter(Boolean);
  if (segments.length === 0) {
    return state;
  }

  const nextState: JsonLike = { ...state };
  let current: JsonLike = nextState;

  for (const [index, segment] of segments.entries()) {
    const isLeaf = index === segments.length - 1;

    if (isLeaf) {
      current[segment] = value;
      continue;
    }

    const existing = current[segment];
    const nextChild = isJsonLike(existing) ? { ...existing } : {};
    current[segment] = nextChild;
    current = nextChild;
  }

  return nextState;
}

function normalizeGroupingLabel(value: unknown) {
  return String(value ?? "").trim();
}

function buildGroupedDbIdLookup(
  rows: JsonLike[],
  labelSelector: (row: JsonLike) => unknown,
) {
  const lookup = new Map<string, number[]>();

  for (const row of rows) {
    if (typeof row.dbId !== "number") {
      continue;
    }

    const label = normalizeGroupingLabel(labelSelector(row));
    if (!label) {
      continue;
    }

    const current = lookup.get(label) ?? [];
    current.push(row.dbId);
    lookup.set(label, current);
  }

  return lookup;
}

function withGroupedDbIds(
  grouped: unknown,
  lookup: Map<string, number[]>,
): unknown {
  if (!Array.isArray(grouped) || lookup.size === 0) {
    return grouped;
  }

  return grouped.map((entry) => {
    if (!isJsonLike(entry)) {
      return entry;
    }

    const label = normalizeGroupingLabel(entry.label);
    if (!label) {
      return entry;
    }

    const derivedDbIds = lookup.get(label) ?? [];
    const existingDbIds = Array.isArray(entry.dbIds)
      ? entry.dbIds.filter((value): value is number => typeof value === "number")
      : [];

    if (existingDbIds.length > 0 || derivedDbIds.length === 0) {
      return entry;
    }

    return {
      ...entry,
      dbIds: Array.from(new Set(derivedDbIds)),
    };
  });
}

function enrichShowcaseAnalysisState(spec: Spec): Spec {
  const currentState = isJsonLike(spec.state) ? spec.state : null;
  const analysis = currentState && isJsonLike(currentState.analysis)
    ? currentState.analysis
    : null;

  if (!analysis) {
    return spec;
  }

  const rows = Array.isArray(analysis.rows)
    ? analysis.rows.filter((row): row is JsonLike => isJsonLike(row))
    : [];

  if (rows.length === 0) {
    return spec;
  }

  const grouped = isJsonLike(analysis.grouped) ? analysis.grouped : null;
  if (!grouped) {
    return spec;
  }

  const nextGrouped = {
    ...grouped,
    byType: withGroupedDbIds(
      grouped.byType,
      buildGroupedDbIdLookup(rows, (row) => row.type ?? row.typeName),
    ),
    byLevel: withGroupedDbIds(
      grouped.byLevel,
      buildGroupedDbIdLookup(rows, (row) => row.level),
    ),
    byMaterial: withGroupedDbIds(
      grouped.byMaterial,
      buildGroupedDbIdLookup(rows, (row) => row.material),
    ),
    byActivity: withGroupedDbIds(
      grouped.byActivity,
      buildGroupedDbIdLookup(rows, (row) => row.activity),
    ),
  };

  return {
    ...spec,
    state: {
      ...currentState,
      analysis: {
        ...analysis,
        grouped: nextGrouped,
      },
    },
  };
}

function findShowcaseUrn(value: unknown): string | null {
  if (typeof value === "string") {
    return value.startsWith("dXJu") ? value : null;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const urn = findShowcaseUrn(item);
      if (urn) return urn;
    }
    return null;
  }

  if (!value || typeof value !== "object") {
    return null;
  }

  const record = value as JsonLike;
  if (typeof record.urn === "string" && record.urn.startsWith("dXJu")) {
    return record.urn;
  }

  for (const item of Object.values(record)) {
    const urn = findShowcaseUrn(item);
    if (urn) return urn;
  }

  return null;
}

function nextAvailableKey(spec: Spec, baseKey: string) {
  if (!spec.elements[baseKey]) return baseKey;

  let index = 1;
  while (spec.elements[`${baseKey}-${index}`]) {
    index += 1;
  }

  return `${baseKey}-${index}`;
}

function nextAvailableElementKey(
  elements: Spec["elements"],
  baseKey: string,
): string {
  if (!elements[baseKey]) return baseKey;

  let index = 1;
  while (elements[`${baseKey}-${index}`]) {
    index += 1;
  }

  return `${baseKey}-${index}`;
}

function buildParentMap(spec: Spec) {
  const parentMap = new Map<string, string | null>();
  parentMap.set(spec.root, null);

  for (const [key, element] of Object.entries(spec.elements)) {
    for (const child of element.children ?? []) {
      if (spec.elements[child]) {
        parentMap.set(child, key);
      }
    }
  }

  return parentMap;
}

function sanitizeTabNodes(spec: Spec) {
  const parentMap = buildParentMap(spec);
  let changed = false;
  const nextElements: Spec["elements"] = { ...spec.elements };

  for (const [key, element] of Object.entries(spec.elements)) {
    if (element.type !== "TabContent") {
      continue;
    }

    const parentKey = parentMap.get(key) ?? null;
    const parent = parentKey ? spec.elements[parentKey] : null;
    const isNestedInTabs = parent?.type === "Tabs";

    if (isNestedInTabs) {
      continue;
    }

    changed = true;
    nextElements[key] = {
      type: "Stack",
      props: {
        direction: "vertical",
        gap: "sm",
      },
      children: [...(element.children ?? [])],
    };
  }

  if (!changed) {
    return spec;
  }

  return {
    ...spec,
    elements: nextElements,
  };
}

function getDepth(key: string, parentMap: Map<string, string | null>) {
  let depth = 0;
  let current = parentMap.get(key) ?? null;

  while (current) {
    depth += 1;
    current = parentMap.get(current) ?? null;
  }

  return depth;
}

function isAncestor(
  ancestor: string,
  child: string,
  parentMap: Map<string, string | null>,
) {
  let current = parentMap.get(child) ?? null;
  while (current) {
    if (current === ancestor) {
      return true;
    }
    current = parentMap.get(current) ?? null;
  }
  return false;
}

function classifySpec(spec: Spec) {
  const parentMap = buildParentMap(spec);
  const memo = new Map<string, NodeInfo>();

  function visit(key: string): NodeInfo {
    const cached = memo.get(key);
    if (cached) {
      return cached;
    }

    const element = spec.elements[key];
    if (!element) {
      const missing: NodeInfo = {
        key,
        type: "MissingElement",
        depth: getDepth(key, parentMap),
        subtreeSize: 0,
        metricCount: 0,
        filterCount: 0,
        chartCount: 0,
        tableCount: 0,
        viewerCount: 0,
      };
      memo.set(key, missing);
      return missing;
    }

    const children = element.children ?? [];

    let subtreeSize = 1;
    let metricCount = element.type === "Metric" ? 1 : 0;
    let filterCount = FILTER_TYPES.has(element.type) ? 1 : 0;
    let chartCount = CHART_TYPES.has(element.type) ? 1 : 0;
    let tableCount = element.type === "Table" ? 1 : 0;
    let viewerCount = element.type === "AutodeskViewer" ? 1 : 0;

    for (const child of children) {
      const childInfo = visit(child);
      subtreeSize += childInfo.subtreeSize;
      metricCount += childInfo.metricCount;
      filterCount += childInfo.filterCount;
      chartCount += childInfo.chartCount;
      tableCount += childInfo.tableCount;
      viewerCount += childInfo.viewerCount;
    }

    const info: NodeInfo = {
      key,
      type: element.type,
      depth: getDepth(key, parentMap),
      subtreeSize,
      metricCount,
      filterCount,
      chartCount,
      tableCount,
      viewerCount,
    };

    memo.set(key, info);
    return info;
  }

  for (const key of Object.keys(spec.elements)) {
    visit(key);
  }

  return { parentMap, infoByKey: memo };
}

function candidateScore(info: NodeInfo) {
  const containerScore = CONTAINER_TYPES.has(info.type)
    ? info.type === "Card"
      ? 3
      : 2
    : 1;

  return containerScore * 10_000 + info.depth * 100 - info.subtreeSize;
}

function chooseSections(
  spec: Spec,
  infoByKey: Map<string, NodeInfo>,
  parentMap: Map<string, string | null>,
  predicate: (info: NodeInfo) => boolean,
  limit: number,
  blockedKeys: string[],
) {
  const blocked = new Set(blockedKeys.filter(Boolean));
  const candidates = Array.from(infoByKey.values())
    .filter((info): info is NodeInfo => Boolean(info))
    .filter(predicate)
    .filter((info) => {
      for (const blockedKey of blocked) {
        if (
          info.key === blockedKey ||
          isAncestor(blockedKey, info.key, parentMap) ||
          isAncestor(info.key, blockedKey, parentMap)
        ) {
          return false;
        }
      }
      return true;
    })
    .sort((a, b) => candidateScore(b) - candidateScore(a));

  const selected: string[] = [];

  for (const candidate of candidates) {
    const conflicts = selected.some(
      (selectedKey) =>
        selectedKey === candidate.key ||
        isAncestor(selectedKey, candidate.key, parentMap) ||
        isAncestor(candidate.key, selectedKey, parentMap),
    );

    if (conflicts) {
      continue;
    }

    selected.push(candidate.key);
    if (selected.length >= limit) {
      break;
    }
  }

  return selected;
}

function wrapInCard(
  spec: Spec,
  childKeys: string[],
  baseKey: string,
  title: string,
  description?: string,
) {
  const wrapperKey = nextAvailableKey(spec, baseKey);
  const nextSpec: Spec = {
    ...spec,
    elements: {
      ...spec.elements,
      [wrapperKey]: {
        type: "Card",
        props: {
          title,
          description: description ?? null,
        },
        children: childKeys,
      },
    },
  };

  return { spec: nextSpec, key: wrapperKey };
}

function ensureViewerSection(spec: Spec) {
  const urn =
    findShowcaseUrn(spec.state) ??
    findShowcaseUrn(Object.values(spec.elements).map((element) => element.props));

  const viewerEntries = Object.entries(spec.elements).filter(
    ([, element]) => element.type === "AutodeskViewer",
  );

  if (viewerEntries.length > 0) {
    if (!urn) {
      return spec;
    }

    let changed = false;
    const nextElements = { ...spec.elements };

    for (const [key, element] of viewerEntries) {
      const currentUrn =
        typeof element.props?.urn === "string" ? element.props.urn.trim() : "";
      const currentIsolatedDbIds = element.props?.isolatedDbIds;
      const currentFitToView = element.props?.fitToView;
      const nextProps = {
        ...element.props,
        urn: currentUrn || urn,
        isolatedDbIds:
          currentIsolatedDbIds ?? { $state: "/analysis/viewer/isolatedDbIds" },
        fitToView: currentFitToView ?? true,
      };

      if (
        currentUrn
        && currentIsolatedDbIds !== undefined
        && currentFitToView !== undefined
      ) {
        continue;
      }

      changed = true;
      nextElements[key] = {
        ...element,
        props: nextProps,
      };
    }

    return changed
      ? {
          ...spec,
          elements: nextElements,
        }
      : spec;
  }

  if (!urn) {
    return spec;
  }

  const viewerKey = nextAvailableKey(spec, "showcase-viewer");
  const viewerCardKey = nextAvailableKey(spec, "showcase-viewer-card");

  return {
    ...spec,
    elements: {
      ...spec.elements,
      [viewerKey]: {
        type: "AutodeskViewer",
        props: {
          urn,
          height: "560px",
          showModelBrowser: false,
          fitToView: true,
        },
      },
      [viewerCardKey]: {
        type: "Card",
        props: {
          title: "3D Model Viewer",
          description:
            "Autodesk Viewer is pinned into every showcase dashboard for model context.",
        },
        children: [viewerKey],
      },
    },
  };
}

function createMetricSection(spec: Spec, metricKeys: string[]) {
  if (metricKeys.length === 0) {
    return { spec, key: null as string | null };
  }

  const columnCount =
    metricKeys.length >= 4 ? 2 : Math.min(Math.max(metricKeys.length, 1), 3);
  const gridKey = nextAvailableKey(spec, "showcase-kpi-grid");
  const nextSpec: Spec = {
    ...spec,
    elements: {
      ...spec.elements,
      [gridKey]: {
        type: "ShowcaseKpiGrid",
        props: {
          columns: columnCount,
          gap: "md",
        },
        children: metricKeys.slice(0, 4),
      },
    },
  };

  return { spec: nextSpec, key: gridKey };
}

function getKpiColumnCount(metricCount: number) {
  if (metricCount >= 4) return 2;
  if (metricCount === 3) return 3;
  return Math.min(Math.max(metricCount, 1), 2);
}

interface FilterCandidate {
  id: string;
  kind: "select" | "text";
  label: string;
  bindPath: string;
  options?: string[];
  placeholder?: string;
}

function collectSubtreeKeys(elements: Spec["elements"], rootKey: string) {
  const visited = new Set<string>();
  const stack = [rootKey];
  const ordered: string[] = [];

  while (stack.length > 0) {
    const key = stack.pop()!;
    if (visited.has(key)) continue;
    visited.add(key);
    ordered.push(key);

    const element = elements[key];
    if (!element) continue;
    const children = [...(element.children ?? [])];
    for (const child of children.reverse()) {
      if (elements[child]) {
        stack.push(child);
      }
    }
  }

  return ordered;
}

function collectFilterKeysInSubtree(elements: Spec["elements"], rootKey: string) {
  return collectSubtreeKeys(elements, rootKey).filter((key) =>
    FILTER_TYPES.has(elements[key]?.type ?? ""),
  );
}

function getBindStatePath(value: unknown) {
  if (!isJsonLike(value)) return null;
  const bind = value.$bindState;
  return typeof bind === "string" && bind.trim().length > 0 ? bind : null;
}

function toTitleLabel(value: string) {
  return value
    .replace(/[_-]+/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join(" ");
}

function normalizedToken(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function buildAdaptiveFilterCandidates(
  spec: Spec,
  existingBindPaths: Set<string>,
  existingLabels: Set<string>,
) {
  const stateRoot = isJsonLike(spec.state) ? spec.state : {};
  const analysis = isJsonLike(stateRoot.analysis) ? stateRoot.analysis : {};
  const facets = isJsonLike(analysis.facets) ? analysis.facets : {};
  const candidates: FilterCandidate[] = [];

  for (const [facetKey, facetValue] of Object.entries(facets)) {
    if (facetKey === "kinds") continue;
    if (!Array.isArray(facetValue)) continue;

    const values = Array.from(
      new Set(
        facetValue
          .map((item) =>
            isJsonLike(item) && typeof item.value === "string"
              ? item.value.trim()
              : null,
          )
          .filter((item): item is string => Boolean(item)),
      ),
    );

    if (values.length === 0) continue;

    const bindPath = `/ui/filters/${facetKey}`;
    const label = toTitleLabel(facetKey);
    if (existingBindPaths.has(bindPath)) continue;
    if (existingLabels.has(normalizedToken(label))) continue;

    candidates.push({
      id: facetKey,
      kind: "select",
      label,
      bindPath,
      options: values,
      placeholder: `All ${label}`,
    });
  }

  candidates.sort((a, b) => {
    const aSize = a.options?.length ?? 0;
    const bSize = b.options?.length ?? 0;
    if (bSize !== aSize) return bSize - aSize;
    return a.label.localeCompare(b.label);
  });

  if (
    !existingBindPaths.has("/ui/filters/search") &&
    !existingLabels.has(normalizedToken("Search"))
  ) {
    candidates.push({
      id: "search",
      kind: "text",
      label: "Search",
      bindPath: "/ui/filters/search",
      placeholder: "Search model elements...",
    });
  }

  return candidates;
}

function ensureMinimumFilterControls(
  spec: Spec,
  filterSectionKey: string | null,
  minimumCount = MIN_FILTER_CONTROLS,
) {
  const nextElements: Spec["elements"] = { ...spec.elements };
  let nextState = isJsonLike(spec.state) ? { ...spec.state } : {};
  let sectionKey = filterSectionKey;

  if (!sectionKey) {
    sectionKey = nextAvailableElementKey(nextElements, "showcase-filters-card");
    nextElements[sectionKey] = {
      type: "Card",
      props: {
        title: "Filters",
        description: "Use these slicers to refine the model data shown in the dashboard.",
      },
      children: [],
    };
  }

  const section = nextElements[sectionKey];
  if (!section) {
    return { spec, filterSectionKey };
  }

  const existingFilterKeys = collectFilterKeysInSubtree(nextElements, sectionKey);
  const existingBindPaths = new Set<string>();
  const existingLabels = new Set<string>();

  for (const key of existingFilterKeys) {
    const element = nextElements[key];
    if (!element) continue;
    const bindPath = getBindStatePath(element.props?.value);
    if (bindPath) {
      existingBindPaths.add(bindPath);
      if (!("statePath" in (element.props ?? {}))) {
        nextElements[key] = {
          ...element,
          props: {
            ...element.props,
            statePath: bindPath,
          },
        };
      }
    }
    if (typeof element.props?.label === "string" && element.props.label.trim()) {
      existingLabels.add(normalizedToken(element.props.label));
    }
  }

  let needed = Math.max(0, minimumCount - existingFilterKeys.length);
  const addedFilterKeys: string[] = [];

  if (needed > 0) {
    const candidates = buildAdaptiveFilterCandidates(
      { ...spec, elements: nextElements },
      existingBindPaths,
      existingLabels,
    );

    for (const candidate of candidates) {
      if (needed <= 0) break;

      const elementKey = nextAvailableElementKey(
        nextElements,
        `showcase-filter-${candidate.id}`,
      );
      if (candidate.kind === "select") {
        const options = [
          {
            value: "__all__",
            label: candidate.placeholder ?? `All ${candidate.label}`,
          },
          ...(candidate.options ?? []).slice(0, 30).map((value) => ({
            value,
            label: value,
          })),
        ];
        nextElements[elementKey] = {
          type: "SelectInput",
          props: {
            label: candidate.label,
            statePath: candidate.bindPath,
            value: { $bindState: candidate.bindPath },
            placeholder: candidate.placeholder ?? `All ${candidate.label}`,
            options,
          },
        };
        nextState = withStatePathDefault(nextState, candidate.bindPath, "__all__");
      } else {
        nextElements[elementKey] = {
          type: "TextInput",
          props: {
            label: candidate.label,
            statePath: candidate.bindPath,
            value: { $bindState: candidate.bindPath },
            placeholder: candidate.placeholder ?? "Type to filter...",
            type: "text",
          },
        };
        nextState = withStatePathDefault(nextState, candidate.bindPath, "");
      }

      existingBindPaths.add(candidate.bindPath);
      existingLabels.add(normalizedToken(candidate.label));
      addedFilterKeys.push(elementKey);
      needed -= 1;
    }
  }

  let fallbackIndex = 1;
  while (needed > 0) {
    const bindPath = `/ui/filters/custom-${fallbackIndex}`;
    fallbackIndex += 1;
    if (existingBindPaths.has(bindPath)) continue;

    const elementKey = nextAvailableElementKey(
      nextElements,
      `showcase-filter-custom-${fallbackIndex}`,
    );
    nextElements[elementKey] = {
      type: "TextInput",
      props: {
        label: `Filter ${fallbackIndex - 1}`,
        statePath: bindPath,
        value: { $bindState: bindPath },
        placeholder: "Type to filter...",
        type: "text",
      },
    };
    nextState = withStatePathDefault(nextState, bindPath, "");

    existingBindPaths.add(bindPath);
    addedFilterKeys.push(elementKey);
    needed -= 1;
  }

  if (section.type === "ShowcaseFilterGrid") {
    const mergedChildren = Array.from(
      new Set([...(section.children ?? []), ...addedFilterKeys]),
    );
    nextElements[sectionKey] = {
      ...section,
      props: {
        ...section.props,
        columns: 2,
        gap: "md",
      },
      children: mergedChildren,
    };

    return {
      spec: {
        ...spec,
        elements: nextElements,
        state: nextState,
      },
      filterSectionKey: sectionKey,
    };
  }

  const sectionChildren = [...(section.children ?? [])];
  const existingGridKey = sectionChildren.find(
    (childKey) => nextElements[childKey]?.type === "ShowcaseFilterGrid",
  );

  if (existingGridKey) {
    const gridElement = nextElements[existingGridKey];
    nextElements[existingGridKey] = {
      ...gridElement,
      props: {
        ...gridElement.props,
        columns: 2,
        gap: "md",
      },
      children: Array.from(
        new Set([...(gridElement.children ?? []), ...addedFilterKeys]),
      ),
    };
  } else {
    const directFilterChildren = sectionChildren.filter((childKey) =>
      FILTER_TYPES.has(nextElements[childKey]?.type ?? ""),
    );
    const nonFilterChildren = sectionChildren.filter(
      (childKey) => !directFilterChildren.includes(childKey),
    );
    const gridChildren = Array.from(
      new Set([...directFilterChildren, ...addedFilterKeys]),
    );

    if (gridChildren.length > 0) {
      const gridKey = nextAvailableElementKey(nextElements, "showcase-filters-grid");
      nextElements[gridKey] = {
        type: "ShowcaseFilterGrid",
        props: {
          columns: 2,
          gap: "md",
        },
        children: gridChildren,
      };

      nextElements[sectionKey] = {
        ...section,
        children: [...nonFilterChildren, gridKey],
      };
    }
  }

  return {
    spec: {
      ...spec,
      elements: nextElements,
      state: nextState,
    },
    filterSectionKey: sectionKey,
  };
}

function maybeWrapSectionCard(
  spec: Spec,
  key: string | null,
  baseKey: string,
  fallbackTitle: string,
  fallbackDescription?: string,
) {
  if (!key) {
    return { spec, key: null as string | null };
  }

  const element = spec.elements[key];
  if (!element) {
    return { spec, key: null as string | null };
  }

  if (element.type === "Card") {
    return { spec, key };
  }

  if (
    element.type === "AutodeskViewer" ||
    CHART_TYPES.has(element.type) ||
    element.type === "Table"
  ) {
    const title =
      typeof element.props?.title === "string" && element.props.title.trim()
        ? (element.props.title as string)
        : fallbackTitle;

    return wrapInCard(spec, [key], baseKey, title, fallbackDescription);
  }

  return { spec, key };
}

function toChartStateSectionKey(key: string) {
  const normalized = key.replace(/[^a-zA-Z0-9_-]/g, "-");
  return normalized.length > 0 ? normalized : "section";
}

function ensureChartPageState(
  spec: Spec,
  sectionStateKey: string,
  defaultPage: string,
) {
  const stateRoot = isJsonLike(spec.state) ? spec.state : {};
  const uiState = isJsonLike(stateRoot.ui) ? stateRoot.ui : {};
  const chartsState = isJsonLike(uiState.charts) ? uiState.charts : {};
  const sectionState = isJsonLike(chartsState[sectionStateKey])
    ? chartsState[sectionStateKey]
    : {};

  if (
    typeof sectionState.page === "string" &&
    sectionState.page.trim().length > 0
  ) {
    return spec;
  }

  return {
    ...spec,
    state: {
      ...stateRoot,
      ui: {
        ...uiState,
        charts: {
          ...chartsState,
          [sectionStateKey]: {
            ...sectionState,
            page: defaultPage,
          },
        },
      },
    },
  };
}

function ensureDetailPageState(
  spec: Spec,
  sectionStateKey: string,
  defaultPage: string,
) {
  const stateRoot = isJsonLike(spec.state) ? spec.state : {};
  const uiState = isJsonLike(stateRoot.ui) ? stateRoot.ui : {};
  const detailState = isJsonLike(uiState.detail) ? uiState.detail : {};
  const sectionState = isJsonLike(detailState[sectionStateKey])
    ? detailState[sectionStateKey]
    : {};

  if (
    typeof sectionState.page === "string" &&
    sectionState.page.trim().length > 0
  ) {
    return spec;
  }

  return {
    ...spec,
    state: {
      ...stateRoot,
      ui: {
        ...uiState,
        detail: {
          ...detailState,
          [sectionStateKey]: {
            ...sectionState,
            page: defaultPage,
          },
        },
      },
    },
  };
}

function tableBindingPath(value: unknown) {
  if (!isJsonLike(value)) {
    return null;
  }

  const statePath = value.$state;
  return typeof statePath === "string" && statePath.trim().length > 0
    ? statePath
    : null;
}

function upgradeLegacyDetailSection(
  spec: Spec,
  sectionKey: string,
) {
  const section = spec.elements[sectionKey];
  if (!section) {
    return { spec, key: sectionKey };
  }

  const sectionTitle =
    typeof section.props?.title === "string" && section.props.title.trim()
      ? section.props.title
      : null;
  const sectionDescription =
    typeof section.props?.description === "string" && section.props.description.trim()
      ? section.props.description
      : null;

  if (section.type === "ShowcasePaginatedTable") {
    return { spec, key: sectionKey };
  }

  const directTable =
    section.type === "Table"
      ? section
      : section.type === "Card" &&
          (section.children?.length ?? 0) === 1 &&
          ["Table", "ShowcasePaginatedTable"].includes(
            spec.elements[section.children![0]]?.type ?? "",
          )
        ? spec.elements[section.children![0]]
        : null;

  const directTableKey =
    section.type === "Table"
      ? sectionKey
      : section.type === "Card" &&
          (section.children?.length ?? 0) === 1 &&
          ["Table", "ShowcasePaginatedTable"].includes(
            spec.elements[section.children![0]]?.type ?? "",
          )
        ? section.children![0]
        : null;

  if (!directTable || !directTableKey) {
    return { spec, key: sectionKey };
  }

  const dataPath = tableBindingPath(directTable.props?.data);
  const isGrouped = typeof dataPath === "string" && dataPath.startsWith("/analysis/grouped/");
  const sectionStateKey = toChartStateSectionKey(directTableKey);
  let nextSpec = ensureDetailPageState(spec, sectionStateKey, "1");

  nextSpec = {
    ...nextSpec,
    elements: {
      ...nextSpec.elements,
      [directTableKey]: {
        type: "ShowcasePaginatedTable",
        props: {
          title:
            sectionTitle ??
            (typeof directTable.props?.title === "string" ? directTable.props.title : null),
          description:
            sectionDescription ??
            (typeof directTable.props?.description === "string"
              ? directTable.props.description
              : null),
          data: directTable.props?.data ?? [],
          columns: Array.isArray(directTable.props?.columns)
            ? directTable.props.columns
            : [],
          page:
            directTable.props?.page ??
            { $bindState: `/ui/detail/${sectionStateKey}/page` },
          pageSize:
            typeof directTable.props?.pageSize === "number"
              ? directTable.props.pageSize
              : isGrouped
                ? DETAIL_SECONDARY_PAGE_SIZE
                : DETAIL_PRIMARY_PAGE_SIZE,
          emptyMessage:
            typeof directTable.props?.emptyMessage === "string"
              ? directTable.props.emptyMessage
              : null,
        },
      },
    },
  };

  return { spec: nextSpec, key: directTableKey };
}

function ensureDeterministicDetailSections(spec: Spec) {
  const stateRoot = isJsonLike(spec.state) ? spec.state : {};
  const analysis = isJsonLike(stateRoot.analysis) ? stateRoot.analysis : null;
  if (!analysis) {
    return { spec, detailSectionKeys: [] as string[] };
  }

  const grouped = isJsonLike(analysis.grouped) ? analysis.grouped : {};
  const groupedByTypePath =
    Array.isArray(grouped.byType) && grouped.byType.length > 0
      ? "/analysis/grouped/byType"
      : Array.isArray(grouped.byLevel) && grouped.byLevel.length > 0
        ? "/analysis/grouped/byLevel"
        : Array.isArray(grouped.byMaterial) && grouped.byMaterial.length > 0
          ? "/analysis/grouped/byMaterial"
          : "/analysis/grouped/byActivity";
  const groupedTitle =
    groupedByTypePath === "/analysis/grouped/byType"
      ? "Summary by Type"
      : groupedByTypePath === "/analysis/grouped/byLevel"
        ? "Summary by Level"
        : groupedByTypePath === "/analysis/grouped/byMaterial"
          ? "Summary by Material"
          : "Summary by Activity";
  const groupedDescription =
    groupedByTypePath === "/analysis/grouped/byType"
      ? "Grouped totals across all matching elements by type."
      : groupedByTypePath === "/analysis/grouped/byLevel"
        ? "Grouped totals across all matching elements by level."
        : groupedByTypePath === "/analysis/grouped/byMaterial"
          ? "Grouped totals across all matching elements by material."
          : "Grouped totals across all matching elements by activity.";

  let nextSpec = ensureDetailPageState(spec, "detailA", "1");
  nextSpec = ensureDetailPageState(nextSpec, "detailB", "1");

  const primaryTableKey = nextAvailableKey(nextSpec, "showcase-detail-primary-table");
  const primaryCardKey = nextAvailableKey(nextSpec, "showcase-detail-primary-card");
  const secondaryTableKey = nextAvailableKey(nextSpec, "showcase-detail-secondary-table");
  const secondaryCardKey = nextAvailableKey(nextSpec, "showcase-detail-secondary-card");

  nextSpec = {
    ...nextSpec,
    elements: {
      ...nextSpec.elements,
      [primaryTableKey]: {
        type: "ShowcasePaginatedTable",
        props: {
          title: "Detailed Breakdown",
          description: "All matching elements for the current query, with pagination.",
          data: { $state: "/analysis/rows" },
          columns: DETAIL_ROW_COLUMNS,
          page: { $bindState: "/ui/detail/detailA/page" },
          pageSize: DETAIL_PRIMARY_PAGE_SIZE,
          emptyMessage: "No detail rows match the current filters.",
        },
      },
      [primaryCardKey]: {
        type: "Card",
        props: {
          title: null,
          description: null,
        },
        children: [primaryTableKey],
      },
      [secondaryTableKey]: {
        type: "ShowcasePaginatedTable",
        props: {
          title: groupedTitle,
          description: groupedDescription,
          data: { $state: groupedByTypePath },
          columns: GROUPED_DETAIL_COLUMNS,
          page: { $bindState: "/ui/detail/detailB/page" },
          pageSize: DETAIL_SECONDARY_PAGE_SIZE,
          emptyMessage: "No grouped summary is available for the current filters.",
        },
      },
      [secondaryCardKey]: {
        type: "Card",
        props: {
          title: null,
          description: null,
        },
        children: [secondaryTableKey],
      },
    },
  };

  return {
    spec: nextSpec,
    detailSectionKeys: [primaryCardKey, secondaryCardKey],
  };
}

function getChartTabLabel(spec: Spec, chartKey: string, index: number) {
  const element = spec.elements[chartKey];
  const title =
    typeof element?.props?.title === "string" ? element.props.title.trim() : "";

  if (!title) {
    return `Chart ${index + 1}`;
  }

  return title.length > 28 ? `${title.slice(0, 25)}...` : title;
}

function organizeChartSectionNavigation(
  spec: Spec,
  sectionKey: string,
  infoByKey: Map<string, NodeInfo>,
) {
  const section = spec.elements[sectionKey];
  if (!section) return spec;

  const sectionChildren = [...(section.children ?? [])];
  if (sectionChildren.length === 0) return spec;

  const hasNavigation = sectionChildren.some((childKey) => {
    const childType = spec.elements[childKey]?.type;
    return childType === "Tabs" || childType === "Pagination";
  });
  if (hasNavigation) {
    return spec;
  }

  const chartSourceKeys = sectionChildren.filter((childKey) => {
    const info = infoByKey.get(childKey);
    return (info?.chartCount ?? 0) > 0;
  });

  if (chartSourceKeys.length === 0) {
    return spec;
  }

  let chartDisplayKeys = [...chartSourceKeys];
  while (chartDisplayKeys.length === 1) {
    const onlyKey = chartDisplayKeys[0];
    const onlyElement = spec.elements[onlyKey];
    if (!onlyElement || CHART_TYPES.has(onlyElement.type)) {
      break;
    }

    const nestedChartKeys = (onlyElement.children ?? []).filter((childKey) => {
      const childInfo = infoByKey.get(childKey);
      return (childInfo?.chartCount ?? 0) > 0;
    });

    const hasMixedChildren = (onlyElement.children ?? []).some((childKey) => {
      const childInfo = infoByKey.get(childKey);
      return (childInfo?.chartCount ?? 0) === 0;
    });

    if (nestedChartKeys.length <= 1 || hasMixedChildren) {
      break;
    }

    chartDisplayKeys = nestedChartKeys;
  }

  // Never use Tabs/TabContent nodes directly as tab pages. If they appear
  // here, expand to their chart-bearing children.
  const expandedDisplayKeys: string[] = [];
  const seenExpanded = new Set<string>();
  const expandNode = (key: string) => {
    if (seenExpanded.has(key)) return;
    seenExpanded.add(key);

    const element = spec.elements[key];
    if (!element) return;

    if (element.type === "Tabs" || element.type === "TabContent") {
      const nested = (element.children ?? []).filter((childKey) => {
        const childInfo = infoByKey.get(childKey);
        return (childInfo?.chartCount ?? 0) > 0;
      });

      if (nested.length > 0) {
        for (const nestedKey of nested) {
          expandNode(nestedKey);
        }
      }
      return;
    }

    expandedDisplayKeys.push(key);
  };

  for (const key of chartDisplayKeys) {
    expandNode(key);
  }

  if (expandedDisplayKeys.length > 0) {
    chartDisplayKeys = expandedDisplayKeys;
  }

  if (chartDisplayKeys.length <= DIRECT_CHART_LIMIT) {
    return spec;
  }

  const sourceSet = new Set(chartSourceKeys);
  const staticChildren = sectionChildren.filter((childKey) => {
    if (sourceSet.has(childKey)) return false;
    return spec.elements[childKey]?.type !== "TabContent";
  });
  const sectionStateKey = toChartStateSectionKey(sectionKey);
  const pageStatePath = `/ui/charts/${sectionStateKey}/page`;

  let nextSpec = ensureChartPageState(spec, sectionStateKey, "1");
  const nextElements: Spec["elements"] = { ...nextSpec.elements };
  const tabContentKeys: string[] = [];
  const tabs = chartDisplayKeys.map((chartKey, index) => {
    const value = String(index + 1);
    const tabContentKey = nextAvailableElementKey(
      nextElements,
      `${sectionStateKey}-tab-content-${value}`,
    );

    nextElements[tabContentKey] = {
      type: "TabContent",
      props: { value },
      children: [chartKey],
    };
    tabContentKeys.push(tabContentKey);

    return {
      value,
      label: getChartTabLabel(nextSpec, chartKey, index),
    };
  });

  const tabsKey = nextAvailableElementKey(nextElements, `${sectionStateKey}-tabs`);
  nextElements[tabsKey] = {
    type: "Tabs",
    props: {
      defaultValue: "1",
      value: { $bindState: pageStatePath },
      editorSectionKey: sectionKey,
      tabs,
    },
    children: tabContentKeys,
  };

  const nextSectionChildren = [...staticChildren, tabsKey];

  if (chartDisplayKeys.length > PAGED_CHART_THRESHOLD) {
    const paginationKey = nextAvailableElementKey(
      nextElements,
      `${sectionStateKey}-pagination`,
    );
    nextElements[paginationKey] = {
      type: "Pagination",
      props: {
        totalPages: chartDisplayKeys.length,
        page: { $bindState: pageStatePath },
      },
    };
    nextSectionChildren.push(paginationKey);
  }

  nextElements[sectionKey] = {
    ...section,
    children: nextSectionChildren,
  };

  nextSpec = {
    ...nextSpec,
    elements: nextElements,
  };

  return nextSpec;
}

function firstTextValue(spec: Spec) {
  for (const key of Object.keys(spec.elements)) {
    const element = spec.elements[key];
    if (element.type === "Heading" && typeof element.props?.content === "string") {
      return element.props.content as string;
    }
    if (element.type === "Text" && typeof element.props?.content === "string") {
      return element.props.content as string;
    }
    if (typeof element.props?.title === "string") {
      return element.props.title as string;
    }
  }

  return null;
}

function getInfoValues(infoByKey: Map<string, NodeInfo>) {
  return Array.from(infoByKey.values());
}

export function normalizeShowcaseDashboardSpec(spec: Spec | null): Spec | null {
  if (!spec) return null;

  const rootType = spec.elements[spec.root]?.type ?? null;
  if (rootType && PASSTHROUGH_ROOT_TYPES.has(rootType)) {
    return spec;
  }

  if (getShareSpecVersion(spec) === SHARE_SPEC_VERSION) {
    return enrichShowcaseAnalysisState(spec);
  }

  let nextSpec = sanitizeTabNodes(ensureViewerSection(enrichShowcaseAnalysisState(spec)));

  if (nextSpec.elements[nextSpec.root]?.type === SHELL_TYPE) {
    let { infoByKey, parentMap } = classifySpec(nextSpec);
    const existingChildren = [...(nextSpec.elements[nextSpec.root].children ?? [])];
    const rootChildInfos = existingChildren
      .map((key) => infoByKey.get(key))
      .filter((info): info is NodeInfo => Boolean(info));

    let filterSectionKey: string | null = existingChildren[0] ?? null;
    if (!filterSectionKey) {
      filterSectionKey =
        rootChildInfos.find(
          (info) =>
            info.filterCount > 0 &&
            info.viewerCount === 0 &&
            info.chartCount === 0 &&
            info.tableCount === 0,
        )?.key ?? null;
    }

    const metricSectionKeys = rootChildInfos
      .filter(
        (info) =>
          info.metricCount > 0 &&
          info.filterCount === 0 &&
          info.viewerCount === 0 &&
          info.chartCount === 0 &&
          info.tableCount === 0,
      )
      .map((info) => info.key);

    const kpiMetricKeys = getInfoValues(infoByKey)
      .filter((info) => info.type === "Metric")
      .filter(
        (info) =>
          metricSectionKeys.length === 0 ||
          metricSectionKeys.some(
            (sectionKey) =>
              info.key === sectionKey || isAncestor(sectionKey, info.key, parentMap),
          ),
      )
      .map((info) => info.key);

    let kpiSectionKey: string | null = null;

    if (kpiMetricKeys.length >= 2) {
      const kpiSection = createMetricSection(nextSpec, kpiMetricKeys);
      nextSpec = kpiSection.spec;
      kpiSectionKey = kpiSection.key;
      ({ infoByKey, parentMap } = classifySpec(nextSpec));
    } else {
      const existingKpiGrid = metricSectionKeys.find(
        (key) =>
          nextSpec.elements[key]?.type === "Grid" ||
          nextSpec.elements[key]?.type === "ShowcaseKpiGrid",
      );
      kpiSectionKey = existingKpiGrid ?? metricSectionKeys[0] ?? null;

      if (
        kpiSectionKey &&
        (nextSpec.elements[kpiSectionKey]?.type === "Grid" ||
          nextSpec.elements[kpiSectionKey]?.type === "ShowcaseKpiGrid")
      ) {
        const currentColumns =
          typeof nextSpec.elements[kpiSectionKey].props?.columns === "number"
            ? nextSpec.elements[kpiSectionKey].props?.columns
            : null;
        const targetColumns = getKpiColumnCount(
          Math.min(nextSpec.elements[kpiSectionKey].children?.length ?? 1, 4),
        );
        if (currentColumns !== targetColumns) {
          nextSpec = {
            ...nextSpec,
            elements: {
              ...nextSpec.elements,
              [kpiSectionKey]: {
                ...nextSpec.elements[kpiSectionKey],
                props: {
                  ...nextSpec.elements[kpiSectionKey].props,
                  columns: targetColumns,
                },
              },
            },
          };
          ({ infoByKey, parentMap } = classifySpec(nextSpec));
        }
      }
    }

    const ensuredFilters = ensureMinimumFilterControls(
      nextSpec,
      filterSectionKey,
      MIN_FILTER_CONTROLS,
    );
    nextSpec = ensuredFilters.spec;
    filterSectionKey = ensuredFilters.filterSectionKey;
    ({ infoByKey, parentMap } = classifySpec(nextSpec));

    let viewerSectionKey: string | null = existingChildren[2] ?? null;
    if (!viewerSectionKey) {
      const blockedTop = [
        ...(filterSectionKey ? [filterSectionKey] : []),
        ...(kpiSectionKey ? [kpiSectionKey] : []),
      ];
      viewerSectionKey =
        rootChildInfos.find((info) => info.viewerCount > 0)?.key ??
        chooseSections(
          nextSpec,
          infoByKey,
          parentMap,
          (info) => info.viewerCount > 0,
          1,
          blockedTop,
        )[0] ??
        null;
    }

    const viewerWrapped = maybeWrapSectionCard(
      nextSpec,
      viewerSectionKey,
      "showcase-viewer-panel",
      "3D Model Viewer",
      "Interactive Autodesk viewer for the showcase model.",
    );
    nextSpec = viewerWrapped.spec;
    viewerSectionKey = viewerWrapped.key;

    const dynamicSectionKeys = existingChildren
      .slice(3)
      .filter((key) => key && nextSpec.elements[key]);

    const upgradedDynamicSections: string[] = [];
    for (const sectionKey of dynamicSectionKeys) {
      const upgraded = upgradeLegacyDetailSection(nextSpec, sectionKey);
      nextSpec = upgraded.spec;
      upgradedDynamicSections.push(upgraded.key);
    }

    ({ infoByKey, parentMap } = classifySpec(nextSpec));
    const chartSectionCandidates = upgradedDynamicSections.filter((sectionKey) => {
      const info = infoByKey.get(sectionKey);
      return Boolean(info && info.chartCount > 0 && info.tableCount === 0);
    });
    const detailSectionCandidates = upgradedDynamicSections.filter((sectionKey) => {
      const info = infoByKey.get(sectionKey);
      return Boolean(info && info.tableCount > 0);
    });
    const extraSectionCandidates = upgradedDynamicSections.filter(
      (sectionKey) =>
        !chartSectionCandidates.includes(sectionKey) &&
        !detailSectionCandidates.includes(sectionKey),
    );

    const wrappedChartSections: string[] = [];
    for (const [index, sectionKey] of chartSectionCandidates.entries()) {
      const wrapped = maybeWrapSectionCard(
        nextSpec,
        sectionKey,
        `showcase-chart-panel-${index + 1}`,
        index === 0 ? "Primary Analysis" : "Secondary Analysis",
      );
      nextSpec = wrapped.spec;
      if (wrapped.key) {
        wrappedChartSections.push(wrapped.key);
      }
    }

    ({ infoByKey, parentMap } = classifySpec(nextSpec));
    for (const sectionKey of wrappedChartSections) {
      const info = infoByKey.get(sectionKey);
      if (info?.chartCount) {
        nextSpec = organizeChartSectionNavigation(nextSpec, sectionKey, infoByKey);
        ({ infoByKey, parentMap } = classifySpec(nextSpec));
      }
    }

    const wrappedDetailSections: string[] = [];
    for (const [index, sectionKey] of detailSectionCandidates.entries()) {
      const wrapped = maybeWrapSectionCard(
        nextSpec,
        sectionKey,
        `showcase-detail-panel-${index + 1}`,
        index === 0 ? "Detailed Breakdown" : "Supporting Table",
      );
      nextSpec = wrapped.spec;
      if (wrapped.key) {
        wrappedDetailSections.push(wrapped.key);
      }
    }

    const wrappedExtraSections: string[] = [];
    for (const [index, sectionKey] of extraSectionCandidates.entries()) {
      const wrapped = maybeWrapSectionCard(
        nextSpec,
        sectionKey,
        `showcase-extra-panel-${index + 1}`,
        `Additional Visual ${index + 1}`,
      );
      nextSpec = wrapped.spec;
      if (wrapped.key) {
        wrappedExtraSections.push(wrapped.key);
      }
    }

    return {
      ...nextSpec,
      elements: {
        ...nextSpec.elements,
        [nextSpec.root]: {
          ...nextSpec.elements[nextSpec.root],
          children: [
            ...(filterSectionKey ? [filterSectionKey] : []),
            ...(kpiSectionKey ? [kpiSectionKey] : []),
            ...(viewerSectionKey ? [viewerSectionKey] : []),
            ...wrappedChartSections,
            ...wrappedDetailSections,
            ...wrappedExtraSections,
          ],
        },
      },
    };
  }

  let { infoByKey, parentMap } = classifySpec(nextSpec);
  const infoValues = getInfoValues(infoByKey);

  const filterSections = chooseSections(
    nextSpec,
    infoByKey,
    parentMap,
    (info) =>
      info.filterCount > 0 &&
      info.viewerCount === 0 &&
      info.chartCount === 0 &&
      info.tableCount === 0,
    1,
    [],
  );

  const viewerSections = chooseSections(
    nextSpec,
    infoByKey,
    parentMap,
    (info) => info.viewerCount > 0,
    1,
    filterSections,
  );

  const kpiSections = chooseSections(
    nextSpec,
    infoByKey,
    parentMap,
    (info) =>
      info.metricCount >= 2 &&
      info.filterCount === 0 &&
      info.viewerCount === 0 &&
      info.chartCount === 0 &&
      info.tableCount === 0,
    1,
    [...filterSections, ...viewerSections],
  );

  let kpiSectionKey: string | null = kpiSections[0] ?? null;

  if (!kpiSectionKey) {
    const metricKeys = infoValues
      .filter((info) => info.type === "Metric")
      .map((info) => info.key)
      .filter(
        (key) =>
          !filterSections.some((blocked) => isAncestor(blocked, key, parentMap)) &&
          !viewerSections.some((blocked) => isAncestor(blocked, key, parentMap)),
      );

    const kpiSection = createMetricSection(nextSpec, metricKeys);
    nextSpec = kpiSection.spec;
    kpiSectionKey = kpiSection.key;
    ({ infoByKey, parentMap } = classifySpec(nextSpec));
  }

  const chartSections = chooseSections(
    nextSpec,
    infoByKey,
    parentMap,
    (info) =>
      info.chartCount > 0 &&
      info.viewerCount === 0 &&
      info.tableCount === 0,
    2,
    [...filterSections, ...(kpiSectionKey ? [kpiSectionKey] : []), ...viewerSections],
  );

  const detailSections = chooseSections(
    nextSpec,
    infoByKey,
    parentMap,
    (info) => info.tableCount > 0 && info.viewerCount === 0,
    2,
    [
      ...filterSections,
      ...(kpiSectionKey ? [kpiSectionKey] : []),
      ...viewerSections,
      ...chartSections,
    ],
  );

  let filterSectionKey: string | null = filterSections[0] ?? null;
  if (!filterSectionKey) {
    const filterLeafKeys = getInfoValues(infoByKey)
      .filter((info) => FILTER_TYPES.has(info.type))
      .map((info) => info.key);

    if (filterLeafKeys.length > 0) {
      const wrapped = wrapInCard(
        nextSpec,
        filterLeafKeys,
        "showcase-filters-card",
        "Filters",
        "Use these slicers to refine the model data shown in the dashboard.",
      );
      nextSpec = wrapped.spec;
      filterSectionKey = wrapped.key;
      ({ infoByKey, parentMap } = classifySpec(nextSpec));
    }
  }

  const ensuredFilters = ensureMinimumFilterControls(
    nextSpec,
    filterSectionKey,
    MIN_FILTER_CONTROLS,
  );
  nextSpec = ensuredFilters.spec;
  filterSectionKey = ensuredFilters.filterSectionKey;
  ({ infoByKey, parentMap } = classifySpec(nextSpec));

  let viewerSectionKey: string | null = viewerSections[0] ?? null;
  const viewerWrapped = maybeWrapSectionCard(
    nextSpec,
    viewerSectionKey,
    "showcase-viewer-panel",
    "3D Model Viewer",
    "Interactive Autodesk viewer for the showcase model.",
  );
  nextSpec = viewerWrapped.spec;
  viewerSectionKey = viewerWrapped.key;
  ({ infoByKey, parentMap } = classifySpec(nextSpec));

  const wrappedChartSections: string[] = [];
  for (const [index, sectionKey] of chartSections.slice(0, 2).entries()) {
    const wrapped = maybeWrapSectionCard(
      nextSpec,
      sectionKey,
      `showcase-chart-panel-${index + 1}`,
      index === 0 ? "Primary Analysis" : "Secondary Analysis",
    );
    nextSpec = wrapped.spec;
    if (wrapped.key) {
      wrappedChartSections.push(wrapped.key);
    }
  }
  ({ infoByKey, parentMap } = classifySpec(nextSpec));

  for (const sectionKey of wrappedChartSections) {
    nextSpec = organizeChartSectionNavigation(nextSpec, sectionKey, infoByKey);
    ({ infoByKey, parentMap } = classifySpec(nextSpec));
  }

  const deterministicDetails = ensureDeterministicDetailSections(nextSpec);
  nextSpec = deterministicDetails.spec;
  const wrappedDetailSections =
    deterministicDetails.detailSectionKeys.length > 0
      ? deterministicDetails.detailSectionKeys
      : detailSections
          .slice(0, 2)
          .map((sectionKey, index) =>
            maybeWrapSectionCard(
              nextSpec,
              sectionKey,
              `showcase-detail-panel-${index + 1}`,
              index === 0 ? "Detailed Breakdown" : "Supporting Table",
            ),
          )
          .flatMap((wrapped) => {
            nextSpec = wrapped.spec;
            return wrapped.key ? [wrapped.key] : [];
          });

  const title = firstTextValue(nextSpec);
  const shellKey = nextAvailableKey(nextSpec, "showcase-dashboard-layout");

  return {
    ...nextSpec,
    root: shellKey,
    elements: {
      ...nextSpec.elements,
      [shellKey]: {
        type: SHELL_TYPE,
        props: {
          title,
          description: null,
        },
        children: [
          ...(filterSectionKey ? [filterSectionKey] : []),
          ...(kpiSectionKey ? [kpiSectionKey] : []),
          ...(viewerSectionKey ? [viewerSectionKey] : []),
          ...wrappedChartSections,
          ...wrappedDetailSections,
        ],
      },
    },
  };
}
