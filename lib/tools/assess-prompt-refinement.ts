import { tool } from "ai";
import { z } from "zod";
import { assessPromptRefinement } from "@/lib/chat/prompt-refinement";

export const assessPromptRefinementTool = tool({
  description:
    "Assess whether the current user prompt is too weak or underspecified for BIM dashboard generation. Use this before any data-query tool calls.",
  inputSchema: z.object({
    prompt: z
      .string()
      .nullable()
      .describe("The current user prompt to assess for BIM dashboard specificity."),
  }),
  execute: async ({ prompt }, { experimental_context }) => {
    const context = (experimental_context ?? {}) as {
      latestPrompt?: unknown;
    };

    const effectivePrompt =
      typeof context.latestPrompt === "string" && context.latestPrompt.trim().length > 0
        ? context.latestPrompt.trim()
        : prompt?.trim() ?? "";

    console.info("[prompt-refinement][tool] executing", {
      prompt: effectivePrompt,
      contextPrompt:
        typeof context.latestPrompt === "string" ? context.latestPrompt : null,
    });

    return assessPromptRefinement(effectivePrompt);
  },
});
