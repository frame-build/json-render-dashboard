"use client";

import { type ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from "recharts";
import type { ShowcaseElement } from "@/lib/aps/showcase-dataset";
import type { ShowcaseTakeoffQueryResult } from "@/lib/aps/showcase-query";
import { AutodeskViewer } from "@/components/autodesk-viewer";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { Button } from "@/components/ui/button";

const ALL = "__all__";

type FiltersState = {
  type: string;
  level: string;
  material: string;
  activity: string;
  search: string;
};

const initialFilters: FiltersState = {
  type: ALL,
  level: ALL,
  material: ALL,
  activity: ALL,
  search: "",
};

function formatMetric(value: number, unit?: string | null) {
  const formatted = new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 2,
  }).format(value);
  return unit ? `${formatted} ${unit}` : formatted;
}

function chartConfig(label: string, color: string) {
  return {
    total: {
      label,
      color,
    },
  } satisfies ChartConfig;
}

async function queryTakeoff(
  urn: string,
  defaultCategory: string,
  filters: FiltersState,
) {
  const response = await fetch("/api/aps/showcase/query", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      categories: [defaultCategory],
      types: filters.type === ALL ? undefined : [filters.type],
      levels: filters.level === ALL ? undefined : [filters.level],
      materials: filters.material === ALL ? undefined : [filters.material],
      activities: filters.activity === ALL ? undefined : [filters.activity],
      search: filters.search.trim() || undefined,
      rowLimit: 20,
      groupLimit: 10,
      facetLimit: 200,
      maxDbIdsForIsolation: 2500,
      urn,
    }),
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }

  return (await response.json()) as ShowcaseTakeoffQueryResult;
}

async function queryElement(dbId: number) {
  const response = await fetch(`/api/aps/showcase/element/${dbId}`, {
    method: "GET",
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }

  return (await response.json()) as ShowcaseElement;
}

export interface ShowcaseWallTakeoffDashboardProps {
  urn: string;
  title?: string | null;
  description?: string | null;
  viewerHeight?: string | null;
  defaultCategory?: string | null;
}

export function ShowcaseWallTakeoffDashboard({
  urn,
  title,
  description,
  viewerHeight,
  defaultCategory,
}: ShowcaseWallTakeoffDashboardProps) {
  const [filters, setFilters] = useState(initialFilters);
  const [breakdownView, setBreakdownView] = useState<
    "type" | "level" | "material"
  >("type");
  const [result, setResult] = useState<ShowcaseTakeoffQueryResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedDbId, setSelectedDbId] = useState<number | null>(null);
  const [selectedElement, setSelectedElement] = useState<ShowcaseElement | null>(null);
  const [selectedElementLoading, setSelectedElementLoading] = useState(false);
  const [baseFacets, setBaseFacets] =
    useState<ShowcaseTakeoffQueryResult["facets"] | null>(null);

  const resolvedCategory = defaultCategory ?? "Walls";

  useEffect(() => {
    let cancelled = false;

    async function run() {
      setLoading(true);
      setError(null);

      try {
        const next = await queryTakeoff(urn, resolvedCategory, filters);
        if (cancelled) return;
        setResult(next);
        setBaseFacets((current) => current ?? next.facets);
      } catch (queryError) {
        if (cancelled) return;
        setError(
          queryError instanceof Error
            ? queryError.message
            : "Failed to query showcase takeoff data.",
        );
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    run();

    return () => {
      cancelled = true;
    };
  }, [filters, resolvedCategory, urn]);

  useEffect(() => {
    setBaseFacets(null);
    setSelectedDbId(null);
    setSelectedElement(null);
  }, [resolvedCategory, urn]);

  useEffect(() => {
    if (!selectedDbId) {
      setSelectedElement(null);
      setSelectedElementLoading(false);
      return;
    }

    let cancelled = false;
    const dbId = selectedDbId;

    async function run() {
      setSelectedElementLoading(true);

      try {
        const element = await queryElement(dbId);
        if (cancelled) return;
        setSelectedElement(element);
      } catch {
        if (cancelled) return;
        setSelectedElement(null);
      } finally {
        if (!cancelled) {
          setSelectedElementLoading(false);
        }
      }
    }

    run();

    return () => {
      cancelled = true;
    };
  }, [selectedDbId]);

  const filterOptions = useMemo(
    () => ({
      types: baseFacets?.types ?? result?.facets.types ?? [],
      levels: baseFacets?.levels ?? result?.facets.levels ?? [],
      materials: baseFacets?.materials ?? result?.facets.materials ?? [],
      activities: baseFacets?.activities ?? result?.facets.activities ?? [],
    }),
    [baseFacets, result],
  );

  const handleViewerSelectionChange = useCallback((dbIds: number[]) => {
    setSelectedDbId((current) => {
      const next = dbIds[0] ?? null;
      return current === next ? current : next;
    });
  }, []);

  const typeChartData = useMemo(
    () =>
      (result?.grouped.byType ?? []).map((row) => ({
        label: row.label,
        total: Number(row.area.toFixed(2)),
      })),
    [result],
  );

  const levelChartData = useMemo(
    () =>
      (result?.grouped.byLevel ?? []).map((row) => ({
        label: row.label,
        total: Number(row.area.toFixed(2)),
      })),
    [result],
  );

  const materialChartData = useMemo(
    () =>
      (result?.grouped.byMaterial ?? []).map((row) => ({
        label: row.label,
        total: Number(row.area.toFixed(2)),
      })),
    [result],
  );

  const dashboardTitle = title ?? "Wall quantity takeoff dashboard";
  const dashboardDescription =
    description ??
    "Filter the normalized wall dataset by type name, base constraint, structural material, activity, and free-text search. The viewer stays centered while the surrounding cards summarize the filtered set.";

  const breakdownOptions = useMemo(
    () => ({
      type: {
        label: "Type",
        title: "Area by type",
        data: typeChartData,
        color: "var(--chart-1)",
        emptyLabel: "No type breakdown available",
      },
      level: {
        label: "Level",
        title: "Area by level",
        data: levelChartData,
        color: "var(--chart-2)",
        emptyLabel: "No level breakdown available",
      },
      material: {
        label: "Material",
        title: "Area by material",
        data: materialChartData,
        color: "var(--chart-3)",
        emptyLabel: "No material breakdown available",
      },
    }),
    [levelChartData, materialChartData, typeChartData],
  );

  const activeBreakdown = breakdownOptions[breakdownView];

  return (
    <section className="grid aspect-[16/9] min-h-[360px] w-full min-w-0 grid-rows-[auto,minmax(0,1fr)] gap-4 overflow-hidden rounded-3xl border bg-background p-4 shadow-sm md:p-5">
      <header className="flex flex-col gap-1.5">
        <div className="text-[0.65rem] font-semibold uppercase tracking-[0.32em] text-muted-foreground">
          APS Showcase
        </div>
        <h2 className="text-lg font-semibold tracking-tight md:text-xl">
          {dashboardTitle}
        </h2>
        <p className="max-w-4xl text-sm text-muted-foreground">
          {dashboardDescription}
        </p>
      </header>

      <div className="grid h-full min-h-0 gap-4 overflow-auto [grid-template-rows:auto_auto_minmax(0,1fr)_minmax(0,0.86fr)]">
        <Card className="gap-0 py-0">
          <CardContent className="grid gap-3 px-4 py-4 xl:grid-cols-[minmax(0,1.4fr)_repeat(4,minmax(0,0.82fr))]">
            <div className="space-y-2">
              <Label htmlFor="takeoff-search">Search walls</Label>
              <Input
                id="takeoff-search"
                value={filters.search}
                placeholder="Search by name, type, material, or level"
                onChange={(event) =>
                  setFilters((current) => ({
                    ...current,
                    search: event.target.value,
                  }))
                }
              />
            </div>

            <FilterSelect
              label="Type"
              value={filters.type}
              options={filterOptions.types}
              onValueChange={(value) =>
                setFilters((current) => ({ ...current, type: value }))
              }
            />

            <FilterSelect
              label="Level"
              value={filters.level}
              options={filterOptions.levels}
              onValueChange={(value) =>
                setFilters((current) => ({ ...current, level: value }))
              }
            />

            <FilterSelect
              label="Material"
              value={filters.material}
              options={filterOptions.materials}
              onValueChange={(value) =>
                setFilters((current) => ({ ...current, material: value }))
              }
            />

            <FilterSelect
              label="Activity"
              value={filters.activity}
              options={filterOptions.activities}
              onValueChange={(value) =>
                setFilters((current) => ({ ...current, activity: value }))
              }
            />
          </CardContent>
        </Card>

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            label="Matching elements"
            value={String(result?.summary.elementCount ?? 0)}
            loading={loading}
          />
          <MetricCard
            label="Total length"
            value={formatMetric(
              result?.summary.totals.length ?? 0,
              result?.summary.quantityUnits.length,
            )}
            loading={loading}
          />
          <MetricCard
            label="Total area"
            value={formatMetric(
              result?.summary.totals.area ?? 0,
              result?.summary.quantityUnits.area,
            )}
            loading={loading}
          />
          <MetricCard
            label="Total volume"
            value={formatMetric(
              result?.summary.totals.volume ?? 0,
              result?.summary.quantityUnits.volume,
            )}
            loading={loading}
          />
        </div>

        <div className="grid min-h-0 gap-4 xl:grid-cols-[minmax(0,1.5fr),minmax(320px,0.95fr)]">
          <Card className="min-h-0 gap-0 py-0">
            <CardHeader className="border-b pb-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <CardTitle className="text-base">Model viewer</CardTitle>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Viewer-first layout with row and selection sync.
                  </p>
                </div>
                <div className="rounded-full border border-border/80 bg-background/80 px-3 py-1 text-xs text-muted-foreground">
                  {result?.viewer.canIsolate
                    ? "Isolating filtered walls"
                    : "Showing full model"}
                </div>
              </div>
            </CardHeader>
            <CardContent className="flex min-h-0 flex-1 flex-col px-4 pb-4 pt-4">
              <div className="min-h-0 flex-1">
                <AutodeskViewer
                  urn={urn}
                  height={viewerHeight ?? "100%"}
                  theme="dark-theme"
                  fitToView
                  fitToSelection
                  isolatedDbIds={result?.viewer.isolatedDbIds ?? null}
                  selectedDbIds={selectedDbId ? [selectedDbId] : null}
                  onSelectionChange={handleViewerSelectionChange}
                />
              </div>
              <p className="mt-3 text-xs text-muted-foreground">
                {result?.viewer.canIsolate
                  ? "The filtered wall set is isolated in the viewer for closer review."
                  : "The filtered result set is too large to isolate efficiently, so the full model stays visible."}
              </p>
            </CardContent>
          </Card>

          <div className="grid min-h-0 gap-4 [grid-template-rows:minmax(0,0.54fr)_minmax(0,0.46fr)]">
            <ChartCard
              title={activeBreakdown.title}
              data={activeBreakdown.data}
              loading={loading}
              color={activeBreakdown.color}
              emptyLabel={activeBreakdown.emptyLabel}
              chartHeight={220}
              toolbar={
                <div className="flex items-center gap-1 rounded-full bg-muted p-1">
                  {(
                    ["type", "level", "material"] as const
                  ).map((option) => (
                    <button
                      key={option}
                      type="button"
                      className={cn(
                        "rounded-full px-3 py-1 text-xs font-medium transition-colors",
                        breakdownView === option
                          ? "bg-background text-foreground shadow-sm"
                          : "text-muted-foreground hover:text-foreground",
                      )}
                      onClick={() => setBreakdownView(option)}
                    >
                      {breakdownOptions[option].label}
                    </button>
                  ))}
                </div>
              }
            />

            <Card className="min-h-0 gap-0 py-0">
              <CardHeader className="flex flex-row items-start justify-between gap-4 border-b pb-4">
                <div>
                  <CardTitle className="text-base">Selected wall details</CardTitle>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Click a row or select an element in the viewer.
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={!selectedDbId}
                  onClick={() => setSelectedDbId(null)}
                >
                  Clear
                </Button>
              </CardHeader>
              <CardContent className="min-h-0 overflow-auto px-4 pb-4 pt-4">
                {selectedElementLoading ? (
                  <div className="text-sm text-muted-foreground">
                    Loading selection…
                  </div>
                ) : !selectedElement ? (
                  <div className="text-sm text-muted-foreground">
                    No wall selected yet.
                  </div>
                ) : (
                  <div className="grid gap-3 text-sm">
                    <DetailRow label="dbId" value={String(selectedElement.dbId)} />
                    <DetailRow label="Name" value={selectedElement.name} />
                    <DetailRow
                      label="Type"
                      value={selectedElement.type ?? selectedElement.typeName}
                    />
                    <DetailRow label="Family" value={selectedElement.family} />
                    <DetailRow label="Base Constraint" value={selectedElement.level} />
                    <DetailRow
                      label="Top Constraint"
                      value={selectedElement.topLevel}
                    />
                    <DetailRow
                      label="Material"
                      value={selectedElement.material}
                    />
                    <DetailRow label="Activity" value={selectedElement.activity} />
                    <DetailRow label="Function" value={selectedElement.function} />
                    <DetailRow
                      label="Length"
                      value={selectedElement.quantities.length?.toFixed(2) ?? null}
                    />
                    <DetailRow
                      label="Area"
                      value={selectedElement.quantities.area?.toFixed(2) ?? null}
                    />
                    <DetailRow
                      label="Volume"
                      value={selectedElement.quantities.volume?.toFixed(2) ?? null}
                    />
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>

        <Card className="min-h-0 gap-0 py-0">
          <CardHeader className="border-b pb-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <CardTitle className="text-base">Filtered wall rows</CardTitle>
                <p className="mt-1 text-sm text-muted-foreground">
                  Click a row to sync the Autodesk viewer and the detail panel.
                </p>
              </div>
              <div className="rounded-full border border-border/80 bg-background/80 px-3 py-1 text-xs text-muted-foreground">
                {(result?.rows ?? []).length} rows shown
              </div>
            </div>
          </CardHeader>
          <CardContent className="min-h-0 overflow-auto px-0 pb-0 pt-0">
            {error ? (
              <div className="mx-4 my-4 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {error}
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Level</TableHead>
                    <TableHead>Material</TableHead>
                    <TableHead className="text-right">Length</TableHead>
                    <TableHead className="text-right">Area</TableHead>
                    <TableHead className="text-right">Volume</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(result?.rows ?? []).map((row) => (
                    <TableRow
                      key={row.dbId}
                      className={cn(
                        "cursor-pointer",
                        selectedDbId === row.dbId && "bg-accent/50",
                      )}
                      onClick={() => setSelectedDbId(row.dbId)}
                    >
                      <TableCell className="font-medium">
                        {row.name ?? `#${row.dbId}`}
                      </TableCell>
                      <TableCell>{row.type ?? "—"}</TableCell>
                      <TableCell>{row.level ?? "—"}</TableCell>
                      <TableCell>{row.material ?? "—"}</TableCell>
                      <TableCell className="text-right">
                        {row.length?.toFixed(2) ?? "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        {row.area?.toFixed(2) ?? "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        {row.volume?.toFixed(2) ?? "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </section>
  );
}

function FilterSelect({
  label,
  value,
  options,
  onValueChange,
}: {
  label: string;
  value: string;
  options: Array<{ value: string; count: number }>;
  onValueChange: (value: string) => void;
}) {
  const safeOptions = options.filter((option) => option.value.trim().length > 0);

  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Select value={value} onValueChange={onValueChange}>
        <SelectTrigger>
          <SelectValue placeholder={`Select ${label.toLowerCase()}`} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>All</SelectItem>
          {safeOptions.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.value} ({option.count})
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function MetricCard({
  label,
  value,
  loading,
}: {
  label: string;
  value: string;
  loading: boolean;
}) {
  return (
    <Card className="gap-0 border-border/70 bg-background/80 py-0 shadow-none">
      <CardContent className="px-4 py-4">
        <div className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
          {label}
        </div>
        <div className="mt-2 text-2xl font-semibold tracking-tight">
          {loading ? "Loading…" : value}
        </div>
      </CardContent>
    </Card>
  );
}

function DetailRow({
  label,
  value,
}: {
  label: string;
  value: string | null | undefined;
}) {
  return (
    <div className="grid grid-cols-[104px,minmax(0,1fr)] gap-3 border-b border-border/70 pb-2 last:border-b-0">
      <div className="text-muted-foreground">{label}</div>
      <div className="truncate font-medium">{value || "—"}</div>
    </div>
  );
}

function ChartCard({
  title,
  data,
  loading,
  color,
  emptyLabel,
  toolbar,
  chartHeight,
}: {
  title: string;
  data: Array<{ label: string; total: number }>;
  loading: boolean;
  color: string;
  emptyLabel: string;
  toolbar?: ReactNode;
  chartHeight?: number;
}) {
  return (
    <Card className="min-h-0 gap-0 py-0">
      <CardHeader className="border-b pb-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <CardTitle className="text-base">{title}</CardTitle>
          {toolbar}
        </div>
      </CardHeader>
      <CardContent className="pt-4">
        {loading ? (
          <div className="text-sm text-muted-foreground">Loading…</div>
        ) : data.length === 0 ? (
          <div className="text-sm text-muted-foreground">{emptyLabel}</div>
        ) : (
          <ChartContainer
            config={chartConfig(title, color)}
            className="w-full"
            style={{ height: chartHeight ?? 260 }}
          >
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data}>
                <CartesianGrid vertical={false} />
                <XAxis
                  dataKey="label"
                  tickLine={false}
                  axisLine={false}
                  interval={0}
                  angle={-25}
                  textAnchor="end"
                  height={70}
                />
                <YAxis tickLine={false} axisLine={false} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Bar dataKey="total" fill="var(--color-total)" radius={4} />
              </BarChart>
            </ResponsiveContainer>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  );
}
