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

const DEFAULT_PROMPT_REFINEMENT_MODEL = "google/gemini-3-flash";

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
const SUPPORTED_QUERY_FILTERS = [
  "Category",
  "Family",
  "Type",
  "Level",
  "Material",
  "Keyword search",
];
const SUPPORTED_METRICS = ["count", "length", "area", "volume"];
const DATASET_TERMS = new Set(
  [...TOP_CATEGORIES, ...TOP_FAMILIES]
    .flatMap((value) => value.toLowerCase().split(/[^a-z0-9]+/))
    .filter(Boolean),
);

interface CategoryPromptProfile {
  categoryLabels: string[];
  familyHints?: string[];
  filterLabels: string[];
  metricLabels: string[];
  chartBreakdowns: string[];
  scheduleLabel: string;
  notes?: string[];
}

const CATEGORY_PROMPT_PROFILES: Record<string, CategoryPromptProfile> = {
  Walls: {
    categoryLabels: ["Walls"],
    familyHints: ["Curtain Wall", "Basic Wall"],
    filterLabels: [
      "Family",
      "Type",
      "Base Constraint",
      "Structural Material",
      "Keyword search",
    ],
    metricLabels: ["count", "length", "area", "volume"],
    chartBreakdowns: ["type", "base constraint", "material"],
    scheduleLabel: "wall schedule",
    notes: [
      "In the normalized query layer, Base Constraint is exposed through levels.",
      "Top Constraint exists in the data but is not yet exposed as a filter.",
    ],
  },
  Floors: {
    categoryLabels: ["Floors"],
    familyHints: ["Floor"],
    filterLabels: ["Family", "Type", "Material", "Keyword search"],
    metricLabels: ["count", "area", "volume"],
    chartBreakdowns: ["type", "material"],
    scheduleLabel: "floor schedule",
    notes: [
      "Do not mention a Level filter here yet. The raw data has Level, but the normalized query layer does not expose it for Floors.",
    ],
  },
  "Structural Framing": {
    categoryLabels: ["Structural Framing"],
    familyHints: ["K-Series Bar Joist-Angle Web", "W Shapes"],
    filterLabels: [
      "Family",
      "Type",
      "Reference Level",
      "Structural Material",
      "Keyword search",
    ],
    metricLabels: ["count", "volume"],
    chartBreakdowns: ["type", "reference level", "material"],
    scheduleLabel: "member schedule",
    notes: [
      "In the normalized query layer, Reference Level is exposed through levels.",
    ],
  },
  Ducts: {
    categoryLabels: ["Ducts"],
    familyHints: ["Round Duct", "Rectangular Duct"],
    filterLabels: ["Family", "Type", "Reference Level", "Keyword search"],
    metricLabels: ["count", "length"],
    chartBreakdowns: ["type", "reference level", "family"],
    scheduleLabel: "duct schedule",
    notes: [
      "In the normalized query layer, Reference Level is exposed through levels.",
      "Do not mention Material for Ducts in this showcase dataset.",
    ],
  },
  "Duct Fittings": {
    categoryLabels: ["Duct Fittings"],
    familyHints: ["Round Elbow", "Round Endcap", "Round Tee"],
    filterLabels: ["Family", "Type", "Keyword search"],
    metricLabels: ["count"],
    chartBreakdowns: ["family", "type"],
    scheduleLabel: "duct fitting schedule",
    notes: [
      "Do not mention Level or Material for Duct Fittings in this showcase dataset.",
    ],
  },
  Supports: {
    categoryLabels: ["Supports"],
    familyHints: ["Support - Steel Bar", "Stringer"],
    filterLabels: ["Family", "Type", "Material", "Keyword search"],
    metricLabels: ["count"],
    chartBreakdowns: ["family", "type", "material"],
    scheduleLabel: "support schedule",
    notes: [
      "Material coverage is partial for Supports, so use it as an optional breakdown rather than the only slicer.",
    ],
  },
  Windows: {
    categoryLabels: ["Windows"],
    familyHints: ["Window-Sliding-Double", "Window-Fixed"],
    filterLabels: ["Family", "Type", "Keyword search"],
    metricLabels: ["count"],
    chartBreakdowns: ["family", "type"],
    scheduleLabel: "window schedule",
    notes: [
      "Do not mention a Level filter here yet. The raw data has Level, but the normalized query layer does not expose it for Windows.",
    ],
  },
  Doors: {
    categoryLabels: ["Doors"],
    familyHints: ["Door-Passage-Single-Flush", "Door-Passage-Single-Two_Lite"],
    filterLabels: ["Family", "Type", "Keyword search"],
    metricLabels: ["count"],
    chartBreakdowns: ["family", "type"],
    scheduleLabel: "door schedule",
    notes: [
      "Do not mention a Level filter here yet. The raw data has Level, but the normalized query layer does not expose it for Doors.",
    ],
  },
  "Structural Foundations and Columns": {
    categoryLabels: [
      "Structural Foundations",
      "Columns",
      "Structural Columns",
    ],
    filterLabels: ["Category", "Type", "Material", "Keyword search"],
    metricLabels: ["count", "area", "volume"],
    chartBreakdowns: ["category", "type", "material"],
    scheduleLabel: "structural schedule",
    notes: [
      "Keep this slice broad and avoid promising Level filters unless the dataset is expanded.",
    ],
  },
};

const CATEGORY_PROMPT_GUIDE = Object.entries(CATEGORY_PROMPT_PROFILES).map(
  ([category, profile]) =>
    [
      `${category}: categories=${profile.categoryLabels.join(" / ")}`,
      `filters=${profile.filterLabels.join(", ")}`,
      `metrics=${profile.metricLabels.join(", ")}`,
      `breakdowns=${profile.chartBreakdowns.join(", ")}`,
      `schedule=${profile.scheduleLabel}`,
      profile.familyHints?.length
        ? `family hints=${profile.familyHints.join(", ")}`
        : null,
      ...(profile.notes ?? []).map((note) => `note=${note}`),
    ]
      .filter(Boolean)
      .join(" | "),
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
      "Build a Walls dashboard with Type, Base Constraint, Structural Material, and keyword search filters, wall count, length, area, and volume KPIs, charts by type and base constraint, and a full wall schedule",
    action: "generate",
    reason:
      "Already specific enough: dashboard intent, filters, KPIs, charts, and a detail table are all present.",
  },
  {
    prompt:
      "Create a Structural Framing dashboard with the Autodesk viewer, Reference Level and Structural Material filters, count and volume KPIs, charts by type and material, and a member schedule",
    action: "generate",
    reason:
      "Specific BIM dashboard prompt with clear visualization and data requirements.",
  },
];

const GENERATION_READY_PATTERNS = {
  dashboardIntent: /\b(dashboard|takeoff|estimate|estimating)\b/i,
  viewer: /\b(autodesk viewer|viewer|3d)\b/i,
  filters: /\b(filters?|slicers?|search|keyword search)\b/i,
  metrics: /\b(kpis?|metrics?|count|length|area|volume|quantity|quantities)\b/i,
  visuals: /\b(charts?|breakdowns?|grouped by|by type|by family|by level|by material|by category|by constraint)\b/i,
  detailTable: /\b(schedule|table|details?|rows?)\b/i,
};

const SUPPORTED_PROMPT_SUBJECTS = new Set(
  [
    ...TOP_CATEGORIES,
    ...TOP_FAMILIES,
    "autodesk",
    "showcase",
    "aps",
    "bim",
    "wall",
    "walls",
    "floor",
    "floors",
    "duct",
    "ducts",
    "fitting",
    "fittings",
    "support",
    "supports",
    "window",
    "windows",
    "door",
    "doors",
    "framing",
    "frame",
    "joist",
    "beam",
    "steel",
    "foundation",
    "foundations",
    "column",
    "columns",
  ]
    .flatMap((value) => value.toLowerCase().split(/[^a-z0-9]+/))
    .filter(Boolean),
);

function hasSupportedPromptSubject(prompt: string) {
  return prompt
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .some((token) => SUPPORTED_PROMPT_SUBJECTS.has(token));
}

function getGenerationReadyReason(prompt: string) {
  const wordCount = prompt.split(/\s+/).filter(Boolean).length;

  if (
    wordCount >= 14 &&
    hasSupportedPromptSubject(prompt) &&
    GENERATION_READY_PATTERNS.dashboardIntent.test(prompt) &&
    GENERATION_READY_PATTERNS.viewer.test(prompt) &&
    GENERATION_READY_PATTERNS.filters.test(prompt) &&
    GENERATION_READY_PATTERNS.metrics.test(prompt) &&
    GENERATION_READY_PATTERNS.visuals.test(prompt) &&
    GENERATION_READY_PATTERNS.detailTable.test(prompt)
  ) {
    return "Prompt already includes dashboard intent, BIM/showcase scope, viewer, filters, metrics, charts, and a schedule/table.";
  }

  return null;
}

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

  const generationReadyReason = getGenerationReadyReason(normalizedPrompt);
  if (generationReadyReason) {
    console.info("[prompt-refinement][assessment]", {
      prompt: normalizedPrompt,
      action: "generate",
      reason: generationReadyReason,
      optionCount: 0,
    });
    return {
      action: "generate",
      reason: generationReadyReason,
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
        "- Do not refine a prompt just because a filter label is generic or slightly different from the category guide when it already asks for viewer, filters, KPIs/metrics, charts, and a schedule/table.",
        "- When action is 'refine', provide 3 to 5 prompt options grounded in the showcase dataset.",
        "- When action is 'irrelevant', do not suggest a dashboard UI. Just explain briefly that this app is for APS showcase dashboards.",
        "- Use category-specific filter language from the guide below instead of forcing generic Level or Material filters everywhere.",
        "- Treat Keyword search as the free-text search box, not as a structured BIM property.",
        `Top categories: ${TOP_CATEGORIES.join(", ")}.`,
        `Top families: ${TOP_FAMILIES.join(", ")}.`,
        `Supported query filters: ${SUPPORTED_QUERY_FILTERS.join(", ")}.`,
        `Supported KPI quantities: ${SUPPORTED_METRICS.join(", ")}.`,
        `Dataset vocabulary hints: ${Array.from(DATASET_TERMS).slice(0, 60).join(", ")}.`,
        "Category guide:",
        ...CATEGORY_PROMPT_GUIDE,
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
  if (/\bsupport|stringer|hanger/.test(normalizedPrompt)) return "Supports";
  if (/\bframe|framing|beam|joist|steel/.test(normalizedPrompt)) {
    return "Structural Framing";
  }
  if (/\bfitting|elbow|endcap|tee/.test(normalizedPrompt)) {
    return "Duct Fittings";
  }
  if (/\bduct|hvac|mechanical/.test(normalizedPrompt)) {
    return "Ducts";
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
        label: "Walls by type and base constraint",
        prompt:
          "Build a Walls dashboard for the Autodesk showcase model with the Autodesk viewer, Family, Type, Base Constraint, Structural Material, and keyword search filters, wall count, length, area, and volume KPIs, charts by type and base constraint, and a full wall schedule",
        rationale:
          "Uses the exact Walls category with the filters and quantities the normalized dataset actually supports.",
      },
      {
        label: "Basic Wall focus",
        prompt:
          "Build a Basic Wall dashboard for the Autodesk showcase model with the Autodesk viewer, Family, Type, Base Constraint, Structural Material, and keyword search filters, wall count, length, area, and volume KPIs, charts by type and structural material, and a full Basic Wall schedule",
        rationale:
          "Narrows the request to the strongest wall family in the showcase dataset.",
      },
      {
        label: "Curtain Wall facade view",
        prompt:
          "Build a Curtain Wall dashboard for the Autodesk showcase model with the Autodesk viewer, Family, Type, Base Constraint, Structural Material, and keyword search filters, facade count, area, and volume KPIs, charts by type and base constraint, and a full curtain wall schedule",
        rationale:
          "Keeps the wall intent but pivots into the Curtain Wall family when a facade view is more useful.",
      },
    ],
    Floors: [
      {
        label: "Floors by type and material",
        prompt:
          "Build a Floors dashboard for the Autodesk showcase model with the Autodesk viewer, Family, Type, Material, and keyword search filters, floor count, area, and volume KPIs, charts by type and material, and a full floor schedule",
        rationale:
          "Uses the real Floors category without promising a Level filter that the normalized query layer does not expose yet.",
      },
      {
        label: "Floor family schedule",
        prompt:
          "Build a Floor family dashboard for the Autodesk showcase model with the Autodesk viewer, Family, Type, Material, and keyword search filters, floor count, area, and volume KPIs, charts by type and material, and a full floor schedule",
        rationale:
          "Focuses the dashboard on the Floor family for more predictable grouping and filtering.",
      },
      {
        label: "Floor material summary",
        prompt:
          "Build a Floors material dashboard for the Autodesk showcase model with the Autodesk viewer, Family, Type, Material, and keyword search filters, floor count, area, and volume KPIs, charts by material and type, and a full floor schedule",
        rationale:
          "Best when the user likely cares about quantities broken down by material.",
      },
    ],
    "Structural Framing": [
      {
        label: "Structural Framing by type and reference level",
        prompt:
          "Build a Structural Framing dashboard for the Autodesk showcase model with the Autodesk viewer, Family, Type, Reference Level, Structural Material, and keyword search filters, framing count and volume KPIs, charts by type and reference level, and a full member schedule",
        rationale:
          "Uses the real Structural Framing category with the filters and metrics that are strongest in the normalized dataset.",
      },
      {
        label: "W Shapes and joists",
        prompt:
          "Build a Structural Framing dashboard for the Autodesk showcase model focused on W Shapes and K-Series Bar Joist-Angle Web, with the Autodesk viewer, Family, Type, Reference Level, Structural Material, and keyword search filters, framing count and volume KPIs, charts by type and structural material, and a full member schedule",
        rationale:
          "Targets the strongest framing families in the dataset for richer charts and schedules.",
      },
      {
        label: "Framing by material",
        prompt:
          "Build a Structural Framing dashboard for the Autodesk showcase model with the Autodesk viewer, Family, Type, Reference Level, Structural Material, and keyword search filters, count and volume KPIs, charts by structural material and type, and a full member schedule",
        rationale:
          "Best when the request sounds material-driven but still needs the viewer and full schedule.",
      },
    ],
    Ducts: [
      {
        label: "Ducts by type and reference level",
        prompt:
          "Build a Ducts dashboard for the Autodesk showcase model with the Autodesk viewer, Family, Type, Reference Level, and keyword search filters, duct count and length KPIs, charts by family and reference level, and a full duct schedule",
        rationale:
          "Uses the real Ducts category with the supported Reference Level semantics and the strongest duct quantities.",
      },
      {
        label: "Round Duct focus",
        prompt:
          "Build a Round Duct dashboard for the Autodesk showcase model with the Autodesk viewer, Family, Type, Reference Level, and keyword search filters, duct count and length KPIs, charts by type and reference level, and a full duct schedule",
        rationale:
          "Narrows the request to the largest duct family for a cleaner first-time BIM dashboard.",
      },
      {
        label: "Mechanical overview without material",
        prompt:
          "Build a Ducts dashboard for the Autodesk showcase model with the Autodesk viewer, Family, Type, Reference Level, and keyword search filters, duct count and length KPIs, charts by type and family, and a full duct schedule",
        rationale:
          "Useful when the original prompt is broad mechanical language and needs a more concrete BIM scope without inventing unsupported material filters.",
      },
    ],
    "Duct Fittings": [
      {
        label: "Duct fittings by family",
        prompt:
          "Build a Duct Fittings dashboard for the Autodesk showcase model with the Autodesk viewer, Family, Type, and keyword search filters, fitting count KPIs, charts by family and type, and a full duct fitting schedule",
        rationale:
          "Keeps the request aligned with the actual Duct Fittings slice, which does not expose Level or Material filters in the normalized dataset.",
      },
      {
        label: "Round elbow focus",
        prompt:
          "Build a Round Elbow dashboard for the Autodesk showcase model with the Autodesk viewer, Family, Type, and keyword search filters, fitting count KPIs, charts by family and type, and a full duct fitting schedule",
        rationale:
          "Targets the dominant fitting family in the dataset for a cleaner first dashboard.",
      },
      {
        label: "Duct fittings schedule",
        prompt:
          "Build a Duct Fittings dashboard for the Autodesk showcase model with the Autodesk viewer, Family, Type, and keyword search filters, fitting count KPIs, charts by type and family, and a full duct fitting schedule",
        rationale:
          "Best when the user wants a fitting takeoff and needs stronger dashboard structure.",
      },
    ],
    Supports: [
      {
        label: "Supports by family",
        prompt:
          "Build a Supports dashboard for the Autodesk showcase model with the Autodesk viewer, Family, Type, Material, and keyword search filters, support count KPIs, charts by family and type, and a full support schedule",
        rationale:
          "Uses the actual Supports category and keeps Material optional instead of relying on it too heavily.",
      },
      {
        label: "Steel bar supports",
        prompt:
          "Build a Support - Steel Bar dashboard for the Autodesk showcase model with the Autodesk viewer, Family, Type, Material, and keyword search filters, support count KPIs, charts by family and material, and a full support schedule",
        rationale:
          "Anchors the prompt in the dominant Supports family in the dataset.",
      },
      {
        label: "Supports breakdown",
        prompt:
          "Build a Supports dashboard for the Autodesk showcase model with the Autodesk viewer, Family, Type, Material, and keyword search filters, support count KPIs, charts by type and family, and a full support schedule",
        rationale:
          "Works for generic support requests without over-promising level-based filtering.",
      },
    ],
    Windows: [
      {
        label: "Windows",
        prompt:
          "Build a Windows dashboard for the Autodesk showcase model focused on the Window-Sliding-Double family, with the Autodesk viewer, Family, Type, and keyword search filters, count KPIs, charts by family and type, and a full window schedule",
        rationale:
          "Uses the strongest window family in the dataset without promising a Level filter that the normalized query layer does not expose.",
      },
      {
        label: "Window type breakdown",
        prompt:
          "Build a Windows dashboard for the Autodesk showcase model with the Autodesk viewer, Family, Type, and keyword search filters, count KPIs, charts by type and family, and a full window schedule",
        rationale:
          "Best when the prompt sounds like a general window takeoff and needs stronger BIM terminology.",
      },
      {
        label: "Window schedule",
        prompt:
          "Build a Windows dashboard for the Autodesk showcase model with the Autodesk viewer, Family, Type, and keyword search filters, count KPIs, charts by family and type, and a full window schedule",
        rationale:
          "Keeps the request aligned with the filters the current Windows slice actually exposes.",
      },
    ],
    Doors: [
      {
        label: "Doors",
        prompt:
          "Build a Doors dashboard for the Autodesk showcase model focused on the Door-Passage-Single-Flush family, with the Autodesk viewer, Family, Type, and keyword search filters, count KPIs, charts by family and type, and a full door schedule",
        rationale:
          "Anchors the prompt in the strongest door family in the dataset.",
      },
      {
        label: "Door type breakdown",
        prompt:
          "Build a Doors dashboard for the Autodesk showcase model with the Autodesk viewer, Family, Type, and keyword search filters, count KPIs, charts by type and family, and a full door schedule",
        rationale:
          "Best for a generic door request that still needs the expected BIM dashboard structure.",
      },
      {
        label: "Door schedule",
        prompt:
          "Build a Doors dashboard for the Autodesk showcase model with the Autodesk viewer, Family, Type, and keyword search filters, count KPIs, charts by family and type, and a full door schedule",
        rationale:
          "Keeps the data scope deterministic without relying on missing Level normalization.",
      },
    ],
    "Structural Foundations and Columns": [
      {
        label: "Foundations and columns",
        prompt:
          "Build a Structural Foundations, Columns, and Structural Columns dashboard for the Autodesk showcase model with the Autodesk viewer, Category, Type, Material, and keyword search filters, count, area, and volume KPIs, charts by category and type, and a full structural schedule",
        rationale:
          "Uses the exact structural categories available in the showcase dataset.",
      },
      {
        label: "Structural Foundations",
        prompt:
          "Build a Structural Foundations dashboard for the Autodesk showcase model with the Autodesk viewer, Category, Type, Material, and keyword search filters, count, area, and volume KPIs, charts by type and material, and a full structural schedule",
        rationale:
          "Useful when the original prompt is about foundations and needs a narrower BIM slice.",
      },
      {
        label: "Columns and structural columns",
        prompt:
          "Build a Columns and Structural Columns dashboard for the Autodesk showcase model with the Autodesk viewer, Category, Type, Material, and keyword search filters, count, area, and volume KPIs, charts by type and category, and a full structural schedule",
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
        "Use category-specific filter language from the guide below instead of forcing generic Level or Material filters everywhere.",
        "Treat Keyword search as the free-text search box, not as a structured BIM property.",
        `Top categories: ${TOP_CATEGORIES.join(", ")}.`,
        `Top families: ${TOP_FAMILIES.join(", ")}.`,
        `Supported query filters: ${SUPPORTED_QUERY_FILTERS.join(", ")}.`,
        `Supported KPI quantities: ${SUPPORTED_METRICS.join(", ")}.`,
        "Category guide:",
        ...CATEGORY_PROMPT_GUIDE,
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
