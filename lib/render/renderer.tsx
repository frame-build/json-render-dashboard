"use client";

import { type ReactNode, useMemo } from "react";
import {
  Renderer,
  type ComponentRenderer,
  type Spec,
  StateProvider,
  VisibilityProvider,
  ActionProvider,
} from "@json-render/react";

import { registry, Fallback } from "./registry";
import { normalizeShowcaseDashboardSpec } from "./normalize-showcase-spec";
import {
  CurrentSpecContext,
  DashboardRenderModeContext,
  PromptRefinementSubmitContext,
  SpecMutatorContext,
  type DashboardRenderMode,
} from "./render-mode";
import { cn } from "@/lib/utils";
import type { PromptRefinementSelection } from "@/lib/chat/types";

// =============================================================================
// ExplorerRenderer
// =============================================================================

interface ExplorerRendererProps {
  spec: Spec | null;
  loading?: boolean;
  renderMode?: DashboardRenderMode;
  specMutator?: (updater: (current: Spec) => Spec) => void;
  promptRefinementSubmit?: (
    selection: PromptRefinementSelection,
  ) => void | Promise<void>;
}

const DASHBOARD_COMPONENT_TYPES = new Set([
  "ShowcaseDashboardLayout",
  "AutodeskViewer",
  "Metric",
  "BarChart",
  "LineChart",
  "PieChart",
]);

const fallback: ComponentRenderer = ({ element }) => (
  <Fallback type={element.type} />
);

function RenderSpecTree({
  normalizedSpec,
  loading,
  renderMode,
  specMutator,
  promptRefinementSubmit,
}: {
  normalizedSpec: Spec;
  loading?: boolean;
  renderMode: DashboardRenderMode;
  specMutator?: (updater: (current: Spec) => Spec) => void;
  promptRefinementSubmit?: (
    selection: PromptRefinementSelection,
  ) => void | Promise<void>;
}): ReactNode {
  return (
    <DashboardRenderModeContext.Provider value={renderMode}>
      <CurrentSpecContext.Provider value={normalizedSpec}>
        <PromptRefinementSubmitContext.Provider
          value={promptRefinementSubmit ?? null}
        >
          <SpecMutatorContext.Provider value={specMutator ?? null}>
            <StateProvider initialState={normalizedSpec.state ?? {}}>
              <VisibilityProvider>
                <ActionProvider>
                  <Renderer
                    spec={normalizedSpec}
                    registry={registry}
                    fallback={fallback}
                    loading={loading}
                  />
                </ActionProvider>
              </VisibilityProvider>
            </StateProvider>
          </SpecMutatorContext.Provider>
        </PromptRefinementSubmitContext.Provider>
      </CurrentSpecContext.Provider>
    </DashboardRenderModeContext.Provider>
  );
}

export function ExplorerRenderer({
  spec,
  loading,
  renderMode = "full",
  specMutator,
  promptRefinementSubmit,
}: ExplorerRendererProps): ReactNode {
  const normalizedSpec = useMemo(
    () => normalizeShowcaseDashboardSpec(spec),
    [spec],
  );
  if (!normalizedSpec) return null;

  return (
    <RenderSpecTree
      normalizedSpec={normalizedSpec}
      loading={loading}
      renderMode={renderMode}
      specMutator={specMutator}
      promptRefinementSubmit={promptRefinementSubmit}
    />
  );
}

function getRootElementType(spec: Spec | null): string | null {
  if (!spec) return null;
  return spec.elements?.[spec.root]?.type ?? null;
}

export function isDashboardSpec(spec: Spec | null): boolean {
  if (!spec?.elements) return false;

  return Object.values(spec.elements).some((element) =>
    DASHBOARD_COMPONENT_TYPES.has(element.type),
  );
}

export function DashboardSpecRenderer({
  spec,
  loading,
  renderMode = "full",
  specMutator,
  promptRefinementSubmit,
}: ExplorerRendererProps): ReactNode {
  const normalizedSpec = useMemo(
    () => normalizeShowcaseDashboardSpec(spec),
    [spec],
  );
  if (!normalizedSpec) return null;

  if (!isDashboardSpec(normalizedSpec)) {
    return <RenderSpecTree normalizedSpec={normalizedSpec} loading={loading} renderMode={renderMode} specMutator={specMutator} promptRefinementSubmit={promptRefinementSubmit} />;
  }

  const rootType = getRootElementType(normalizedSpec);
  const shouldApplyOuterFrame = isDashboardSpec(normalizedSpec) && !!rootType;

  if (!shouldApplyOuterFrame) {
    return <RenderSpecTree normalizedSpec={normalizedSpec} loading={loading} renderMode={renderMode} specMutator={specMutator} promptRefinementSubmit={promptRefinementSubmit} />;
  }

  return (
    <div
      className={cn(
        "w-full rounded-lg border border-border/60 p-3",
      )}
    >
      <div className="w-full rounded-md">
        <RenderSpecTree
          normalizedSpec={normalizedSpec}
          loading={loading}
          renderMode={renderMode}
          specMutator={specMutator}
          promptRefinementSubmit={promptRefinementSubmit}
        />
      </div>
    </div>
  );
}
