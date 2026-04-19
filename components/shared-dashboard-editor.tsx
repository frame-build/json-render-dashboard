"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { Spec } from "@json-render/react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
} from "@/components/ui/sidebar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DashboardSpecRenderer } from "@/lib/render/renderer";
import { normalizeShowcaseDashboardSpec } from "@/lib/render/normalize-showcase-spec";
import { cn } from "@/lib/utils";
import {
  appendSupportedVisual,
  getEditableWidgets,
  reorderEditableWidgets,
  removeEditableWidget,
  updateWidgetChartType,
  type SupportedChartType,
  type SupportedVisualKind,
} from "@/lib/render/dashboard-layout-editor";
import {
  GripVertical,
  Trash2,
  Plus,
  Save,
  Loader2,
  Pin,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";

const ADDABLE_VISUALS: Array<{ value: SupportedVisualKind; label: string }> = [
  { value: "chart-by-type", label: "Chart: by type" },
  { value: "chart-by-level", label: "Chart: by level" },
  { value: "chart-by-material", label: "Chart: by material" },
  { value: "summary-by-type", label: "Summary table: by type" },
  { value: "detail-table", label: "Detail table" },
];

const CHART_TYPE_OPTIONS: Array<{
  value: SupportedChartType;
  label: string;
}> = [
  { value: "BarChart", label: "Bar" },
  { value: "LineChart", label: "Line" },
  { value: "PieChart", label: "Pie" },
];

type SaveState = "saved" | "saving" | "error";

export function SharedDashboardEditor({
  shareId,
  initialSpec,
}: {
  shareId: string;
  initialSpec: Spec;
}) {
  const initialNormalizedSpec =
    normalizeShowcaseDashboardSpec(initialSpec) ?? initialSpec;
  const [spec, setSpec] = useState<Spec>(() => {
    return initialNormalizedSpec;
  });
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [addKind, setAddKind] = useState<SupportedVisualKind>("chart-by-type");
  const [draggingKey, setDraggingKey] = useState<string | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const savedSnapshotRef = useRef(JSON.stringify(initialNormalizedSpec));

  const normalizedSpec = useMemo(
    () => normalizeShowcaseDashboardSpec(spec) ?? spec,
    [spec],
  );
  const widgets = useMemo(
    () => getEditableWidgets(normalizedSpec),
    [normalizedSpec],
  );

  const updateSpec = useCallback((updater: (current: Spec) => Spec) => {
    setSpec((current) => {
      const next = updater(current);
      return normalizeShowcaseDashboardSpec(next) ?? next;
    });
  }, []);

  useEffect(() => {
    const serialized = JSON.stringify(normalizedSpec);
    if (serialized === savedSnapshotRef.current) {
      return;
    }

    setSaveState("saving");
    const timeout = window.setTimeout(async () => {
      try {
        const response = await fetch(`/api/shares/${shareId}`, {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            spec: normalizedSpec,
          }),
        });

        if (!response.ok) {
          throw new Error(await response.text());
        }

        savedSnapshotRef.current = serialized;
        setSaveState("saved");
      } catch {
        setSaveState("error");
      }
    }, 700);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [normalizedSpec, shareId]);

  const handleDrop = useCallback(
    (targetKey: string) => {
      if (!draggingKey || draggingKey === targetKey) {
        setDraggingKey(null);
        return;
      }

      const fromIndex = widgets.findIndex((widget) => widget.key === draggingKey);
      const toIndex = widgets.findIndex((widget) => widget.key === targetKey);
      if (fromIndex < 0 || toIndex < 0) {
        setDraggingKey(null);
        return;
      }

      updateSpec((current) => reorderEditableWidgets(current, fromIndex, toIndex));
      setDraggingKey(null);
    },
    [draggingKey, updateSpec, widgets],
  );

  return (
    <div
      className={cn(
        "grid w-full gap-6",
        sidebarCollapsed
          ? "xl:grid-cols-[4.5rem_minmax(0,1fr)]"
          : "xl:grid-cols-[22rem_minmax(0,1fr)]",
      )}
    >
      <Sidebar className="max-h-[calc(100vh-8rem)] xl:sticky xl:top-6">
        <SidebarHeader className="space-y-3">
          <div className="flex items-start justify-between gap-2">
            <div className={cn(sidebarCollapsed && "sr-only")}>
              <h2 className="text-base font-semibold tracking-tight">Layout Editor</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Viewer is pinned. Widgets after the viewer can be reordered,
                changed, added, removed, and auto-save immediately.
              </p>
            </div>

            <Button
              variant="outline"
              size="icon"
              onClick={() => setSidebarCollapsed((value) => !value)}
              aria-label={sidebarCollapsed ? "Expand editor sidebar" : "Collapse editor sidebar"}
              className="shrink-0"
            >
              {sidebarCollapsed ? (
                <PanelLeftOpen className="h-4 w-4" />
              ) : (
                <PanelLeftClose className="h-4 w-4" />
              )}
            </Button>
          </div>

          <div
            className={cn(
              "flex flex-wrap items-center gap-2",
              sidebarCollapsed && "justify-center",
            )}
          >
            <Badge variant="outline" className="gap-1">
              <Pin className="h-3.5 w-3.5" />
              <span className={cn(sidebarCollapsed && "sr-only")}>Viewer pinned</span>
            </Badge>
            <Badge
              variant={saveState === "error" ? "destructive" : "secondary"}
              className="gap-1"
            >
              {saveState === "saving" ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Save className="h-3.5 w-3.5" />
              )}
              <span className={cn(sidebarCollapsed && "sr-only")}>
                {saveState === "saving"
                  ? "Saving"
                  : saveState === "error"
                    ? "Save failed"
                    : "Saved"}
              </span>
            </Badge>
          </div>
        </SidebarHeader>

        {!sidebarCollapsed ? (
          <>
            <SidebarContent>
              <SidebarGroup>
                <SidebarGroupLabel>Widgets</SidebarGroupLabel>
                <SidebarGroupContent className="space-y-2">
                  {widgets.length === 0 ? (
                    <div className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
                      No editable widgets yet. Add a visual to extend the dashboard.
                    </div>
                  ) : (
                    widgets.map((widget) => (
                      <div
                        key={widget.key}
                        draggable
                        onDragStart={() => setDraggingKey(widget.key)}
                        onDragEnd={() => setDraggingKey(null)}
                        onDragOver={(event) => event.preventDefault()}
                        onDrop={() => handleDrop(widget.key)}
                        className="grid gap-3 rounded-2xl border bg-background/60 p-3 md:grid-cols-[minmax(0,1fr)_11rem_auto]"
                      >
                        <div className="flex min-w-0 items-start gap-3">
                          <div className="mt-0.5 rounded-md border p-1 text-muted-foreground">
                            <GripVertical className="h-4 w-4" />
                          </div>
                          <div className="min-w-0">
                            <div className="truncate text-sm font-medium">
                              {widget.title}
                            </div>
                            <div className="truncate text-xs text-muted-foreground">
                              {widget.description ?? widget.type}
                            </div>
                          </div>
                        </div>

                        <div>
                          {widget.chartType ? (
                            <Select
                              value={widget.chartType}
                              onValueChange={(value) => {
                                updateSpec((current) =>
                                  updateWidgetChartType(
                                    current,
                                    widget.key,
                                    value as SupportedChartType,
                                  ),
                                );
                              }}
                            >
                              <SelectTrigger className="w-full">
                                <SelectValue placeholder="Chart type" />
                              </SelectTrigger>
                              <SelectContent>
                                {CHART_TYPE_OPTIONS.map((option) => (
                                  <SelectItem key={option.value} value={option.value}>
                                    {option.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          ) : (
                            <div className="flex h-10 items-center rounded-md border px-3 text-xs text-muted-foreground">
                              Fixed widget
                            </div>
                          )}
                        </div>

                        <div className="flex justify-end">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              updateSpec((current) =>
                                removeEditableWidget(current, widget.key),
                              );
                            }}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    ))
                  )}
                </SidebarGroupContent>
              </SidebarGroup>
            </SidebarContent>

            <SidebarFooter>
              <SidebarGroup>
                <SidebarGroupLabel>Add Visual</SidebarGroupLabel>
                <SidebarGroupContent>
                  <Select
                    value={addKind}
                    onValueChange={(value) => setAddKind(value as SupportedVisualKind)}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Choose a visual" />
                    </SelectTrigger>
                    <SelectContent>
                      {ADDABLE_VISUALS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <Button
                    className="w-full"
                    onClick={() => {
                      updateSpec((current) => appendSupportedVisual(current, addKind));
                    }}
                  >
                    <Plus className="h-4 w-4" />
                    Add visual
                  </Button>
                </SidebarGroupContent>
              </SidebarGroup>
            </SidebarFooter>
          </>
        ) : null}
      </Sidebar>

      <SidebarInset>
        <DashboardSpecRenderer spec={normalizedSpec} renderMode="full" specMutator={updateSpec} />
      </SidebarInset>
    </div>
  );
}
