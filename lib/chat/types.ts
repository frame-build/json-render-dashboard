import {
  SPEC_DATA_PART,
  SPEC_DATA_PART_TYPE,
  type SpecDataPart,
} from "@json-render/core";
import type { UIMessage } from "ai";

export const PROMPT_REFINEMENT_DATA_PART = "promptRefinement" as const;
export const PROMPT_REFINEMENT_DATA_PART_TYPE =
  `data-${PROMPT_REFINEMENT_DATA_PART}` as const;

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

export type AppDataParts = {
  [SPEC_DATA_PART]: SpecDataPart;
  [PROMPT_REFINEMENT_DATA_PART]: PromptRefinementSelection;
};

export type AppMessage = UIMessage<unknown, AppDataParts>;

export {
  SPEC_DATA_PART,
  SPEC_DATA_PART_TYPE,
  type SpecDataPart,
};
