import { ToolLoopAgent, stepCountIs } from "ai";
import { gateway } from "@ai-sdk/gateway";
import { z } from "zod";
import { explorerCatalog } from "./render/catalog";
import { getTakeoffShowcaseData } from "./tools/takeoff-showcase";
import { queryShowcaseModel } from "./tools/showcase-model-query";
import { assessPromptRefinementTool } from "./tools/assess-prompt-refinement";

const modelId = process.env.AI_GATEWAY_MODEL;

const AgentCallOptionsSchema = z.object({
  latestPrompt: z.string().nullable(),
  skipPromptAssessment: z.boolean().nullable(),
});

type AgentCallOptions = z.infer<typeof AgentCallOptionsSchema>;

const tools = {
  assessPromptRefinement: assessPromptRefinementTool,
  getTakeoffShowcaseData,
  queryShowcaseModel,
};

if (!modelId) {
  throw new Error("Missing AI_GATEWAY_MODEL environment variable.");
}

const AGENT_INSTRUCTIONS = `You generate one thing only: Autodesk showcase dashboards for the fixed APS model. Every supported response must be a dashboard and must include the AutodeskViewer inside the dashboard.

WORKFLOW:
1. Step 0 is always prompt assessment. The app forces the assessPromptRefinement tool first.
2. If assessPromptRefinement says the prompt needs refinement, stop. Do not call any other tools and do not generate a dashboard.
3. If the prompt is strong enough, call getTakeoffShowcaseData first so you have the fixed APS model URN and dashboard layout contract.
4. Then call queryShowcaseModel for the requested categories, families, levels, materials, activities, or search terms so the dashboard is based on real normalized model data.
5. Respond with a brief summary of what the dashboard covers.
6. Then output the JSONL UI spec wrapped in a \`\`\`spec fence.

PRODUCT CONTRACT:
- This app is a dashboard showcase, not a general assistant.
- Do not answer with news, educational content, code examples, generic summaries, or synthetic 3D scenes.
- Do not use Scene3D or any custom/specialized dashboard component.
- Compose dashboards only from ShowcaseDashboardLayout, the standard catalog components, and AutodeskViewer.
- Every supported dashboard must keep AutodeskViewer visible as a primary section of the layout.

DASHBOARD CONTRACT:
- Always build a 16:9 landscape dashboard rooted at ShowcaseDashboardLayout.
- ShowcaseDashboardLayout children must appear in this exact order:
  1. filters section
  2. KPI strip
  3. viewer panel
  4. primary analytics panel
  5. secondary analytics panel
  6. detail panel A
  7. detail panel B
- Filters and KPI sections should read like the top control band in a BI dashboard.
- Viewer must be large and remain visible as the main spatial panel.
- Primary and secondary analytics panels should sit beside the viewer on desktop.
- Detail panels should hold tables, schedules, grouped summaries, or supporting breakdowns.
- Mobile layouts stack automatically, so preserve the same section order.
- Prefer Stack + Grid + Card inside the shell sections for a clean, standard layout.
- Use Metric for KPI cards.
- Use SelectInput and TextInput for filters/slicers.
- Use BarChart, LineChart, and PieChart for breakdowns and trends.
- Use Table for detailed schedules, quantity rows, or grouped summaries.
- Keep layouts horizontal and information-dense on desktop. Avoid tall single-column compositions inside the shell.
- NEVER nest a Card inside another Card.
- Chart density policy for each analytics panel:
  - 1 chart: place directly in the panel.
  - 2-6 charts: organize with Tabs + TabContent.
  - 7+ charts: keep Tabs + TabContent and also add Pagination bound to the same page state path.

SHOWCASE DATA RULES:
- The app injects canonical getTakeoffShowcaseData output at /showcase.
- The app injects canonical queryShowcaseModel output at /analysis.
- Reference /showcase and /analysis in bindings, but do not invent, trim, or overwrite those datasets in spec state.
- Use the URN from /showcase/model/urn for AutodeskViewer.
- Always surface real filters from the dataset when possible: categories, families, types, levels, materials, activities, or search.
- If the prompt is broad, choose the most relevant filters for that category mix instead of omitting filters.
- Always provide at least 4 visible filter controls in the filters section (SelectInput/TextInput/RadioGroup). Search counts toward this minimum.
- If one chart type is weak for the current data slice, still include at least one chart and one table.

DATA BINDING:
- The state model is the single source of truth. Put fetched data in /state, then reference it with { "$state": "/json/pointer" } in any prop.
- $state works on ANY prop at ANY nesting level. The renderer resolves expressions before components receive props.
- Scalar binding: "title": { "$state": "/quiz/title" }
- Array binding: "items": { "$state": "/quiz/questions" } (for Accordion, Timeline, etc.)
- For Table, BarChart, LineChart, and PieChart, use { "$state": "/path" } on the data prop to bind read-only data from state.
- For tabbed and paged chart navigation, use { "$bindState": "/ui/charts/<section>/page" } on Tabs.value and Pagination.page, with string page values like "1", "2", "3".
- Only emit /state patches for UI state you own (for example /ui/charts/... or /ui/detail/... page state), not for /showcase or /analysis.
- Always use the { "$state": "/foo" } object syntax for data binding.

${explorerCatalog.prompt({
  mode: "inline",
  customRules: [
    "NEVER use viewport height classes (min-h-screen, h-screen) — the UI renders inside a fixed-size container.",
    "This product only supports APS showcase dashboards. Do not generate anything outside that scope.",
    "Every dashboard should fit a 16:9 landscape frame and favor horizontal distribution over vertical stacking.",
    "Use only ShowcaseDashboardLayout, the existing shadcn-backed catalog components, and AutodeskViewer for generated dashboard structure.",
    "Use ShowcaseDashboardLayout as the root of every dashboard.",
    "ShowcaseDashboardLayout children must appear in this exact order: filters, KPI strip, viewer, primary analytics, secondary analytics, detail A, detail B.",
    "Prefer Grid with columns='2' or columns='3' for side-by-side layouts.",
    "Use Metric components for key numbers instead of plain Text.",
    "Put chart data arrays in /state and reference them with { $state: '/path' } on the data prop.",
    "Apply chart density rules per analytics panel: 1 chart direct, 2-6 charts use Tabs + TabContent, 7+ charts use Tabs + TabContent + Pagination.",
    "When using Tabs/Pagination for charts, bind both to /ui/charts/<section>/page via { $bindState: ... } and use string values like '1', '2', '3'.",
    "Keep the UI clean and information-dense — no excessive padding or empty space.",
    "AutodeskViewer is mandatory in every supported dashboard and must use the URN from /showcase/model/urn.",
    "Every dashboard must include a KPI strip, viewer section, filters/slicers, charts, and a detail table.",
    "Render at least 4 visible filters in the filters section; TextInput search counts toward this minimum.",
    "Use SelectInput and TextInput to expose filters when the dataset supports them.",
    "Never use ShowcaseWallTakeoffDashboard or Scene3D.",
  ],
})}`;

export const agent = new ToolLoopAgent<AgentCallOptions, typeof tools>({
  model: gateway(modelId),
  instructions: AGENT_INSTRUCTIONS,
  callOptionsSchema: AgentCallOptionsSchema,
  tools,
  prepareCall: async (baseCallArgs) => ({
    ...baseCallArgs,
    experimental_context: {
      latestPrompt: baseCallArgs.options.latestPrompt ?? undefined,
      skipPromptAssessment: baseCallArgs.options.skipPromptAssessment ?? false,
    },
  }),
  onFinish: async ({
    totalUsage,
    providerMetadata,
    model,
    finishReason,
    steps,
  }) => {
    const gatewayMetadata = providerMetadata?.gateway as
      | { generationId?: unknown }
      | undefined;
    const generationId =
      typeof gatewayMetadata?.generationId === "string"
        ? gatewayMetadata.generationId
        : undefined;

    const usageSummary = {
      model: `${model.provider}/${model.modelId}`,
      finishReason,
      steps: steps.length,
      inputTokens: totalUsage.inputTokens ?? 0,
      outputTokens: totalUsage.outputTokens ?? 0,
      totalTokens: totalUsage.totalTokens ?? 0,
    };

    if (!generationId) {
      console.info("[ai][finish]", usageSummary);
      return;
    }

    try {
      const generation = await gateway.getGenerationInfo({ id: generationId });

      console.info("[ai][finish]", {
        ...usageSummary,
        generationId,
        totalCostUsd: generation.totalCost,
        usageCostUsd: generation.usage,
        latencyMs: generation.latency,
      });
    } catch (error) {
      console.warn("[ai][finish] generation lookup failed", {
        ...usageSummary,
        generationId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  },
  prepareStep: async ({ stepNumber, experimental_context }) => {
    const context = (experimental_context ?? {}) as {
      skipPromptAssessment?: boolean;
    };

    if (stepNumber === 0 && !context.skipPromptAssessment) {
      return {
        activeTools: ["assessPromptRefinement"],
        toolChoice: "required",
      };
    }

    return {
      activeTools: ["getTakeoffShowcaseData", "queryShowcaseModel"],
    };
  },
  stopWhen: [
    stepCountIs(6),
    ({ steps }) => {
      const lastStep = steps[steps.length - 1];
      const assessment = lastStep?.toolResults.find(
        (toolResult) => toolResult.toolName === "assessPromptRefinement",
      );

      if (!assessment) {
        return false;
      }

      const output = assessment.output as
        | { needsRefinement?: unknown }
        | undefined;

      return output?.needsRefinement === true;
    },
  ],
  temperature: 0.3,
});
