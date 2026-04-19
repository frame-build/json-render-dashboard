import type { Spec } from "@json-render/react";

const FIXED_ROOT_CHILDREN = 3;
const CHART_TYPES = new Set(["BarChart", "LineChart", "PieChart"]);

export type SupportedChartType = "BarChart" | "LineChart" | "PieChart";
export type SupportedVisualKind =
  | "chart-by-type"
  | "chart-by-level"
  | "chart-by-material"
  | "summary-by-type"
  | "detail-table";

export type AddChartKind = SupportedChartType;

export interface EditableWidgetMeta {
  key: string;
  title: string;
  description: string | null;
  type: string;
  chartType: SupportedChartType | null;
}

function cloneSpec(spec: Spec): Spec {
  return structuredClone(spec);
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

function findFirstOfTypes(
  spec: Spec,
  rootKey: string,
  types: Set<string>,
): string | null {
  const keys = collectSubtreeKeys(spec.elements, rootKey);
  for (const key of keys) {
    const type = spec.elements[key]?.type;
    if (type && types.has(type)) {
      return key;
    }
  }
  return null;
}

function getRootChildren(spec: Spec) {
  return [...(spec.elements[spec.root]?.children ?? [])];
}

function setRootChildren(spec: Spec, children: string[]): Spec {
  return {
    ...spec,
    elements: {
      ...spec.elements,
      [spec.root]: {
        ...spec.elements[spec.root],
        children,
      },
    },
  };
}

function toWidgetTitle(spec: Spec, key: string) {
  const section = spec.elements[key];
  if (!section) return "Widget";

  if (typeof section.props?.title === "string" && section.props.title.trim()) {
    return section.props.title as string;
  }

  const chartKey = findFirstOfTypes(spec, key, CHART_TYPES);
  if (chartKey) {
    const chart = spec.elements[chartKey];
    if (typeof chart?.props?.title === "string" && chart.props.title.trim()) {
      return chart.props.title as string;
    }
  }

  if (section.type === "ShowcasePaginatedTable") {
    return "Data Table";
  }

  return section.type;
}

function toWidgetDescription(spec: Spec, key: string) {
  const section = spec.elements[key];
  if (!section) return null;
  if (
    typeof section.props?.description === "string" &&
    section.props.description.trim()
  ) {
    return section.props.description as string;
  }

  const chartKey = findFirstOfTypes(spec, key, CHART_TYPES);
  if (chartKey) {
    return spec.elements[chartKey]?.type ?? null;
  }

  return section.type;
}

function buildCardSection(
  spec: Spec,
  baseKey: string,
  title: string,
  description: string,
  child: Spec["elements"][string],
) {
  const elements = { ...spec.elements };
  const contentKey = nextAvailableElementKey(elements, `${baseKey}-content`);
  elements[contentKey] = child;

  const sectionKey = nextAvailableElementKey(elements, baseKey);
  elements[sectionKey] = {
    type: "Card",
    props: {
      title,
      description,
    },
    children: [contentKey],
  };

  return {
    spec: {
      ...spec,
      elements,
    },
    sectionKey,
  };
}

function chartElementForType(
  type: SupportedChartType,
  props: Record<string, unknown>,
): Spec["elements"][string] {
  if (type === "PieChart") {
    return {
      type: "PieChart",
      props: {
        title: props.title ?? null,
        data: props.data,
        nameKey:
          typeof props.nameKey === "string"
            ? props.nameKey
            : typeof props.xKey === "string"
              ? props.xKey
              : "label",
        valueKey:
          typeof props.valueKey === "string"
            ? props.valueKey
            : typeof props.yKey === "string"
              ? props.yKey
              : "count",
        height:
          typeof props.height === "number" ? props.height : null,
      },
    };
  }

  return {
    type,
    props: {
      title: props.title ?? null,
      data: props.data,
      xKey:
        typeof props.xKey === "string"
          ? props.xKey
          : typeof props.nameKey === "string"
            ? props.nameKey
            : "label",
      yKey:
        typeof props.yKey === "string"
          ? props.yKey
          : typeof props.valueKey === "string"
            ? props.valueKey
            : "count",
      aggregate:
        props.aggregate === "sum" ||
        props.aggregate === "count" ||
        props.aggregate === "avg"
          ? props.aggregate
          : null,
      color: typeof props.color === "string" ? props.color : null,
      height: typeof props.height === "number" ? props.height : null,
    },
  };
}

const CHART_TYPE_LABELS: Record<SupportedChartType, string> = {
  BarChart: "Bar",
  LineChart: "Line",
  PieChart: "Pie",
};

function toSectionStateKey(sectionKey: string) {
  const normalized = sectionKey.replace(/[^a-zA-Z0-9_-]/g, "-");
  return normalized.length > 0 ? normalized : "section";
}

function getValueAtStatePath(root: unknown, path: string) {
  if (!isJsonLike(root)) return undefined;
  const parts = path.split("/").filter(Boolean);
  let current: unknown = root;

  for (const part of parts) {
    if (!isJsonLike(current)) {
      return undefined;
    }
    current = current[part];
  }

  return current;
}

function setValueAtStatePath(root: Record<string, unknown>, path: string, value: unknown) {
  const parts = path.split("/").filter(Boolean);
  let current: Record<string, unknown> = root;

  for (let index = 0; index < parts.length - 1; index += 1) {
    const key = parts[index];
    const next = current[key];
    if (!isJsonLike(next)) {
      current[key] = {};
    }
    current = current[key] as Record<string, unknown>;
  }

  current[parts[parts.length - 1]] = value;
}

function getChartStatePath(sectionKey: string) {
  return `/ui/charts/${toSectionStateKey(sectionKey)}/page`;
}

interface ChartTabEntry {
  value: string;
  label: string;
  chartKey: string;
  tabContentKey: string | null;
}

interface ChartSectionStructure {
  containerKey: string;
  containerChildren: string[];
  staticChildren: string[];
  directChartKeys: string[];
  tabsKey: string | null;
  tabsChildren: string[];
  tabEntries: ChartTabEntry[];
  activeValue: string | null;
  activeChartKey: string | null;
  activeTabIndex: number;
  activeChartType: SupportedChartType | null;
}

function getSectionChartContainer(spec: Spec, sectionKey: string) {
  const section = spec.elements[sectionKey];
  if (!section) {
    return null;
  }

  const sectionChildren = [...(section.children ?? [])];
  const hasChartsOrTabs = sectionChildren.some((childKey) => {
    const childType = spec.elements[childKey]?.type ?? "";
    return CHART_TYPES.has(childType) || childType === "Tabs";
  });

  if (hasChartsOrTabs) {
    return {
      containerKey: sectionKey,
      containerChildren: sectionChildren,
    };
  }

  if (sectionChildren.length === 1) {
    const childKey = sectionChildren[0];
    const child = spec.elements[childKey];
    if (!child) return null;
    const childChildren = [...(child.children ?? [])];
    const childHasChartsOrTabs = childChildren.some((grandChildKey) => {
      const childType = spec.elements[grandChildKey]?.type ?? "";
      return CHART_TYPES.has(childType) || childType === "Tabs";
    });

    if (childHasChartsOrTabs) {
      return {
        containerKey: childKey,
        containerChildren: childChildren,
      };
    }
  }

  return {
    containerKey: sectionKey,
    containerChildren: sectionChildren,
  };
}

function getChartSectionStructure(
  spec: Spec,
  sectionKey: string,
  preferredValue?: string | null,
): ChartSectionStructure | null {
  const container = getSectionChartContainer(spec, sectionKey);
  if (!container) {
    return null;
  }

  const tabsKey =
    container.containerChildren.find(
      (childKey) => spec.elements[childKey]?.type === "Tabs",
    ) ?? null;
  const directChartKeys = container.containerChildren.filter((childKey) =>
    CHART_TYPES.has(spec.elements[childKey]?.type ?? ""),
  );
  const staticChildren = container.containerChildren.filter((childKey) => {
    const type = spec.elements[childKey]?.type ?? "";
    return !CHART_TYPES.has(type) && type !== "Tabs";
  });

  let tabEntries: ChartTabEntry[] = [];
  let activeValue: string | null = null;
  let activeChartKey: string | null = directChartKeys[0] ?? null;

  if (tabsKey) {
    const tabsElement = spec.elements[tabsKey];
    const tabsChildren = [...(tabsElement?.children ?? [])];
    const tabLabels = Array.isArray(tabsElement?.props?.tabs)
      ? (tabsElement?.props?.tabs as Array<Record<string, unknown>>)
      : [];

    tabEntries = tabsChildren.flatMap((tabContentKey) => {
      const tabContent = spec.elements[tabContentKey];
      if (!tabContent) return [];
      const chartKey = findFirstOfTypes(spec, tabContentKey, CHART_TYPES);
      if (!chartKey) return [];
      const value =
        typeof tabContent.props?.value === "string"
          ? tabContent.props.value
          : String(tabEntries.length + 1);
      const label =
        (tabLabels.find((tab) => tab.value === value)?.label as string | undefined) ??
        CHART_TYPE_LABELS[spec.elements[chartKey].type as SupportedChartType] ??
        value;

      return [{ value, label, chartKey, tabContentKey }];
    });

    const storedValue = getValueAtStatePath(spec.state, getChartStatePath(sectionKey));
    activeValue =
      preferredValue ??
      (typeof storedValue === "string" ? storedValue : null) ??
      (typeof tabsElement?.props?.defaultValue === "string"
        ? tabsElement.props.defaultValue
        : null) ??
      tabEntries[0]?.value ??
      null;

    activeChartKey =
      tabEntries.find((entry) => entry.value === activeValue)?.chartKey ??
      tabEntries[0]?.chartKey ??
      null;
  }

  const activeTabIndex =
    activeValue && tabEntries.length > 0
      ? Math.max(
          0,
          tabEntries.findIndex((entry) => entry.value === activeValue),
        )
      : 0;
  const activeChartType = activeChartKey
    ? ((spec.elements[activeChartKey]?.type as SupportedChartType | undefined) ?? null)
    : null;

  return {
    containerKey: container.containerKey,
    containerChildren: container.containerChildren,
    staticChildren,
    directChartKeys,
    tabsKey,
    tabsChildren: tabsKey ? [...(spec.elements[tabsKey]?.children ?? [])] : [],
    tabEntries,
    activeValue,
    activeChartKey,
    activeTabIndex,
    activeChartType,
  };
}

function setChartPage(spec: Spec, sectionKey: string, nextValue: string | null) {
  if (!nextValue) {
    return spec;
  }

  const nextSpec = cloneSpec(spec);
  const stateRoot = isJsonLike(nextSpec.state)
    ? { ...nextSpec.state }
    : {};
  setValueAtStatePath(stateRoot, getChartStatePath(sectionKey), nextValue);
  nextSpec.state = stateRoot;
  return nextSpec;
}

function nextTabValue(tabEntries: ChartTabEntry[]) {
  const numericValues = tabEntries
    .map((entry) => Number.parseInt(entry.value, 10))
    .filter((value) => Number.isFinite(value));

  if (numericValues.length === 0) {
    return "1";
  }

  return String(Math.max(...numericValues) + 1);
}

function isChartTypeOnlyLabel(label: string) {
  return /^(Bar|Line|Pie)( \d+)?$/i.test(label.trim());
}

function uniqueChartTypeLabel(
  nextType: SupportedChartType,
  existingLabels: string[],
) {
  const baseLabel = CHART_TYPE_LABELS[nextType];
  if (!existingLabels.includes(baseLabel)) {
    return baseLabel;
  }

  let suffix = 2;
  while (existingLabels.includes(`${baseLabel} ${suffix}`)) {
    suffix += 1;
  }

  return `${baseLabel} ${suffix}`;
}

export function getChartSectionEditorState(
  spec: Spec,
  sectionKey: string,
  activeTabValue?: string | null,
) {
  const structure = getChartSectionStructure(spec, sectionKey, activeTabValue);

  return {
    hasTabs: Boolean(structure?.tabsKey),
    tabCount:
      structure?.tabEntries.length ??
      structure?.directChartKeys.length ??
      0,
    activeChartType: structure?.activeChartType ?? null,
  };
}

export function getEditableWidgets(spec: Spec): EditableWidgetMeta[] {
  const children = getRootChildren(spec).slice(FIXED_ROOT_CHILDREN);

  return children
    .filter((key) => Boolean(spec.elements[key]))
    .map((key) => {
      const chartKey = findFirstOfTypes(spec, key, CHART_TYPES);
      const chartType = chartKey
        ? (spec.elements[chartKey].type as SupportedChartType)
        : null;

      return {
        key,
        title: toWidgetTitle(spec, key),
        description: toWidgetDescription(spec, key),
        type: spec.elements[key].type,
        chartType,
      };
    });
}

export function reorderEditableWidgets(
  spec: Spec,
  fromIndex: number,
  toIndex: number,
): Spec {
  const children = getRootChildren(spec);
  const fixed = children.slice(0, FIXED_ROOT_CHILDREN);
  const widgets = children.slice(FIXED_ROOT_CHILDREN);

  if (
    fromIndex < 0 ||
    toIndex < 0 ||
    fromIndex >= widgets.length ||
    toIndex >= widgets.length ||
    fromIndex === toIndex
  ) {
    return spec;
  }

  const nextWidgets = [...widgets];
  const [moved] = nextWidgets.splice(fromIndex, 1);
  nextWidgets.splice(toIndex, 0, moved);
  return setRootChildren(spec, [...fixed, ...nextWidgets]);
}

export function removeEditableWidget(spec: Spec, key: string): Spec {
  const children = getRootChildren(spec);
  return setRootChildren(spec, children.filter((child) => child !== key));
}

export function updateWidgetChartType(
  spec: Spec,
  sectionKey: string,
  nextType: SupportedChartType,
): Spec {
  const chartKey = findFirstOfTypes(spec, sectionKey, CHART_TYPES);
  if (!chartKey) {
    return spec;
  }

  const current = spec.elements[chartKey];
  if (!current || current.type === nextType) {
    return spec;
  }

  return {
    ...spec,
    elements: {
      ...spec.elements,
      [chartKey]: chartElementForType(
        nextType,
        (current.props ?? {}) as Record<string, unknown>,
      ),
    },
  };
}

export function updateChartTabType(
  spec: Spec,
  sectionKey: string,
  nextType: SupportedChartType,
  activeTabValue?: string | null,
): Spec {
  const structure = getChartSectionStructure(spec, sectionKey, activeTabValue);
  if (!structure?.activeChartKey) {
    return spec;
  }

  const current = spec.elements[structure.activeChartKey];
  if (!current || current.type === nextType) {
    return spec;
  }

  const nextSpec = cloneSpec(spec);
  nextSpec.elements[structure.activeChartKey] = chartElementForType(
    nextType,
    (current.props ?? {}) as Record<string, unknown>,
  );

  if (structure.tabsKey && structure.activeValue) {
    const tabsElement = nextSpec.elements[structure.tabsKey];
    const tabs = Array.isArray(tabsElement.props?.tabs)
      ? [...(tabsElement.props.tabs as Array<Record<string, unknown>>)]
      : [];
    const activeTabIndex = tabs.findIndex(
      (tab) => tab.value === structure.activeValue,
    );
    if (activeTabIndex >= 0) {
      const currentLabel = String(tabs[activeTabIndex].label ?? "");
      if (isChartTypeOnlyLabel(currentLabel)) {
        const labelsExcludingCurrent = tabs
          .filter((_, index) => index !== activeTabIndex)
          .map((tab) => String(tab.label ?? ""));
        tabs[activeTabIndex] = {
          ...tabs[activeTabIndex],
          label: uniqueChartTypeLabel(nextType, labelsExcludingCurrent),
        };
        tabsElement.props = {
          ...tabsElement.props,
          tabs,
        };
      }
    }
  }

  return nextSpec;
}

export function appendSupportedVisual(
  spec: Spec,
  kind: SupportedVisualKind,
): Spec {
  let nextSpec = cloneSpec(spec);
  let createdSectionKey: string | null = null;

  if (kind === "chart-by-type") {
    const created = buildCardSection(
      nextSpec,
      "editor-widget-type-chart",
      "Type Analysis",
      "Breakdown across matching elements by type.",
      {
        type: "BarChart",
        props: {
          title: "Element Count by Type",
          data: { $state: "/analysis/grouped/byType" },
          xKey: "label",
          yKey: "count",
          aggregate: null,
          height: 260,
        },
      },
    );
    nextSpec = created.spec;
    createdSectionKey = created.sectionKey;
  } else if (kind === "chart-by-level") {
    const created = buildCardSection(
      nextSpec,
      "editor-widget-level-chart",
      "Level Analysis",
      "Breakdown across matching elements by level.",
      {
        type: "BarChart",
        props: {
          title: "Element Count by Level",
          data: { $state: "/analysis/grouped/byLevel" },
          xKey: "label",
          yKey: "count",
          aggregate: null,
          height: 260,
        },
      },
    );
    nextSpec = created.spec;
    createdSectionKey = created.sectionKey;
  } else if (kind === "chart-by-material") {
    const created = buildCardSection(
      nextSpec,
      "editor-widget-material-chart",
      "Material Share",
      "Proportional area distribution by material.",
      {
        type: "PieChart",
        props: {
          title: "Area by Material",
          data: { $state: "/analysis/grouped/byMaterial" },
          nameKey: "label",
          valueKey: "area",
          height: 260,
        },
      },
    );
    nextSpec = created.spec;
    createdSectionKey = created.sectionKey;
  } else if (kind === "summary-by-type") {
    const sectionKey = nextAvailableElementKey(
      nextSpec.elements,
      "editor-widget-summary-by-type",
    );
    const pagePath = `/ui/detail/${sectionKey}/page`;
    const created = buildCardSection(
      nextSpec,
      sectionKey,
      "Summary by Type",
      "Grouped totals across all matching elements by type.",
      {
        type: "ShowcasePaginatedTable",
        props: {
          title: "Summary by Type",
          description: "Grouped totals across all matching elements by type.",
          data: { $state: "/analysis/grouped/byType" },
          columns: [
            { key: "label", label: "Label" },
            { key: "count", label: "Count" },
            { key: "length", label: "Length" },
            { key: "area", label: "Area" },
            { key: "volume", label: "Volume" },
          ],
          page: { $bindState: pagePath },
          pageSize: 12,
        },
      },
    );
    nextSpec = created.spec;
    createdSectionKey = created.sectionKey;
  } else if (kind === "detail-table") {
    const sectionKey = nextAvailableElementKey(
      nextSpec.elements,
      "editor-widget-detail-table",
    );
    const pagePath = `/ui/detail/${sectionKey}/page`;
    const created = buildCardSection(
      nextSpec,
      sectionKey,
      "Detailed Breakdown",
      "All matching elements for the current query, with pagination.",
      {
        type: "ShowcasePaginatedTable",
        props: {
          title: "Detailed Breakdown",
          description: "All matching elements for the current query, with pagination.",
          data: { $state: "/analysis/rows" },
          columns: [
            { key: "name", label: "Name" },
            { key: "category", label: "Category" },
            { key: "type", label: "Type" },
            { key: "level", label: "Level" },
            { key: "material", label: "Material" },
            { key: "area", label: "Area" },
            { key: "volume", label: "Volume" },
          ],
          page: { $bindState: pagePath },
          pageSize: 25,
        },
      },
    );
    nextSpec = created.spec;
    createdSectionKey = created.sectionKey;
  }

  if (!createdSectionKey) {
    return spec;
  }

  return setRootChildren(nextSpec, [
    ...getRootChildren(nextSpec),
    createdSectionKey,
  ]);
}

export function addChartAsTab(
  spec: Spec,
  cardKey: string,
  kind: AddChartKind,
  activeTabValue?: string | null,
): Spec {
  const structure = getChartSectionStructure(spec, cardKey, activeTabValue);
  if (!structure?.activeChartKey) {
    return spec;
  }

  const nextSpec = cloneSpec(spec);
  const activeChart = nextSpec.elements[structure.activeChartKey];
  const chartKey = nextAvailableElementKey(
    nextSpec.elements,
    `${cardKey}-chart-${kind.toLowerCase()}`,
  );
  nextSpec.elements[chartKey] = chartElementForType(
    kind,
    (activeChart.props ?? {}) as Record<string, unknown>,
  );

  if (structure.tabsKey) {
    const nextValue = nextTabValue(structure.tabEntries);
    const tabContentKey = nextAvailableElementKey(
      nextSpec.elements,
      `${cardKey}-tab-content-${nextValue}`,
    );
    nextSpec.elements[tabContentKey] = {
      type: "TabContent",
      props: { value: nextValue },
      children: [chartKey],
    };

    const tabsElement = nextSpec.elements[structure.tabsKey];
    const existingTabs = Array.isArray(tabsElement.props?.tabs)
      ? [...(tabsElement.props.tabs as Array<Record<string, unknown>>)]
      : [];
    const existingLabels = existingTabs.map((tab) => String(tab.label ?? ""));

    tabsElement.children = [...(tabsElement.children ?? []), tabContentKey];
    tabsElement.props = {
      ...tabsElement.props,
      editorSectionKey: cardKey,
      tabs: [
        ...existingTabs,
        {
          value: nextValue,
          label: uniqueChartTypeLabel(kind, existingLabels),
        },
      ],
    };

    return setChartPage(nextSpec, cardKey, nextValue);
  }

  const tabsKey = nextAvailableElementKey(nextSpec.elements, `${cardKey}-tabs`);
  const existingCharts = structure.directChartKeys.length > 0
    ? structure.directChartKeys
    : structure.activeChartKey
      ? [structure.activeChartKey]
      : [];
  const allChartKeys = [...existingCharts, chartKey];
  const tabs: Array<{ value: string; label: string }> = [];
  const tabContentKeys: string[] = [];
  const existingLabels: string[] = [];

  for (const [index, chartEntryKey] of allChartKeys.entries()) {
    const value = String(index + 1);
    const tabContentKey = nextAvailableElementKey(
      nextSpec.elements,
      `${cardKey}-tab-content-${value}`,
    );
    const chartType = nextSpec.elements[chartEntryKey]?.type as SupportedChartType;
    const label = uniqueChartTypeLabel(chartType, existingLabels);
    existingLabels.push(label);
    tabs.push({ value, label });
    tabContentKeys.push(tabContentKey);
    nextSpec.elements[tabContentKey] = {
      type: "TabContent",
      props: { value },
      children: [chartEntryKey],
    };
  }

  nextSpec.elements[tabsKey] = {
    type: "Tabs",
    props: {
      defaultValue: tabs[tabs.length - 1]?.value ?? "1",
      value: { $bindState: getChartStatePath(cardKey) },
      editorSectionKey: cardKey,
      tabs,
    },
    children: tabContentKeys,
  };

  nextSpec.elements[structure.containerKey] = {
    ...nextSpec.elements[structure.containerKey],
    children: [...structure.staticChildren, tabsKey],
  };

  return setChartPage(nextSpec, cardKey, tabs[tabs.length - 1]?.value ?? "1");
}

export function removeChartTab(
  spec: Spec,
  sectionKey: string,
  activeTabValue?: string | null,
): Spec {
  const structure = getChartSectionStructure(spec, sectionKey, activeTabValue);
  if (!structure?.tabsKey || structure.tabEntries.length <= 1) {
    return spec;
  }

  const activeIndex =
    structure.activeTabIndex >= 0 ? structure.activeTabIndex : 0;
  const remainingTabs = structure.tabEntries.filter(
    (_, index) => index !== activeIndex,
  );

  const nextSpec = cloneSpec(spec);

  if (remainingTabs.length === 1) {
    nextSpec.elements[structure.containerKey] = {
      ...nextSpec.elements[structure.containerKey],
      children: [...structure.staticChildren, remainingTabs[0].chartKey],
    };
    return setChartPage(nextSpec, sectionKey, "1");
  }

  nextSpec.elements[structure.tabsKey] = {
    ...nextSpec.elements[structure.tabsKey],
    children: remainingTabs
      .map((entry) => entry.tabContentKey)
      .filter((value): value is string => Boolean(value)),
    props: {
      ...nextSpec.elements[structure.tabsKey].props,
      tabs: remainingTabs.map((entry) => ({
        value: entry.value,
        label: entry.label,
      })),
      editorSectionKey: sectionKey,
    },
  };

  const fallbackTab =
    remainingTabs[Math.max(0, activeIndex - 1)] ?? remainingTabs[0];
  return setChartPage(nextSpec, sectionKey, fallbackTab?.value ?? "1");
}

function isJsonLike(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
