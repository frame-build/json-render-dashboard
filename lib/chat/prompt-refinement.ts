import { generateText, Output } from "ai";
import { gateway } from "@ai-sdk/gateway";
import type { Spec } from "@json-render/react";
import { z } from "zod";
import summary from "@/data/aps/showcase/normalized/summary.json";
import {
  PROMPT_REFINEMENT_DATA_PART_TYPE,
  type AppMessage,
  type PromptRefinementOption,
  type PromptRefinementSelection,
} from "@/lib/chat/types";

const DEFAULT_PROMPT_REFINEMENT_MODEL = "openai/gpt-5-nano";

const refinementModelId = (() => {
  const value = process.env.AI_GATEWAY_PROMPT_REFINEMENT_MODEL
    ?? DEFAULT_PROMPT_REFINEMENT_MODEL;

  if (!value) {
    throw new Error(
      "Missing AI_GATEWAY_PROMPT_REFINEMENT_MODEL environment variable.",
    );
  }

  return value;
})();

const TOP_CATEGORIES = summary.facets.categories
  .slice(0, 12)
  .map((entry) => entry.value);
const TOP_FAMILIES = summary.facets.families
  .slice(0, 12)
  .map((entry) => entry.value);
const SUPPORTED_FILTERS = [
  "Category",
  "Family",
  "Type",
  "Level",
  "Material",
  "Activity",
  "Search",
];
const SUPPORTED_METRICS = ["count", "length", "area", "volume"];
const DATASET_TERMS = new Set(
  [...TOP_CATEGORIES, ...TOP_FAMILIES]
    .flatMap((value) => value.toLowerCase().split(/[^a-z0-9]+/))
    .filter(Boolean),
);

const PROMPT_TRIAGE_EXAMPLES = [
  {
    prompt: "walls",
    action: "refine",
    reason:
      "Category-only prompt. It does not specify dashboard intent, filters, KPIs, charts, or tables.",
  },
  {
    prompt: "show me walls",
    action: "refine",
    reason:
      "Still too underspecified for BIM dashboard generation. It mentions an object category but not the dashboard structure or analysis scope.",
  },
  {
    prompt: "floors",
    action: "refine",
    reason:
      "Single-category prompt with no dashboard, filter, KPI, chart, or schedule intent.",
  },
  {
    prompt: "steel framing",
    action: "refine",
    reason:
      "Broad trade/category phrase without enough BIM dashboard detail to generate reliably.",
  },
  {
    prompt: "duct dashboard",
    action: "refine",
    reason:
      "Has dashboard intent, but is still too weak because it lacks filters, metrics, or analysis scope.",
  },
  {
    prompt: "hello",
    action: "irrelevant",
    reason:
      "Greeting-only prompt. It is not a request for an APS showcase dashboard.",
  },
  {
    prompt: "how are you",
    action: "irrelevant",
    reason:
      "Conversational small talk, not a dashboard-generation request.",
  },
  {
    prompt:
      "Build a Walls dashboard with Type, Level, Material, and Search filters, wall count, length, area, and volume KPIs, charts by type and level, and a full wall schedule",
    action: "generate",
    reason:
      "Already specific enough: dashboard intent, filters, KPIs, charts, and a detail table are all present.",
  },
  {
    prompt:
      "Create a Structural Framing dashboard with the Autodesk viewer, Level and Material filters, quantity KPIs, charts by type, and a member schedule",
    action: "generate",
    reason:
      "Specific BIM dashboard prompt with clear visualization and data requirements.",
  },
];

const PromptRefinementSchema = z.object({
  title: z.string(),
  description: z.string(),
  options: z
    .array(
      z.object({
        label: z.string(),
        prompt: z.string(),
        rationale: z.string(),
      }),
    )
    .min(3)
    .max(5),
});

const PromptRefinementDecisionSchema = z.object({
  action: z.enum(["generate", "refine", "irrelevant"]),
  reason: z.string(),
  title: z.string().nullable(),
  description: z.string().nullable(),
  options: z
    .array(
      z.object({
        label: z.string(),
        prompt: z.string(),
        rationale: z.string(),
      }),
    )
    .nullable(),
});

export interface PromptRefinementResult {
  title: string;
  description: string;
  options: PromptRefinementOption[];
}

function extractTextFromMessage(message: AppMessage | undefined) {
  if (!message) {
    return "";
  }

  return message.parts
    .filter(
      (part): part is Extract<(typeof message.parts)[number], { type: "text" }> =>
        part.type === "text",
    )
    .map((part) => part.text)
    .join("")
    .trim();
}

export function getLatestUserPrompt(messages: AppMessage[]) {
  const lastUserMessage = [...messages].reverse().find(
    (message) => message.role === "user",
  );

  return extractTextFromMessage(lastUserMessage);
}

export function getPromptRefinementSelection(
  message: AppMessage | undefined,
): PromptRefinementSelection | null {
  if (!message) {
    return null;
  }

  const part = message.parts.find(
    (candidate) => candidate.type === PROMPT_REFINEMENT_DATA_PART_TYPE,
  );

  if (!part || !("data" in part)) {
    return null;
  }

  const data = part.data;
  if (
    !data ||
    typeof data !== "object" ||
    !("mode" in data) ||
    !("originalPrompt" in data) ||
    !("selectedPrompt" in data)
  ) {
    return null;
  }

  return data as PromptRefinementSelection;
}

export interface PromptRefinementAssessment {
  action: "generate" | "refine" | "irrelevant";
  reason: string;
  refinement: PromptRefinementResult | null;
}

export async function assessPromptRefinement(
  prompt: string,
): Promise<PromptRefinementAssessment> {
  const normalizedPrompt = prompt.trim();
  if (!normalizedPrompt) {
    return {
      action: "irrelevant",
      reason: "Prompt is empty.",
      refinement: null,
    };
  }

  try {
    const { output } = await generateText({
      model: gateway(refinementModelId),
      temperature: 0,
      output: Output.object({
        schema: PromptRefinementDecisionSchema,
      }),
      prompt: [
        "You are classifying whether a user prompt should generate a BIM dashboard directly, should first be refined, or is irrelevant to this app.",
        "The app builds dashboards for a fixed Autodesk showcase model.",
        "Return action='refine' when the prompt is BIM-related but too vague, too short, missing dashboard structure, or missing enough analysis scope to reliably generate a strong dashboard.",
        "Return action='irrelevant' when the prompt is small talk, casual chat, or not really asking for a BIM/dashboard result.",
        "Return action='generate' only when the prompt is already specific enough to generate directly.",
        "Important rules:",
        "- Mentioning only a category, family, or trade is NOT enough.",
        "- Short prompts like 'walls', 'show me walls', 'floors', 'windows', or 'steel framing' should refine.",
        "- Greetings or chat prompts like 'hello', 'how are you', or unrelated questions should be irrelevant.",
        "- Prompts that do not clearly request filters, KPIs/metrics, charts/groupings, or tables/schedules should usually refine.",
        "- Prompts that already specify dashboard intent plus meaningful analysis structure should generate.",
        "- When action is 'refine', provide 3 to 5 prompt options grounded in the showcase dataset.",
        "- When action is 'irrelevant', do not suggest a dashboard UI. Just explain briefly that this app is for APS showcase dashboards.",
        `Top categories: ${TOP_CATEGORIES.join(", ")}.`,
        `Top families: ${TOP_FAMILIES.join(", ")}.`,
        `Supported filters: ${SUPPORTED_FILTERS.join(", ")}.`,
        `Supported KPI quantities: ${SUPPORTED_METRICS.join(", ")}.`,
        `Dataset vocabulary hints: ${Array.from(DATASET_TERMS).slice(0, 60).join(", ")}.`,
        "Examples:",
        ...PROMPT_TRIAGE_EXAMPLES.map(
          (example) =>
            [
              `Prompt: ${example.prompt}`,
              `Result: action=${example.action}`,
              `Reason: ${example.reason}`,
            ].join("\n"),
        ),
        `User prompt: ${normalizedPrompt}`,
      ].join("\n"),
    });

    const assessment = {
      action: output.action,
      reason: output.reason.trim(),
      refinement: output.action !== "refine"
        ? null
        : normalizeRefinementResult(
          normalizedPrompt,
          {
            title:
              output.title?.trim()
              || "Strengthen your prompt before generating",
            description:
              output.description?.trim()
              || "Choose a more specific BIM dashboard prompt grounded in the showcase dataset.",
            options:
              output.options?.map((option) => ({
                label: option.label,
                prompt: option.prompt,
                rationale: option.rationale,
              })) ?? [],
          },
        ),
    };

    console.info("[prompt-refinement][assessment]", {
      prompt: normalizedPrompt,
      action: assessment.action,
      reason: assessment.reason,
      optionCount: assessment.refinement?.options.length ?? 0,
    });

    return assessment;
  } catch {
    console.warn("[prompt-refinement][assessment] failed", {
      prompt: normalizedPrompt,
    });
    return {
      action: "generate",
      reason: "Prompt assessment failed.",
      refinement: null,
    };
  }
}

function pickCategoryHint(prompt: string) {
  const normalizedPrompt = prompt.toLowerCase();

  if (/\bcurtain\b/.test(normalizedPrompt)) return "Curtain Wall";
  if (/\bwall/.test(normalizedPrompt)) return "Walls";
  if (/\bfloor/.test(normalizedPrompt)) return "Floors";
  if (/\bframe|framing|beam|joist|steel/.test(normalizedPrompt)) {
    return "Structural Framing";
  }
  if (/\bduct|hvac|mechanical/.test(normalizedPrompt)) {
    return "Ducts and Duct Fittings";
  }
  if (/\bwindow/.test(normalizedPrompt)) return "Windows";
  if (/\bdoor/.test(normalizedPrompt)) return "Doors";
  if (/\bfoundation|column/.test(normalizedPrompt)) {
    return "Structural Foundations and Columns";
  }

  return "Walls";
}

function buildFallbackPromptRefinement(
  prompt: string,
): PromptRefinementResult {
  const categoryHint = pickCategoryHint(prompt);

  const optionsByCategory: Record<string, PromptRefinementOption[]> = {
    Walls: [
      {
        label: "Walls by type and level",
        prompt:
          "Build a Walls dashboard for the Autodesk showcase model with the Autodesk viewer, Type, Level, Material, and Search filters, wall count, length, area, and volume KPIs, charts by type and level, and a full wall schedule",
        rationale:
          "Uses the exact Walls category with the supported filters and quantities.",
      },
      {
        label: "Basic Wall focus",
        prompt:
          "Build a Basic Wall dashboard for the Autodesk showcase model with the Autodesk viewer, Family, Type, Level, and Material filters, wall count, length, area, and volume KPIs, charts by type and material, and a full Basic Wall schedule",
        rationale:
          "Narrows the request to the strongest wall family in the showcase dataset.",
      },
      {
        label: "Curtain Wall facade view",
        prompt:
          "Build a Curtain Wall dashboard for the Autodesk showcase model with the Autodesk viewer, Family, Type, Level, and Material filters, facade count, area, and volume KPIs, charts by type and level, and a full curtain wall schedule",
        rationale:
          "Keeps the wall intent but pivots into the Curtain Wall family when a facade view is more useful.",
      },
    ],
    Floors: [
      {
        label: "Floors by level",
        prompt:
          "Build a Floors dashboard for the Autodesk showcase model with the Autodesk viewer, Family, Type, Level, and Material filters, floor count, area, and volume KPIs, charts by type and level, and a full floor schedule",
        rationale:
          "Uses the real Floors category and the strongest floor quantity fields.",
      },
      {
        label: "Floor family schedule",
        prompt:
          "Build a Floor family dashboard for the Autodesk showcase model with the Autodesk viewer, Family, Type, Level, and Material filters, floor count, area, and volume KPIs, charts by type and material, and a full floor schedule",
        rationale:
          "Focuses the dashboard on the Floor family for more predictable grouping and filtering.",
      },
      {
        label: "Floor material summary",
        prompt:
          "Build a Floors material dashboard for the Autodesk showcase model with the Autodesk viewer, Type, Level, Material, and Search filters, floor count, area, and volume KPIs, charts by material and level, and a full floor schedule",
        rationale:
          "Best when the user likely cares about quantities broken down by material.",
      },
    ],
    "Structural Framing": [
      {
        label: "Structural Framing by type",
        prompt:
          "Build a Structural Framing dashboard for the Autodesk showcase model with the Autodesk viewer, Type, Level, Material, and Search filters, framing count, length, area, and volume KPIs, charts by type and level, and a full member schedule",
        rationale:
          "Uses the real Structural Framing category and all four supported quantity KPIs.",
      },
      {
        label: "W Shapes and joists",
        prompt:
          "Build a Structural Framing dashboard for the Autodesk showcase model focused on W Shapes and K-Series Bar Joist-Angle Web, with the Autodesk viewer, Type, Level, Material, and Search filters, framing KPIs, charts by type and level, and a full member schedule",
        rationale:
          "Targets the strongest framing families in the dataset for richer charts and schedules.",
      },
      {
        label: "Framing by material",
        prompt:
          "Build a Structural Framing dashboard for the Autodesk showcase model with the Autodesk viewer, Type, Level, Material, and Search filters, count, length, area, and volume KPIs, charts by material and type, and a full member schedule",
        rationale:
          "Best when the request sounds material-driven but still needs the viewer and full schedule.",
      },
    ],
    "Ducts and Duct Fittings": [
      {
        label: "Ducts and fittings",
        prompt:
          "Build a Ducts and Duct Fittings dashboard for the Autodesk showcase model with the Autodesk viewer, Category, Family, Type, and Level filters, duct count and length KPIs, charts by family and type, and a full duct schedule",
        rationale:
          "Uses the two strongest mechanical categories together and keeps the filters aligned with the dataset.",
      },
      {
        label: "Round Duct focus",
        prompt:
          "Build a Round Duct dashboard for the Autodesk showcase model with the Autodesk viewer, Family, Type, Level, and Search filters, duct count and length KPIs, charts by type and level, and a full duct schedule",
        rationale:
          "Narrows the request to the largest duct family for a cleaner first-time BIM dashboard.",
      },
      {
        label: "Duct fittings summary",
        prompt:
          "Build a Duct Fittings dashboard for the Autodesk showcase model with the Autodesk viewer, Category, Family, Type, and Level filters, fitting count KPIs, charts by family and type, and a full fitting schedule",
        rationale:
          "Useful when the original prompt is broad mechanical language and needs a more concrete BIM scope.",
      },
    ],
    Windows: [
      {
        label: "Windows",
        prompt:
          "Build a Windows dashboard for the Autodesk showcase model focused on the Window-Sliding-Double family, with the Autodesk viewer, Family, Type, Level, and Search filters, count KPIs, charts by type and level, and a full window schedule",
        rationale:
          "Uses the strongest window family in the dataset and keeps the scope clear.",
      },
      {
        label: "Window type breakdown",
        prompt:
          "Build a Windows dashboard for the Autodesk showcase model with the Autodesk viewer, Family, Type, Level, and Search filters, count KPIs, charts by type and level, and a full window schedule",
        rationale:
          "Best when the prompt sounds like a general window takeoff and needs stronger BIM terminology.",
      },
      {
        label: "Window schedule and levels",
        prompt:
          "Build a Windows dashboard for the Autodesk showcase model with the Autodesk viewer, Family, Type, Level, and Search filters, count KPIs, charts by level and type, and a full window schedule",
        rationale:
          "Keeps the same data meaning but emphasizes the level breakdown.",
      },
    ],
    Doors: [
      {
        label: "Doors",
        prompt:
          "Build a Doors dashboard for the Autodesk showcase model focused on the Door-Passage-Single-Flush family, with the Autodesk viewer, Family, Type, Level, and Search filters, count KPIs, charts by type and level, and a full door schedule",
        rationale:
          "Anchors the prompt in the strongest door family in the dataset.",
      },
      {
        label: "Door type breakdown",
        prompt:
          "Build a Doors dashboard for the Autodesk showcase model with the Autodesk viewer, Family, Type, Level, and Search filters, count KPIs, charts by type and level, and a full door schedule",
        rationale:
          "Best for a generic door request that still needs the expected BIM dashboard structure.",
      },
      {
        label: "Door schedule by level",
        prompt:
          "Build a Doors dashboard for the Autodesk showcase model with the Autodesk viewer, Family, Type, Level, and Search filters, count KPIs, charts by level and type, and a full door schedule",
        rationale:
          "Emphasizes location while keeping the data scope deterministic.",
      },
    ],
    "Structural Foundations and Columns": [
      {
        label: "Foundations and columns",
        prompt:
          "Build a Structural Foundations, Columns, and Structural Columns dashboard for the Autodesk showcase model with the Autodesk viewer, Category, Type, Material, and Level filters, count, area, and volume KPIs, charts by type and material, and a full structural schedule",
        rationale:
          "Uses the exact structural categories available in the showcase dataset.",
      },
      {
        label: "Structural Foundations",
        prompt:
          "Build a Structural Foundations dashboard for the Autodesk showcase model with the Autodesk viewer, Type, Material, Level, and Search filters, count, area, and volume KPIs, charts by type and material, and a full structural schedule",
        rationale:
          "Useful when the original prompt is about foundations and needs a narrower BIM slice.",
      },
      {
        label: "Columns and structural columns",
        prompt:
          "Build a Columns and Structural Columns dashboard for the Autodesk showcase model with the Autodesk viewer, Category, Type, Material, and Level filters, count, area, and volume KPIs, charts by type and level, and a full structural schedule",
        rationale:
          "Keeps the structural scope but separates columns for a clearer takeoff.",
      },
    ],
  };

  const options = optionsByCategory[categoryHint] ?? optionsByCategory.Walls;

  return {
    title: "Strengthen your prompt before generating",
    description:
      "This prompt is a bit underspecified for the BIM showcase workflow. Choose a stronger option grounded in the actual showcase dataset, or use your original prompt as-is.",
    options,
  };
}

function normalizeRefinementResult(
  prompt: string,
  result: z.infer<typeof PromptRefinementSchema>,
): PromptRefinementResult {
  const seen = new Set<string>();
  const options = result.options
    .map((option) => ({
      label: option.label.trim(),
      prompt: option.prompt.trim(),
      rationale: option.rationale.trim(),
    }))
    .filter(
      (option) =>
        option.label.length > 0 &&
        option.prompt.length > 0 &&
        option.rationale.length > 0 &&
        !seen.has(option.prompt.toLowerCase()) &&
        seen.add(option.prompt.toLowerCase()),
    )
    .slice(0, 5);

  if (options.length < 3) {
    return buildFallbackPromptRefinement(prompt);
  }

  return {
    title: result.title.trim() || "Strengthen your prompt before generating",
    description:
      result.description.trim()
      || "Choose a more specific BIM dashboard prompt grounded in the showcase dataset.",
    options,
  };
}

export async function generatePromptRefinement(
  prompt: string,
): Promise<PromptRefinementResult> {
  try {
    const { output } = await generateText({
      model: gateway(refinementModelId),
      temperature: 0,
      output: Output.object({
        schema: PromptRefinementSchema,
      }),
      prompt: [
        "You improve weak BIM dashboard prompts for a fixed Autodesk showcase model.",
        "Return 3 to 5 stronger prompt options that preserve the user's intent but make it more precise for dashboard generation.",
        "Use the real showcase dataset vocabulary when relevant.",
        `Top categories: ${TOP_CATEGORIES.join(", ")}.`,
        `Top families: ${TOP_FAMILIES.join(", ")}.`,
        `Supported filters: ${SUPPORTED_FILTERS.join(", ")}.`,
        `Supported KPI quantities: ${SUPPORTED_METRICS.join(", ")}.`,
        "Every option should still request a dashboard with the Autodesk viewer, filters, KPIs, charts, and tables.",
        "Do not invent categories, families, or unsupported filter dimensions.",
        `User prompt: ${prompt}`,
      ].join("\n"),
    });

    return normalizeRefinementResult(prompt, output);
  } catch {
    return buildFallbackPromptRefinement(prompt);
  }
}

export function buildPromptRefinementSpec(
  refinement: PromptRefinementResult,
  originalPrompt: string,
  allowOriginalPrompt = true,
  autoSelectSeconds = 8,
): Spec {
  return {
    root: "prompt-refinement",
    elements: {
      "prompt-refinement": {
        type: "PromptRefinementChooser",
        props: {
          title: refinement.title,
          description: refinement.description,
          originalPrompt,
          options: refinement.options,
          allowOriginalPrompt,
          autoSelectSeconds,
        },
      },
    },
  };
}
