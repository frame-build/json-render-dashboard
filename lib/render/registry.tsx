"use client";

import {
  Children,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useBoundProp, defineRegistry } from "@json-render/react";
import { shadcnComponents } from "@json-render/shadcn";
import {
  Bar,
  BarChart as RechartsBarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart as RechartsLineChart,
  Pie,
  PieChart as RechartsPieChart,
  XAxis,
} from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";

import {
  Table,
  TableBody,
  TableHead,
  TableCell,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  TrendingUp,
  TrendingDown,
  Minus,
  Info,
  Lightbulb,
  AlertTriangle,
  Star,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Loader2,
  Plus,
  BarChart3,
  Trash2,
  RefreshCcw,
} from "lucide-react";
import { AutodeskViewer as AutodeskViewerComponent } from "@/components/autodesk-viewer";
import type { ShowcaseElement } from "@/lib/aps/showcase-dataset";
import type {
  PromptRefinementOption,
  PromptRefinementSelection,
} from "@/lib/chat/types";

// 3D imports
import { Canvas, useFrame } from "@react-three/fiber";
import {
  OrbitControls,
  Stars as DreiStars,
  Text as DreiText,
} from "@react-three/drei";
import type * as THREE from "three";

import { explorerCatalog } from "./catalog";
import {
  CurrentSpecContext,
  DashboardRenderModeContext,
  PromptRefinementSubmitContext,
  SpecMutatorContext,
} from "./render-mode";
import {
  addChartAsTab,
  getChartSectionEditorState,
  removeChartTab,
  updateChartTabType,
  type AddChartKind,
  type SupportedChartType,
} from "@/lib/render/dashboard-layout-editor";

// =============================================================================
// 3D Helper Types & Components
// =============================================================================

type Vec3Tuple = [number, number, number];

interface Animation3D {
  rotate?: number[] | null;
}

interface Mesh3DProps {
  position?: number[] | null;
  rotation?: number[] | null;
  scale?: number[] | null;
  color?: string | null;
  args?: number[] | null;
  metalness?: number | null;
  roughness?: number | null;
  emissive?: string | null;
  emissiveIntensity?: number | null;
  wireframe?: boolean | null;
  opacity?: number | null;
  animation?: Animation3D | null;
}

function toVec3(v: number[] | null | undefined): Vec3Tuple | undefined {
  if (!v || v.length < 3) return undefined;
  return v.slice(0, 3) as Vec3Tuple;
}

function toGeoArgs<T extends unknown[]>(
  v: number[] | null | undefined,
  fallback: T,
): T {
  if (!v || v.length === 0) return fallback;
  return v as unknown as T;
}

/** Shared hook for continuous rotation animation */
function useRotationAnimation(
  ref: React.RefObject<THREE.Object3D | null>,
  animation?: Animation3D | null,
) {
  useFrame(() => {
    if (!ref.current || !animation?.rotate) return;
    const [rx, ry, rz] = animation.rotate;
    ref.current.rotation.x += rx ?? 0;
    ref.current.rotation.y += ry ?? 0;
    ref.current.rotation.z += rz ?? 0;
  });
}

/** Standard material props shared by all mesh primitives */
function StandardMaterial({
  color,
  metalness,
  roughness,
  emissive,
  emissiveIntensity,
  wireframe,
  opacity,
}: Mesh3DProps) {
  return (
    <meshStandardMaterial
      color={color ?? "#cccccc"}
      metalness={metalness ?? 0.1}
      roughness={roughness ?? 0.8}
      emissive={emissive ?? undefined}
      emissiveIntensity={emissiveIntensity ?? 1}
      wireframe={wireframe ?? false}
      transparent={opacity != null && opacity < 1}
      opacity={opacity ?? 1}
    />
  );
}

/** Generic mesh wrapper for all geometry primitives */
function MeshPrimitive({
  meshProps,
  children,
  onClick,
}: {
  meshProps: Mesh3DProps;
  children: ReactNode;
  onClick?: () => void;
}) {
  const ref = useRef<THREE.Mesh>(null);
  useRotationAnimation(ref, meshProps.animation);
  return (
    <mesh
      ref={ref}
      position={toVec3(meshProps.position)}
      rotation={toVec3(meshProps.rotation)}
      scale={toVec3(meshProps.scale)}
      onClick={onClick}
    >
      {children}
      <StandardMaterial {...meshProps} />
    </mesh>
  );
}

/** Animated group wrapper */
function AnimatedGroup({
  position,
  rotation,
  scale,
  animation,
  children,
}: {
  position?: number[] | null;
  rotation?: number[] | null;
  scale?: number[] | null;
  animation?: Animation3D | null;
  children?: ReactNode;
}) {
  const ref = useRef<THREE.Group>(null);
  useRotationAnimation(ref, animation);
  return (
    <group
      ref={ref}
      position={toVec3(position)}
      rotation={toVec3(rotation)}
      scale={toVec3(scale)}
    >
      {children}
    </group>
  );
}

// =============================================================================
// Registry
// =============================================================================

const TabsValueContext = createContext<string | null>(null);
const EMPTY_SELECTION: number[] = [];
const DEFAULT_VIEWER_HEIGHT = "560px";

function ShowcaseShellSlot({
  child,
  emptyLabel,
  className,
  onAddChart,
  onChangeChartType,
  forceFillChild,
}: {
  child?: ReactNode;
  emptyLabel: string;
  className?: string;
  onAddChart?: (kind: AddChartKind) => void;
  onChangeChartType?: (type: SupportedChartType) => void;
  forceFillChild?: boolean;
}) {
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!addMenuOpen || !onAddChart) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setAddMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [addMenuOpen, onAddChart]);

  if (child) {
    return (
      <div className={`relative ${className ?? ""}`}>
        {onAddChart && (
          <div ref={menuRef} className="absolute right-2 top-2 z-10">
            <button
              type="button"
              onClick={() => setAddMenuOpen((v) => !v)}
              className="flex h-6 w-6 items-center justify-center rounded-md border border-border/60 bg-card/80 text-muted-foreground hover:text-foreground hover:bg-accent backdrop-blur-sm transition-colors"
              aria-label="Add chart"
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
            {addMenuOpen && (
              <div className="absolute right-0 top-7 z-50 min-w-[11rem] rounded-md border bg-popover p-1 shadow-md">
                {onAddChart ? (
                  <>
                    <div className="px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                      Add Tab
                    </div>
                    {ADD_CHART_OPTIONS.map((opt) => (
                      <button
                        key={`add-${opt.kind}`}
                        type="button"
                        onClick={() => {
                          onAddChart(opt.kind);
                          setAddMenuOpen(false);
                        }}
                        className="flex w-full items-center gap-2 rounded-sm px-2.5 py-1.5 text-sm text-popover-foreground hover:bg-accent transition-colors"
                      >
                        <BarChart3 className="h-3.5 w-3.5 text-muted-foreground" />
                        {opt.label}
                      </button>
                    ))}
                  </>
                ) : null}
                {onChangeChartType ? (
                  <>
                    {onAddChart !== undefined ? <div className="my-1 border-t" /> : null}
                    <div className="px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                      Change Type
                    </div>
                    {ADD_CHART_OPTIONS.map((opt) => (
                      <button
                        key={`change-${opt.kind}`}
                        type="button"
                        onClick={() => {
                          onChangeChartType(opt.kind);
                          setAddMenuOpen(false);
                        }}
                        className="flex w-full items-center gap-2 rounded-sm px-2.5 py-1.5 text-sm text-popover-foreground hover:bg-accent transition-colors"
                      >
                        <RefreshCcw className="h-3.5 w-3.5 text-muted-foreground" />
                        {opt.label}
                      </button>
                    ))}
                  </>
                ) : null}
              </div>
            )}
          </div>
        )}
        <div className={forceFillChild ? "h-full min-h-0 [&>*]:h-full" : undefined}>
          {child}
        </div>
      </div>
    );
  }

  return (
    <div
      className={`rounded-lg border border-dashed border-border/50 bg-muted/30 px-4 py-6 text-sm text-muted-foreground/80 ${className ?? ""}`}
    >
      {emptyLabel}
    </div>
  );
}

interface ShowcaseSelectionContextValue {
  selectedDbIds: number[];
  isolatedDbIds: number[] | null;
  setSelectedDbIds: (dbIds: number[]) => void;
  setIsolatedDbIds: (dbIds: number[] | null) => void;
}

const ShowcaseSelectionContext =
  createContext<ShowcaseSelectionContextValue | null>(null);

const ADD_CHART_OPTIONS: Array<{ kind: AddChartKind; label: string }> = [
  { kind: "BarChart", label: "Bar" },
  { kind: "LineChart", label: "Line" },
  { kind: "PieChart", label: "Pie" },
];

function formatSelectionQuantity(value: number | null | undefined) {
  if (value == null) return null;
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

function formatSelectionCell(value: string | number | null | undefined) {
  if (typeof value === "number") {
    return formatSelectionQuantity(value) ?? "-";
  }

  if (typeof value === "string" && value.trim().length > 0) {
    return value;
  }

  return "-";
}

function isNumericTableValue(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function formatTableCellValue(value: unknown) {
  if (isNumericTableValue(value)) {
    return new Intl.NumberFormat("en-US", {
      maximumFractionDigits: value >= 100 ? 0 : 2,
    }).format(value);
  }

  if (typeof value === "string") {
    return value;
  }

  if (value == null) {
    return "";
  }

  return String(value);
}

function formatMetricValue(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return new Intl.NumberFormat("en-US", {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }).format(value);
  }

  if (typeof value !== "string") {
    return String(value ?? "");
  }

  const trimmed = value.trim();
  const match = trimmed.match(/^([^0-9-]*)(-?\d[\d,]*\.?\d*)(.*)$/);
  if (!match) {
    return trimmed;
  }

  const [, prefix, numericPart, suffix] = match;
  const parsed = Number.parseFloat(numericPart.replace(/,/g, ""));
  if (!Number.isFinite(parsed)) {
    return trimmed;
  }

  const formatted = new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(parsed);

  return `${prefix}${formatted}${suffix}`;
}

function columnLooksNumeric(
  items: Array<Record<string, unknown>>,
  columnKey: string,
) {
  const values = items
    .map((item) => item[columnKey])
    .filter((value) => value != null);

  return values.length > 0 && values.every((value) => isNumericTableValue(value));
}

function normalizeTableItems(rawData: unknown): Array<Record<string, unknown>> {
  return Array.isArray(rawData)
    ? rawData
    : Array.isArray((rawData as Record<string, unknown>)?.data)
      ? ((rawData as Record<string, unknown>).data as Array<Record<string, unknown>>)
      : [];
}

function sortTableItems(
  items: Array<Record<string, unknown>>,
  sortKey: string | null,
  sortDir: "asc" | "desc",
) {
  if (!sortKey) {
    return items;
  }

  return [...items].sort((a, b) => {
    const av = a[sortKey];
    const bv = b[sortKey];
    if (typeof av === "number" && typeof bv === "number") {
      return sortDir === "asc" ? av - bv : bv - av;
    }
    const as = String(av ?? "");
    const bs = String(bv ?? "");
    return sortDir === "asc" ? as.localeCompare(bs) : bs.localeCompare(as);
  });
}

function extractInteractiveDbIds(item: Record<string, unknown>) {
  if (typeof item.dbId === "number") {
    return [item.dbId];
  }

  if (Array.isArray(item.dbIds)) {
    return item.dbIds.filter((value): value is number => typeof value === "number");
  }

  return [];
}

function sameDbIdSet(
  left: number[] | null | undefined,
  right: number[] | null | undefined,
) {
  const a = [...(left ?? [])].sort((x, y) => x - y);
  const b = [...(right ?? [])].sort((x, y) => x - y);

  if (a.length !== b.length) {
    return false;
  }

  return a.every((value, index) => value === b[index]);
}

function extractChartPayload(
  candidate: unknown,
): Record<string, unknown> | undefined {
  if (!candidate || typeof candidate !== "object") {
    return undefined;
  }

  const record = candidate as Record<string, unknown>;

  if (record.payload && typeof record.payload === "object") {
    return record.payload as Record<string, unknown>;
  }

  if (Array.isArray(record.activePayload) && record.activePayload.length > 0) {
    const first = record.activePayload[0];
    if (first && typeof first === "object") {
      const nested = (first as Record<string, unknown>).payload;
      if (nested && typeof nested === "object") {
        return nested as Record<string, unknown>;
      }
    }
  }

  return record;
}

function useShowcaseVisualInteraction() {
  const selection = useContext(ShowcaseSelectionContext);

  return useCallback(
    (
      item: Record<string, unknown> | null | undefined,
      mode: "select" | "isolate" = "isolate",
    ) => {
      if (!selection || !item) {
        return;
      }

      const dbIds = extractInteractiveDbIds(item);
      if (dbIds.length === 0) {
        return;
      }

      if (mode === "select") {
        const focused = dbIds.slice(0, 1);
        const isSameSelection =
          sameDbIdSet(selection.selectedDbIds, focused) &&
          sameDbIdSet(selection.isolatedDbIds, focused);

        if (isSameSelection) {
          selection.setSelectedDbIds([]);
          selection.setIsolatedDbIds(null);
          return;
        }

        selection.setSelectedDbIds(focused);
        selection.setIsolatedDbIds(focused);
        return;
      }

      if (sameDbIdSet(selection.isolatedDbIds, dbIds)) {
        selection.setSelectedDbIds([]);
        selection.setIsolatedDbIds(null);
        return;
      }

      selection.setSelectedDbIds(dbIds.slice(0, 3));
      selection.setIsolatedDbIds(dbIds);
    },
    [selection],
  );
}

function ShowcaseSelectionInspector() {
  const selection = useContext(ShowcaseSelectionContext);
  const selectedDbIds = selection?.selectedDbIds ?? EMPTY_SELECTION;
  const [elements, setElements] = useState<ShowcaseElement[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (selectedDbIds.length === 0) {
      setElements([]);
      setLoading(false);
      return;
    }

    const controller = new AbortController();

    async function run() {
      setLoading(true);
      try {
        const next = await Promise.all(
          selectedDbIds.slice(0, 3).map(async (dbId) => {
            const response = await fetch(`/api/aps/showcase/element/${dbId}`, {
              cache: "no-store",
              signal: controller.signal,
            });

            if (!response.ok) {
              return null;
            }

            return (await response.json()) as ShowcaseElement;
          }),
        );

        if (!controller.signal.aborted) {
          setElements(next.filter((element): element is ShowcaseElement => Boolean(element)));
        }
      } catch {
        if (!controller.signal.aborted) {
          setElements([]);
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }

    run();

    return () => {
      controller.abort();
    };
  }, [selectedDbIds]);

  return (
    <div className="rounded-lg border border-border/60 bg-card px-4 py-4">
      <div className="flex items-center justify-between gap-3 border-b border-border/50 pb-3">
        <div>
          <h3 className="text-sm font-semibold tracking-tight">Selected Elements</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Inspect elements selected in the viewer.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          disabled={
            !selection ||
            (selectedDbIds.length === 0 && (selection.isolatedDbIds?.length ?? 0) === 0)
          }
          onClick={() => {
            selection?.setSelectedDbIds([]);
            selection?.setIsolatedDbIds(null);
          }}
        >
          Clear
        </Button>
      </div>

      <ScrollArea className="mt-3 h-[16rem] pr-3">
        {loading ? (
          <div className="flex items-center gap-2 py-3 text-sm text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Loading selection...
          </div>
        ) : selectedDbIds.length === 0 ? (
          <div className="py-3 text-sm text-muted-foreground">
            Select elements in the viewer to inspect their details.
          </div>
        ) : elements.length === 0 ? (
          <div className="py-3 text-sm text-muted-foreground">
            No details available for the current selection.
          </div>
        ) : (
          <div className="space-y-3">
            <div className="text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              {selectedDbIds.length === 1
                ? "1 element selected"
                : `${selectedDbIds.length} elements selected`}
            </div>

            <div className="overflow-hidden rounded-md border border-border/50">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>dbId</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Level</TableHead>
                    <TableHead>Material</TableHead>
                    <TableHead className="text-right">Length</TableHead>
                    <TableHead className="text-right">Area</TableHead>
                    <TableHead className="text-right">Volume</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {elements.map((element) => (
                    <TableRow key={element.dbId}>
                      <TableCell className="max-w-[18rem] font-medium whitespace-normal">
                        {element.name ?? `Element ${element.dbId}`}
                      </TableCell>
                      <TableCell>{element.dbId}</TableCell>
                      <TableCell>{formatSelectionCell(element.category)}</TableCell>
                      <TableCell>
                        {formatSelectionCell(element.type ?? element.typeName)}
                      </TableCell>
                      <TableCell>{formatSelectionCell(element.level)}</TableCell>
                      <TableCell className="max-w-[14rem] whitespace-normal">
                        {formatSelectionCell(element.material)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatSelectionCell(element.quantities.length)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatSelectionCell(element.quantities.area)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatSelectionCell(element.quantities.volume)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        )}
      </ScrollArea>
    </div>
  );
}

function PromptRefinementChooser({
  title,
  description,
  originalPrompt,
  options,
  allowOriginalPrompt = true,
}: {
  title?: string | null;
  description?: string | null;
  originalPrompt: string;
  options: PromptRefinementOption[];
  allowOriginalPrompt?: boolean | null;
}) {
  const submitRefinement = useContext(PromptRefinementSubmitContext);
  const [selectedPrompt, setSelectedPrompt] = useState<string>(
    options[0]?.prompt ?? originalPrompt,
  );
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = useCallback(
    async (mode: PromptRefinementSelection["mode"]) => {
      if (!submitRefinement || isSubmitting) {
        return;
      }

      setIsSubmitting(true);
      try {
        await submitRefinement({
          mode,
          originalPrompt,
          selectedPrompt: mode === "original" ? originalPrompt : selectedPrompt,
        });
      } finally {
        setIsSubmitting(false);
      }
    },
    [isSubmitting, originalPrompt, selectedPrompt, submitRefinement],
  );

  return (
    <div className="w-full rounded-lg border border-border/60 bg-card">
      <div className="border-b border-border/50 px-5 py-4">
        <h3 className="text-sm font-semibold tracking-tight">
          {title ?? "Strengthen your prompt before generating"}
        </h3>
        {description && (
          <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
        )}
      </div>

      <div className="space-y-4 px-5 py-4">
        <div className="rounded-md border border-border/50 bg-muted/30 px-3 py-2.5">
          <div className="text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Original prompt
          </div>
          <p className="mt-1 text-sm leading-relaxed">{originalPrompt}</p>
        </div>

        <div className="space-y-2.5">
          <Label htmlFor="prompt-refinement-select" className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Refined options
          </Label>
          <div className="grid gap-2">
            {options.map((option) => {
              const active = selectedPrompt === option.prompt;
              return (
                <button
                  key={option.prompt}
                  type="button"
                  onClick={() => setSelectedPrompt(option.prompt)}
                  className={`rounded-md border px-3 py-2.5 text-left transition-colors ${
                    active
                      ? "border-primary/60 bg-primary/5"
                      : "border-border/60 hover:bg-muted/20"
                  }`}
                >
                  <div className="text-sm font-medium">{option.label}</div>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {option.rationale}
                  </p>
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex gap-2 pt-1">
          <Button
            size="sm"
            disabled={!submitRefinement || isSubmitting}
            onClick={() => void handleSubmit("enriched")}
          >
            {isSubmitting ? (
              <>
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                Sending...
              </>
            ) : (
              "Send refined prompt"
            )}
          </Button>
          {allowOriginalPrompt && (
            <Button
              size="sm"
              variant="outline"
              disabled={!submitRefinement || isSubmitting}
              onClick={() => void handleSubmit("original")}
            >
              Use original
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

export const { registry, handlers } = defineRegistry(explorerCatalog, {
  components: {
    // From @json-render/shadcn (used as-is)
    Stack: shadcnComponents.Stack,
    Card: shadcnComponents.Card,
    Grid: shadcnComponents.Grid,
    Heading: shadcnComponents.Heading,
    Separator: shadcnComponents.Separator,
    Accordion: shadcnComponents.Accordion,
    Progress: shadcnComponents.Progress,
    Skeleton: shadcnComponents.Skeleton,
    Badge: shadcnComponents.Badge,
    Alert: shadcnComponents.Alert,

    ShowcaseKpiGrid: ({ props, children }) => {
      const columnClass =
        props.columns && props.columns >= 3
          ? "grid-cols-2 md:grid-cols-3"
          : "grid-cols-1 md:grid-cols-2";
      const gapClass =
        props.gap === "sm" ? "gap-2" : props.gap === "lg" ? "gap-4" : "gap-3";

      return <div className={`grid ${columnClass} ${gapClass}`}>{children}</div>;
    },

    ShowcaseFilterGrid: ({ props, children }) => {
      const columnClass =
        props.columns && props.columns >= 3
          ? "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3"
          : "grid-cols-1 sm:grid-cols-2";
      const gapClass =
        props.gap === "sm" ? "gap-2" : props.gap === "lg" ? "gap-4" : "gap-3";

      return <div className={`grid ${columnClass} ${gapClass}`}>{children}</div>;
    },

    PromptRefinementChooser: ({ props }) => (
      <PromptRefinementChooser
        title={props.title}
        description={props.description}
        originalPrompt={props.originalPrompt}
        options={props.options}
        allowOriginalPrompt={props.allowOriginalPrompt}
      />
    ),

    ShowcasePaginatedTable: ({ props, bindings, emit }) => {
      const items = normalizeTableItems(props.data);
      const [sortKey, setSortKey] = useState<string | null>(null);
      const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
      const applyInteraction = useShowcaseVisualInteraction();
      const pageSize = Math.max(1, props.pageSize ?? 25);
      const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
      const [boundPage, setBoundPage] = useBoundProp<string>(
        props.page as string | undefined,
        bindings?.page,
      );
      const [localPage, setLocalPage] = useState(props.page ?? "1");
      const isBound = !!bindings?.page;
      const rawPage = isBound ? boundPage ?? props.page ?? "1" : localPage;
      const parsedPage = Number.parseInt(String(rawPage ?? "1"), 10);
      const currentPage = Number.isFinite(parsedPage)
        ? Math.min(Math.max(parsedPage, 1), totalPages)
        : 1;
      const sorted = sortTableItems(items, sortKey, sortDir);
      const pageStart = (currentPage - 1) * pageSize;
      const visibleItems = sorted.slice(pageStart, pageStart + pageSize);
      const numericColumns = new Set(
        props.columns
          .filter((col) => columnLooksNumeric(items, col.key))
          .map((col) => col.key),
      );

      const setPage = (page: number) => {
        const nextPage = String(Math.min(Math.max(page, 1), totalPages));
        if (isBound) {
          setBoundPage(nextPage);
        } else {
          setLocalPage(nextPage);
        }
        emit("change");
      };

      const handleSort = (key: string) => {
        if (sortKey === key) {
          setSortDir((d) => (d === "asc" ? "desc" : "asc"));
        } else {
          setSortKey(key);
          setSortDir("asc");
        }
        setPage(1);
      };

      return (
        <div className="flex h-full min-h-0 flex-col gap-3">
          {(props.title || props.description) && (
            <div className="space-y-0.5">
              {props.title ? (
                <h3 className="text-sm font-semibold tracking-tight">{props.title}</h3>
              ) : null}
              {props.description ? (
                <p className="text-xs text-muted-foreground">{props.description}</p>
              ) : null}
            </div>
          )}

          {items.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border/50 px-4 py-8 text-center text-sm text-muted-foreground">
              {props.emptyMessage ?? "No data"}
            </div>
          ) : (
            <>
              <div className="text-xs text-muted-foreground">
                Showing {pageStart + 1}-{Math.min(pageStart + pageSize, items.length)} of{" "}
                {items.length}
              </div>

              <div className="overflow-hidden rounded-md border border-border/60">
                <Table>
                  <TableHeader>
                    <TableRow>
                      {props.columns.map((col) => {
                        const SortIcon =
                          sortKey === col.key
                            ? sortDir === "asc"
                              ? ArrowUp
                              : ArrowDown
                            : ArrowUpDown;
                        return (
                          <TableHead
                            key={col.key}
                            className={numericColumns.has(col.key) ? "text-right" : undefined}
                          >
                            <button
                              type="button"
                              className={`inline-flex items-center gap-1 transition-colors hover:text-foreground ${
                                numericColumns.has(col.key) ? "ml-auto flex" : ""
                              }`}
                              onClick={() => handleSort(col.key)}
                            >
                              {col.label}
                              <SortIcon className="h-3 w-3 text-muted-foreground" />
                            </button>
                          </TableHead>
                        );
                      })}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {visibleItems.map((item, i) => (
                      <TableRow
                        key={`${pageStart}-${i}`}
                        className={
                          extractInteractiveDbIds(item).length > 0
                            ? "cursor-pointer hover:bg-muted/30"
                            : undefined
                        }
                        onClick={() =>
                          applyInteraction(
                            item,
                            typeof item.dbId === "number" ? "select" : "isolate",
                          )
                        }
                      >
                        {props.columns.map((col) => (
                          <TableCell
                            key={col.key}
                            className={numericColumns.has(col.key) ? "text-right tabular-nums" : undefined}
                          >
                            {formatTableCellValue(item[col.key])}
                          </TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {totalPages > 1 ? (
                <div className="flex items-center justify-between gap-2 pt-1">
                  <div className="text-xs text-muted-foreground">
                    Page {currentPage} of {totalPages}
                  </div>

                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={currentPage <= 1}
                      onClick={() => setPage(currentPage - 1)}
                    >
                      Previous
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={currentPage >= totalPages}
                      onClick={() => setPage(currentPage + 1)}
                    >
                      Next
                    </Button>
                  </div>
                </div>
              ) : null}
            </>
          )}
        </div>
      );
    },

    ShowcaseDashboardLayout: ({ props, children }) => {
      const renderMode = useContext(DashboardRenderModeContext);
      const currentSpec = useContext(CurrentSpecContext);
      const specMutator = useContext(SpecMutatorContext);
      const sections = Children.toArray(children);
      const [filters, kpis, viewer, ...widgets] = sections;
      const analyticsPrimary = widgets[0];
      const analyticsSecondary = widgets[1];
      const detailPrimary = widgets[2];
      const detailSecondary = widgets[3];
      const extraWidgets = widgets.slice(4);
      const [selectedDbIds, setSelectedDbIds] = useState<number[]>([]);
      const [isolatedDbIds, setIsolatedDbIds] = useState<number[] | null>(null);

      const isEditable = renderMode === "full" && !!specMutator;
      const rootChildren = currentSpec?.elements[currentSpec.root]?.children ?? [];
      const fixedSlots = 3;
      const widgetKeys = rootChildren.slice(fixedSlots);
      const analyticsPrimaryKey = widgetKeys[0] ?? null;
      const analyticsSecondaryKey = widgetKeys[1] ?? null;
      const analyticsPrimaryState =
        currentSpec && analyticsPrimaryKey
          ? getChartSectionEditorState(currentSpec, analyticsPrimaryKey)
          : { hasTabs: false, tabCount: 0, activeChartType: null };
      const analyticsSecondaryState =
        currentSpec && analyticsSecondaryKey
          ? getChartSectionEditorState(currentSpec, analyticsSecondaryKey)
          : { hasTabs: false, tabCount: 0, activeChartType: null };

      const makeAddChart = useCallback(
        (targetKey: string | null) =>
          (kind: AddChartKind) => {
            if (!specMutator) return;
            specMutator((current) => {
              if (!targetKey) return current;
              return addChartAsTab(current, targetKey, kind);
            });
          },
        [specMutator],
      );

      const makeChangeChartType = useCallback(
        (targetKey: string | null) =>
          (nextType: SupportedChartType) => {
            if (!specMutator || !targetKey) return;
            specMutator((current) => updateChartTabType(current, targetKey, nextType));
          },
        [specMutator],
      );

      return (
        <ShowcaseSelectionContext.Provider
          value={{
            selectedDbIds,
            isolatedDbIds,
            setSelectedDbIds,
            setIsolatedDbIds,
          }}
        >
          <div className="flex w-full flex-col gap-5">
            {(props.title || props.description) && (
              <div className="space-y-1">
                {props.title && (
                  <h2 className="text-lg font-semibold tracking-tight">{props.title}</h2>
                )}
                {props.description && (
                  <p className="text-sm text-muted-foreground">
                    {props.description}
                  </p>
                )}
              </div>
            )}

            <ShowcaseShellSlot
              child={filters}
              emptyLabel="Filters and slicers will appear here."
              className="min-w-0"
            />

            <ShowcaseShellSlot
              child={kpis}
              emptyLabel="Key metrics will appear here."
              className="min-w-0"
            />

            <div className="grid gap-5 lg:grid-cols-12">
              <div className="grid min-w-0 gap-5 lg:col-span-7">
                <ShowcaseShellSlot
                  child={viewer}
                  emptyLabel="Viewer panel is required for every showcase dashboard."
                  className="min-w-0 min-h-[28rem] lg:min-h-[34rem]"
                  forceFillChild
                />
                {renderMode === "full" ? <ShowcaseSelectionInspector /> : null}
              </div>
              <div className="grid min-w-0 gap-5 lg:col-span-5">
                <ShowcaseShellSlot
                  child={analyticsPrimary}
                  emptyLabel="Primary analysis panel."
                  className="min-w-0 min-h-[18rem] lg:[&>*]:h-full"
                  onAddChart={
                    isEditable && analyticsPrimaryKey
                      ? makeAddChart(analyticsPrimaryKey)
                      : undefined
                  }
                  onChangeChartType={
                    isEditable &&
                    analyticsPrimaryKey &&
                    !analyticsPrimaryState.hasTabs &&
                    analyticsPrimaryState.activeChartType
                      ? makeChangeChartType(analyticsPrimaryKey)
                      : undefined
                  }
                />
                <ShowcaseShellSlot
                  child={analyticsSecondary}
                  emptyLabel="Secondary analysis panel."
                  className="min-w-0 min-h-[18rem] lg:[&>*]:h-full"
                  onAddChart={
                    isEditable && analyticsSecondaryKey
                      ? makeAddChart(analyticsSecondaryKey)
                      : undefined
                  }
                  onChangeChartType={
                    isEditable &&
                    analyticsSecondaryKey &&
                    !analyticsSecondaryState.hasTabs &&
                    analyticsSecondaryState.activeChartType
                      ? makeChangeChartType(analyticsSecondaryKey)
                      : undefined
                  }
                />
              </div>
              <ShowcaseShellSlot
                child={detailPrimary}
                emptyLabel="Detail table or schedule."
                className="min-w-0 lg:col-span-6 lg:min-h-[20rem]"
              />
              <ShowcaseShellSlot
                child={detailSecondary}
                emptyLabel="Additional detail panel."
                className="min-w-0 lg:col-span-6 lg:min-h-[20rem]"
              />

              {extraWidgets.map((widget, index) => (
                <ShowcaseShellSlot
                  key={`extra-widget-${index}`}
                  child={widget}
                  emptyLabel="Additional visual."
                  className="min-w-0 lg:col-span-6 lg:min-h-[18rem]"
                />
              ))}
            </div>
          </div>
        </ShowcaseSelectionContext.Provider>
      );
    },

    // Chat-specific components
    Text: ({ props }) => (
      <p className={props.muted ? "text-muted-foreground" : ""}>
        {props.content}
      </p>
    ),

    Metric: ({ props }) => {
      const TrendIcon =
        props.trend === "up"
          ? TrendingUp
          : props.trend === "down"
            ? TrendingDown
            : Minus;
      const trendColor =
        props.trend === "up"
          ? "text-emerald-500"
          : props.trend === "down"
            ? "text-red-400"
            : "text-muted-foreground";
      return (
        <div className="flex h-full min-h-[5.5rem] flex-col justify-between rounded-lg border border-border/60 bg-card px-4 py-3">
          <p className="text-xs font-medium text-muted-foreground">{props.label}</p>
          <div className="flex items-end justify-between gap-2">
            <p className="text-2xl font-semibold tabular-nums tracking-tight">
              {formatMetricValue(props.value)}
            </p>
            {props.trend && <TrendIcon className={`mb-1 h-4 w-4 shrink-0 ${trendColor}`} />}
          </div>
          {props.detail && (
            <p className="text-xs text-muted-foreground">{props.detail}</p>
          )}
        </div>
      );
    },

    Table: ({ props }) => {
      const items = normalizeTableItems(props.data);
      const [sortKey, setSortKey] = useState<string | null>(null);
      const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
      const applyInteraction = useShowcaseVisualInteraction();

      if (items.length === 0) {
        return (
          <div className="py-4 text-center text-sm text-muted-foreground">
            {props.emptyMessage ?? "No data"}
          </div>
        );
      }

      const sorted = sortTableItems(items, sortKey, sortDir);
      const numericColumns = new Set(
        props.columns
          .filter((col) => columnLooksNumeric(items, col.key))
          .map((col) => col.key),
      );

      const handleSort = (key: string) => {
        if (sortKey === key) {
          setSortDir((d) => (d === "asc" ? "desc" : "asc"));
        } else {
          setSortKey(key);
          setSortDir("asc");
        }
      };

      return (
        <div className="overflow-hidden rounded-md border border-border/60">
          <Table>
            <TableHeader>
              <TableRow>
                {props.columns.map((col) => {
                  const SortIcon =
                    sortKey === col.key
                      ? sortDir === "asc"
                        ? ArrowUp
                        : ArrowDown
                      : ArrowUpDown;
                  return (
                    <TableHead
                      key={col.key}
                      className={numericColumns.has(col.key) ? "text-right" : undefined}
                    >
                      <button
                        type="button"
                        className={`inline-flex items-center gap-1 transition-colors hover:text-foreground ${
                          numericColumns.has(col.key) ? "ml-auto flex" : ""
                        }`}
                        onClick={() => handleSort(col.key)}
                      >
                        {col.label}
                        <SortIcon className="h-3 w-3 text-muted-foreground" />
                      </button>
                    </TableHead>
                  );
                })}
              </TableRow>
            </TableHeader>
            <TableBody>
              {sorted.map((item, i) => (
                <TableRow
                  key={i}
                  className={
                    extractInteractiveDbIds(item).length > 0
                      ? "cursor-pointer hover:bg-muted/30"
                      : undefined
                  }
                  onClick={() =>
                    applyInteraction(
                      item,
                      typeof item.dbId === "number" ? "select" : "isolate",
                    )
                  }
                >
                  {props.columns.map((col) => (
                    <TableCell
                      key={col.key}
                      className={numericColumns.has(col.key) ? "text-right tabular-nums" : undefined}
                    >
                      {formatTableCellValue(item[col.key])}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      );
    },

    Link: ({ props }) => (
      <a
        href={props.href}
        target="_blank"
        rel="noopener noreferrer"
        className="text-primary underline underline-offset-4 hover:text-primary/80"
      >
        {props.text}
      </a>
    ),

    BarChart: ({ props }) => {
      const rawData = props.data;
      const applyInteraction = useShowcaseVisualInteraction();
      const rawItems = useMemo<Array<Record<string, unknown>>>(
        () =>
          Array.isArray(rawData)
            ? rawData
            : Array.isArray((rawData as Record<string, unknown>)?.data)
              ? ((rawData as Record<string, unknown>).data as Array<
                  Record<string, unknown>
                >)
              : [],
        [rawData],
      );

      const { items, valueKey } = useMemo(
        () =>
          processChartData(
            rawItems,
            props.xKey,
            props.yKey,
            props.aggregate,
          ),
        [rawItems, props.aggregate, props.xKey, props.yKey],
      );

      const chartColor = props.color ?? "var(--chart-1)";

      const chartConfig = {
        [valueKey]: {
          label: valueKey,
          color: chartColor,
        },
      } satisfies ChartConfig;

      if (items.length === 0) {
        return (
          <div className="text-center py-4 text-muted-foreground">
            No data available
          </div>
        );
      }

      return (
        <div className="flex h-full min-h-0 w-full flex-col">
          {props.title && (
            <p className="text-sm font-medium mb-2">{props.title}</p>
          )}
          <ChartContainer
            config={chartConfig}
            className="min-h-[220px] h-full w-full !aspect-auto"
            style={{ height: "100%", minHeight: props.height ?? 220 }}
          >
            <RechartsBarChart
              accessibilityLayer
              data={items}
            >
              <CartesianGrid vertical={false} />
              <XAxis
                dataKey="label"
                tickLine={false}
                tickMargin={10}
                axisLine={false}
              />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Bar
                dataKey={valueKey}
                fill={`var(--color-${valueKey})`}
                radius={4}
                className="cursor-pointer"
                onClick={(data) => {
                  applyInteraction(extractChartPayload(data), "isolate");
                }}
              />
            </RechartsBarChart>
          </ChartContainer>
        </div>
      );
    },

    LineChart: ({ props }) => {
      const rawData = props.data;
      const applyInteraction = useShowcaseVisualInteraction();
      const rawItems = useMemo<Array<Record<string, unknown>>>(
        () =>
          Array.isArray(rawData)
            ? rawData
            : Array.isArray((rawData as Record<string, unknown>)?.data)
              ? ((rawData as Record<string, unknown>).data as Array<
                  Record<string, unknown>
                >)
              : [],
        [rawData],
      );

      const { items, valueKey } = useMemo(
        () =>
          processChartData(
            rawItems,
            props.xKey,
            props.yKey,
            props.aggregate,
          ),
        [rawItems, props.aggregate, props.xKey, props.yKey],
      );

      const chartColor = props.color ?? "var(--chart-1)";

      const chartConfig = {
        [valueKey]: {
          label: valueKey,
          color: chartColor,
        },
      } satisfies ChartConfig;

      if (items.length === 0) {
        return (
          <div className="text-center py-4 text-muted-foreground">
            No data available
          </div>
        );
      }

      return (
        <div className="flex h-full min-h-0 w-full flex-col">
          {props.title && (
            <p className="text-sm font-medium mb-2">{props.title}</p>
          )}
          <ChartContainer
            config={chartConfig}
            className="min-h-[220px] h-full w-full !aspect-auto [&_svg]:overflow-visible"
            style={{ height: "100%", minHeight: props.height ?? 220 }}
          >
            <RechartsLineChart
              accessibilityLayer
              data={items}
            >
              <CartesianGrid vertical={false} />
              <XAxis
                dataKey="label"
                tickLine={false}
                tickMargin={10}
                axisLine={false}
                interval={
                  items.length > 12
                    ? Math.ceil(items.length / 8) - 1
                    : undefined
                }
              />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Line
                type="monotone"
                dataKey={valueKey}
                stroke={`var(--color-${valueKey})`}
                strokeWidth={2}
                activeDot={{
                  r: 6,
                  className: "cursor-pointer",
                  onClick: (data: unknown) => {
                    applyInteraction(extractChartPayload(data), "isolate");
                  },
                }}
              />
            </RechartsLineChart>
          </ChartContainer>
        </div>
      );
    },

    Tabs: ({ props, children, bindings, emit }) => {
      const tabs = props.tabs ?? [];
      const renderMode = useContext(DashboardRenderModeContext);
      const currentSpec = useContext(CurrentSpecContext);
      const specMutator = useContext(SpecMutatorContext);
      const [boundValue, setBoundValue] = useBoundProp<string>(
        props.value as string | undefined,
        bindings?.value,
      );
      const [localValue, setLocalValue] = useState(
        props.defaultValue ?? tabs[0]?.value ?? "",
      );
      const isBound = !!bindings?.value;
      const value = isBound
        ? String(boundValue ?? props.defaultValue ?? tabs[0]?.value ?? "")
        : localValue;
      const [addMenuOpen, setAddMenuOpen] = useState(false);
      const addMenuRef = useRef<HTMLDivElement>(null);

      useEffect(() => {
        if (!addMenuOpen) return;
        const handleClickOutside = (event: MouseEvent) => {
          if (addMenuRef.current && !addMenuRef.current.contains(event.target as Node)) {
            setAddMenuOpen(false);
          }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
      }, [addMenuOpen]);

      const setValue = (nextValue: string) => {
        if (isBound) {
          setBoundValue(nextValue);
        } else {
          setLocalValue(nextValue);
        }
        emit("change");
      };

      const sectionKey =
        typeof props.editorSectionKey === "string" && props.editorSectionKey.trim()
          ? props.editorSectionKey
          : null;
      const isEditable = renderMode === "full" && !!specMutator && !!sectionKey;
      const editorState =
        currentSpec && sectionKey
          ? getChartSectionEditorState(currentSpec, sectionKey, value)
          : { hasTabs: false, tabCount: 0, activeChartType: null };

      return (
        <TabsValueContext.Provider value={value}>
          <Tabs value={value} onValueChange={setValue}>
            <div className="flex items-start gap-2">
              <TabsList className="min-w-0 flex-1 justify-start overflow-x-auto">
                {tabs.map((tab) => (
                  <TabsTrigger key={tab.value} value={tab.value}>
                    {tab.label}
                  </TabsTrigger>
                ))}
              </TabsList>

              {isEditable && sectionKey ? (
                <div className="flex items-center gap-2">
                  <div ref={addMenuRef} className="relative">
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="h-8 w-8 shrink-0"
                      onClick={() => setAddMenuOpen((open) => !open)}
                      aria-label="Add chart tab"
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </Button>
                    {addMenuOpen ? (
                      <div className="absolute right-0 top-9 z-50 min-w-[10rem] rounded-md border bg-popover p-1 shadow-md">
                        {ADD_CHART_OPTIONS.map((option) => (
                          <button
                            key={`tab-add-${option.kind}`}
                            type="button"
                            onClick={() => {
                              specMutator?.((current) =>
                                addChartAsTab(current, sectionKey, option.kind, value),
                              );
                              setAddMenuOpen(false);
                            }}
                            className="flex w-full items-center gap-2 rounded-sm px-2.5 py-1.5 text-sm text-popover-foreground transition-colors hover:bg-accent"
                          >
                            <BarChart3 className="h-3.5 w-3.5 text-muted-foreground" />
                            {option.label}
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </div>

                  <Select
                    value={editorState.activeChartType ?? undefined}
                    onValueChange={(nextValue) => {
                      specMutator?.((current) =>
                        updateChartTabType(
                          current,
                          sectionKey,
                          nextValue as SupportedChartType,
                          value,
                        ),
                      );
                    }}
                  >
                    <SelectTrigger className="h-8 w-[6.5rem]">
                      <SelectValue placeholder="Type" />
                    </SelectTrigger>
                    <SelectContent>
                      {ADD_CHART_OPTIONS.map((option) => (
                        <SelectItem key={`tab-type-${option.kind}`} value={option.kind}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="h-8 w-8 shrink-0"
                    disabled={editorState.tabCount <= 1}
                    onClick={() => {
                      specMutator?.((current) =>
                        removeChartTab(current, sectionKey, value),
                      );
                    }}
                    aria-label="Delete current chart tab"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ) : null}
            </div>
            {children}
          </Tabs>
        </TabsValueContext.Provider>
      );
    },

    TabContent: ({ props, children }) => {
      const activeValue = useContext(TabsValueContext);

      // If a malformed spec places TabContent outside Tabs, render safely
      // instead of throwing from Radix context assertions.
      if (!activeValue) {
        return <div>{children}</div>;
      }

      if (activeValue !== props.value) {
        return null;
      }

      return <div>{children}</div>;
    },

    Pagination: ({ props, bindings, emit }) => {
      const totalPages = Math.max(1, props.totalPages ?? 1);
      const [boundPage, setBoundPage] = useBoundProp<string>(
        props.page as string | undefined,
        bindings?.page,
      );
      const [localPage, setLocalPage] = useState(props.page ?? "1");
      const isBound = !!bindings?.page;
      const rawPage = isBound ? boundPage ?? props.page ?? "1" : localPage;
      const parsedPage = Number.parseInt(String(rawPage ?? "1"), 10);
      const currentPage = Number.isFinite(parsedPage)
        ? Math.min(Math.max(parsedPage, 1), totalPages)
        : 1;

      const setPage = (page: number) => {
        const nextPage = String(Math.min(Math.max(page, 1), totalPages));
        if (isBound) {
          setBoundPage(nextPage);
        } else {
          setLocalPage(nextPage);
        }
        emit("change");
      };

      return (
        <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
          <Button
            variant="outline"
            size="sm"
            disabled={currentPage <= 1}
            onClick={() => setPage(currentPage - 1)}
          >
            Previous
          </Button>

          <div className="flex max-w-full items-center gap-1 overflow-x-auto">
            {Array.from({ length: totalPages }, (_, index) => {
              const page = index + 1;
              const isActive = page === currentPage;
              return (
                <Button
                  key={page}
                  variant={isActive ? "default" : "outline"}
                  size="sm"
                  onClick={() => setPage(page)}
                >
                  {page}
                </Button>
              );
            })}
          </div>

          <Button
            variant="outline"
            size="sm"
            disabled={currentPage >= totalPages}
            onClick={() => setPage(currentPage + 1)}
          >
            Next
          </Button>
        </div>
      );
    },

    Callout: ({ props }) => {
      const config = {
        info: {
          icon: Info,
          border: "border-l-blue-400",
          bg: "bg-blue-500/5",
          iconColor: "text-blue-400",
        },
        tip: {
          icon: Lightbulb,
          border: "border-l-emerald-400",
          bg: "bg-emerald-500/5",
          iconColor: "text-emerald-400",
        },
        warning: {
          icon: AlertTriangle,
          border: "border-l-amber-400",
          bg: "bg-amber-500/5",
          iconColor: "text-amber-400",
        },
        important: {
          icon: Star,
          border: "border-l-purple-400",
          bg: "bg-purple-500/5",
          iconColor: "text-purple-400",
        },
      }[props.type ?? "info"] ?? {
        icon: Info,
        border: "border-l-blue-400",
        bg: "bg-blue-500/5",
        iconColor: "text-blue-400",
      };
      const Icon = config.icon;
      return (
        <div
          className={`border-l-2 ${config.border} ${config.bg} rounded-r-md p-3`}
        >
          <div className="flex items-start gap-2.5">
            <Icon className={`h-4 w-4 mt-0.5 shrink-0 ${config.iconColor}`} />
            <div className="flex-1 min-w-0">
              {props.title && (
                <p className="font-medium text-sm">{props.title}</p>
              )}
              <p className="text-sm text-muted-foreground">{props.content}</p>
            </div>
          </div>
        </div>
      );
    },

    Timeline: ({ props }) => (
      <div className="relative pl-8">
        {/* Vertical line centered on dots: dot is 12px wide starting at 0px, center = 6px */}
        <div className="absolute left-[5.5px] top-3 bottom-3 w-px bg-border" />
        <div className="flex flex-col gap-6">
          {(props.items ?? []).map((item, i) => {
            const dotColor =
              item.status === "completed"
                ? "bg-emerald-500"
                : item.status === "current"
                  ? "bg-blue-500"
                  : "bg-muted-foreground/30";
            return (
              <div key={i} className="relative">
                <div
                  className={`absolute -left-8 top-0.5 h-3 w-3 rounded-full ${dotColor} ring-2 ring-background`}
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-medium text-sm">{item.title}</p>
                    {item.date && (
                      <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                        {item.date}
                      </span>
                    )}
                  </div>
                  {item.description && (
                    <p className="text-sm text-muted-foreground mt-1">
                      {item.description}
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    ),

    PieChart: ({ props }) => {
      const rawData = props.data;
      const applyInteraction = useShowcaseVisualInteraction();
      const items = useMemo<Array<Record<string, unknown>>>(
        () =>
          Array.isArray(rawData)
            ? rawData
            : Array.isArray((rawData as Record<string, unknown>)?.data)
              ? ((rawData as Record<string, unknown>).data as Array<
                  Record<string, unknown>
                >)
              : [],
        [rawData],
      );

      if (items.length === 0) {
        return (
          <div className="text-center py-4 text-muted-foreground">
            No data available
          </div>
        );
      }

      const chartConfig: ChartConfig = {};
      items.forEach((item, i) => {
        const name = String(item[props.nameKey] ?? `Segment ${i + 1}`);
        chartConfig[name] = {
          label: name,
          color: PIE_COLORS[i % PIE_COLORS.length],
        };
      });

      return (
        <div className="flex h-full min-h-0 w-full flex-col">
          {props.title && (
            <p className="text-sm font-medium mb-2">{props.title}</p>
          )}
          <ChartContainer
            config={chartConfig}
            className="mx-auto min-h-[220px] h-full w-full !aspect-auto"
            style={{ height: "100%", minHeight: props.height ?? 220 }}
          >
            <RechartsPieChart>
              <ChartTooltip content={<ChartTooltipContent />} />
              <Pie
                data={items.map((item, i) => ({
                  name: String(item[props.nameKey] ?? `Segment ${i + 1}`),
                  value:
                    typeof item[props.valueKey] === "number"
                      ? item[props.valueKey]
                      : parseFloat(String(item[props.valueKey])) || 0,
                  fill: PIE_COLORS[i % PIE_COLORS.length],
                  ...item,
                }))}
                dataKey="value"
                nameKey="name"
                innerRadius="40%"
                outerRadius="70%"
                paddingAngle={2}
                className="cursor-pointer"
                onClick={(payload) => {
                  applyInteraction(extractChartPayload(payload), "isolate");
                }}
              />
              <Legend />
            </RechartsPieChart>
          </ChartContainer>
        </div>
      );
    },

    RadioGroup: ({ props, bindings }) => {
      const [value, setValue] = useBoundProp<string>(
        props.value as string | undefined,
        bindings?.value,
      );
      const current = value ?? "";
      const options = (props.options ?? []).filter(
        (opt) => opt.value.trim().length > 0,
      );

      return (
        <div className="flex flex-col gap-2">
          {props.label && (
            <Label className="text-sm font-medium">{props.label}</Label>
          )}
          <RadioGroup
            value={current}
            onValueChange={(v: string) => setValue(v)}
          >
            {options.map((opt) => (
              <div key={opt.value} className="flex items-center gap-2">
                <RadioGroupItem value={opt.value} id={`rg-${opt.value}`} />
                <Label
                  htmlFor={`rg-${opt.value}`}
                  className="font-normal cursor-pointer"
                >
                  {opt.label}
                </Label>
              </div>
            ))}
          </RadioGroup>
        </div>
      );
    },

    SelectInput: ({ props, bindings }) => {
      const [value, setValue] = useBoundProp<string>(
        props.value as string | undefined,
        bindings?.value,
      );
      const options = (props.options ?? []).filter(
        (opt) => opt.value.trim().length > 0,
      );
      const current =
        value && options.some((opt) => opt.value === value) ? value : "";

      return (
        <div className="flex flex-col gap-2">
          {props.label && (
            <Label className="text-sm font-medium">{props.label}</Label>
          )}
          <Select value={current} onValueChange={(v: string) => setValue(v)}>
            <SelectTrigger>
              <SelectValue placeholder={props.placeholder ?? "Select..."} />
            </SelectTrigger>
            <SelectContent>
              {options.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      );
    },

    TextInput: ({ props, bindings }) => {
      const [value, setValue] = useBoundProp<string>(
        props.value as string | undefined,
        bindings?.value,
      );
      const current = value ?? "";

      return (
        <div className="flex flex-col gap-2">
          {props.label && (
            <Label className="text-sm font-medium">{props.label}</Label>
          )}
          <Input
            type={props.type ?? "text"}
            placeholder={props.placeholder ?? ""}
            value={current}
            onChange={(e) => setValue(e.target.value)}
          />
        </div>
      );
    },

    Button: ({ props, emit }) => (
      <Button
        variant={props.variant ?? "default"}
        size={props.size ?? "default"}
        disabled={props.disabled ?? false}
        onClick={() => emit("press")}
      >
        {props.label}
      </Button>
    ),

    AutodeskViewer: ({ props }) => {
      const selection = useContext(ShowcaseSelectionContext);
      const renderMode = useContext(DashboardRenderModeContext);

      if (renderMode === "preview") {
        return (
          <div className="flex h-full min-h-[24rem] flex-col rounded-lg border border-border/60 bg-card px-5 py-4">
            <div>
              <h3 className="text-sm font-semibold tracking-tight">3D Model Viewer</h3>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Open the full page to load the interactive Autodesk viewer.
              </p>
            </div>

            <div className="mt-4 flex flex-1 items-center justify-center rounded-md border border-dashed border-border/50 bg-muted/30 px-6 text-center">
              <div className="max-w-sm space-y-1.5">
                <p className="text-sm font-medium">Preview mode keeps chat responsive.</p>
                <p className="text-xs text-muted-foreground">
                  Open the full page for model navigation, selection, and isolation.
                </p>
              </div>
            </div>
          </div>
        );
      }

      return (
        <AutodeskViewerComponent
          urn={props.urn}
          height={props.height ?? DEFAULT_VIEWER_HEIGHT}
          theme={props.theme}
          showModelBrowser={props.showModelBrowser}
          fitToView={props.fitToView}
          isolatedDbIds={
            selection?.isolatedDbIds && selection.isolatedDbIds.length > 0
              ? selection.isolatedDbIds
              : props.isolatedDbIds
          }
          selectedDbIds={
            selection && selection.selectedDbIds.length > 0
              ? selection.selectedDbIds
              : props.selectedDbIds
          }
          fitToSelection={props.fitToSelection}
          onSelectionChange={(dbIds) => {
            selection?.setSelectedDbIds(dbIds);
          }}
        />
      );
    },

    // =========================================================================
    // 3D Scene Components
    // =========================================================================

    Scene3D: ({ props, children }) => (
      <div
        style={{
          height: props.height ?? "400px",
          width: "100%",
          background: props.background ?? "#111111",
          borderRadius: 8,
          overflow: "hidden",
        }}
      >
        <Canvas
          camera={{
            position: toVec3(props.cameraPosition) ?? [0, 10, 30],
            fov: props.cameraFov ?? 50,
          }}
        >
          <OrbitControls
            autoRotate={props.autoRotate ?? false}
            enablePan
            enableZoom
          />
          {children}
        </Canvas>
      </div>
    ),

    Group3D: ({ props, children }) => (
      <AnimatedGroup
        position={props.position}
        rotation={props.rotation}
        scale={props.scale}
        animation={props.animation}
      >
        {children}
      </AnimatedGroup>
    ),

    Box: ({ props, emit }) => (
      <MeshPrimitive meshProps={props} onClick={() => emit("press")}>
        <boxGeometry
          args={toGeoArgs<[number, number, number]>(props.args, [1, 1, 1])}
        />
      </MeshPrimitive>
    ),

    Sphere: ({ props, emit }) => (
      <MeshPrimitive meshProps={props} onClick={() => emit("press")}>
        <sphereGeometry
          args={toGeoArgs<[number, number, number]>(props.args, [1, 32, 32])}
        />
      </MeshPrimitive>
    ),

    Cylinder: ({ props, emit }) => (
      <MeshPrimitive meshProps={props} onClick={() => emit("press")}>
        <cylinderGeometry
          args={toGeoArgs<[number, number, number, number]>(
            props.args,
            [1, 1, 2, 32],
          )}
        />
      </MeshPrimitive>
    ),

    Cone: ({ props, emit }) => (
      <MeshPrimitive meshProps={props} onClick={() => emit("press")}>
        <coneGeometry
          args={toGeoArgs<[number, number, number]>(props.args, [1, 2, 32])}
        />
      </MeshPrimitive>
    ),

    Torus: ({ props, emit }) => (
      <MeshPrimitive meshProps={props} onClick={() => emit("press")}>
        <torusGeometry
          args={toGeoArgs<[number, number, number, number]>(
            props.args,
            [1, 0.4, 16, 100],
          )}
        />
      </MeshPrimitive>
    ),

    Plane: ({ props, emit }) => (
      <MeshPrimitive meshProps={props} onClick={() => emit("press")}>
        <planeGeometry
          args={toGeoArgs<[number, number]>(props.args, [10, 10])}
        />
      </MeshPrimitive>
    ),

    Ring: ({ props, emit }) => (
      <MeshPrimitive meshProps={props} onClick={() => emit("press")}>
        <ringGeometry
          args={toGeoArgs<[number, number, number]>(props.args, [0.5, 1, 64])}
        />
      </MeshPrimitive>
    ),

    AmbientLight: ({ props }) => (
      <ambientLight
        color={props.color ?? undefined}
        intensity={props.intensity ?? 0.5}
      />
    ),

    PointLight: ({ props }) => (
      <pointLight
        position={toVec3(props.position)}
        color={props.color ?? undefined}
        intensity={props.intensity ?? 1}
        distance={props.distance ?? 0}
      />
    ),

    DirectionalLight: ({ props }) => (
      <directionalLight
        position={toVec3(props.position)}
        color={props.color ?? undefined}
        intensity={props.intensity ?? 1}
      />
    ),

    Stars: ({ props }) => (
      <DreiStars
        radius={props.radius ?? 100}
        depth={props.depth ?? 50}
        count={props.count ?? 5000}
        factor={props.factor ?? 4}
        fade={props.fade ?? true}
        speed={props.speed ?? 1}
      />
    ),

    Label3D: ({ props }) => (
      <DreiText
        position={toVec3(props.position)}
        rotation={toVec3(props.rotation)}
        color={props.color ?? "#ffffff"}
        fontSize={props.fontSize ?? 1}
        anchorX={props.anchorX ?? "center"}
        anchorY={props.anchorY ?? "middle"}
      >
        {props.text}
      </DreiText>
    ),
  },
});

// =============================================================================
// Chart Helpers
// =============================================================================

const PIE_COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
];

function processChartData(
  items: Array<Record<string, unknown>>,
  xKey: string,
  yKey: string,
  aggregate: "sum" | "count" | "avg" | null | undefined,
): { items: Array<Record<string, unknown>>; valueKey: string } {
  if (items.length === 0) {
    return { items: [], valueKey: yKey };
  }

  if (!aggregate) {
    const formatted = items.map((item) => ({
      ...item,
      label: String(item[xKey] ?? ""),
    }));
    return { items: formatted, valueKey: yKey };
  }

  const groups = new Map<string, Array<Record<string, unknown>>>();

  for (const item of items) {
    const groupKey = String(item[xKey] ?? "unknown");
    const group = groups.get(groupKey) ?? [];
    group.push(item);
    groups.set(groupKey, group);
  }

  const valueKey = aggregate === "count" ? "count" : yKey;
  const aggregated: Array<Record<string, unknown>> = [];
  const sortedKeys = Array.from(groups.keys()).sort();

  for (const key of sortedKeys) {
    const group = groups.get(key)!;
    let value: number;

    if (aggregate === "count") {
      value = group.length;
    } else if (aggregate === "sum") {
      value = group.reduce((sum, item) => {
        const v = item[yKey];
        return sum + (typeof v === "number" ? v : parseFloat(String(v)) || 0);
      }, 0);
    } else {
      const sum = group.reduce((s, item) => {
        const v = item[yKey];
        return s + (typeof v === "number" ? v : parseFloat(String(v)) || 0);
      }, 0);
      value = group.length > 0 ? sum / group.length : 0;
    }

    const dbIds = Array.from(
      new Set(
        group.flatMap((item) =>
          Array.isArray(item.dbIds)
            ? item.dbIds.filter((value): value is number => typeof value === "number")
            : typeof item.dbId === "number"
              ? [item.dbId]
              : [],
        ),
      ),
    );

    aggregated.push({ label: key, [valueKey]: value, dbIds });
  }

  return { items: aggregated, valueKey };
}

// =============================================================================
// Fallback Component
// =============================================================================

export function Fallback({ type }: { type: string }) {
  return (
    <div className="p-4 border border-dashed rounded-lg text-muted-foreground text-sm">
      Unknown component: {type}
    </div>
  );
}
