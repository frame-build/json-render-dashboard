import {
  SPEC_DATA_PART,
  SPEC_DATA_PART_TYPE,
  type SpecDataPart,
} from "@json-render/core";
import type { UIMessage } from "ai";

export const PROMPT_REFINEMENT_DATA_PART = "promptRefinement" as const;
export const PROMPT_REFINEMENT_DATA_PART_TYPE =
  `data-${PROMPT_REFINEMENT_DATA_PART}` as const;
export const CHAT_STATUS_DATA_PART = "chatStatus" as const;
export const CHAT_STATUS_DATA_PART_TYPE =
  `data-${CHAT_STATUS_DATA_PART}` as const;
export const SHOWCASE_CONTEXT_DATA_PART = "showcaseContext" as const;
export const SHOWCASE_CONTEXT_DATA_PART_TYPE =
  `data-${SHOWCASE_CONTEXT_DATA_PART}` as const;

export interface PromptRefinementOption {
  label: string;
  prompt: string;
  rationale: string;
}

export interface PromptRefinementSelection {
  mode: "enriched" | "original";
  originalPrompt: string;
  selectedPrompt: string;
}

export interface ChatStatusData {
  phase: "prompt-assessment" | "dashboard-generation";
  message: string;
}

export interface ShowcaseContextData {
  showcase: {
    name: string;
    focus: string;
    note: string;
  };
  model: {
    urn: string;
    viewerType: string;
    tokenEndpoint: string;
  };
  layoutContract: {
    viewerRequired: boolean;
    requiredSections: string[];
    preferredLayout: string;
  };
  summary: {
    projectName: string;
    estimatePhase: string;
    modelStatus: string;
    dataStatus: string;
  };
  highlights: Array<{ label: string; value: string }>;
  supportedDashboards: Array<{ mode: string; emphasis: string }>;
  tradeBreakdown: Array<{ trade: string; amount: number }>;
  takeoffCategories: Array<{ category: string; quantity: number; unit: string }>;
  estimatePackages: Array<{
    package: string;
    status: string;
    owner: string;
  }>;
}

export type AppDataParts = {
  [SPEC_DATA_PART]: SpecDataPart;
  [PROMPT_REFINEMENT_DATA_PART]: PromptRefinementSelection;
  [CHAT_STATUS_DATA_PART]: ChatStatusData;
  [SHOWCASE_CONTEXT_DATA_PART]: ShowcaseContextData;
};

export type AppMessage = UIMessage<unknown, AppDataParts>;

export {
  SPEC_DATA_PART,
  SPEC_DATA_PART_TYPE,
  type SpecDataPart,
};
