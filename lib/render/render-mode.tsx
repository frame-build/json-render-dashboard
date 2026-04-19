"use client";

import { createContext } from "react";
import type { Spec } from "@json-render/react";
import type { PromptRefinementSelection } from "@/lib/chat/types";

export type DashboardRenderMode = "preview" | "full";

export const DashboardRenderModeContext =
  createContext<DashboardRenderMode>("full");

export type SpecMutator = (updater: (current: Spec) => Spec) => void;
export type PromptRefinementSubmit = (
  selection: PromptRefinementSelection,
) => void | Promise<void>;

export const SpecMutatorContext = createContext<SpecMutator | null>(null);
export const CurrentSpecContext = createContext<Spec | null>(null);
export const PromptRefinementSubmitContext =
  createContext<PromptRefinementSubmit | null>(null);
