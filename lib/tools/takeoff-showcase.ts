import { tool } from "ai";
import { z } from "zod";
import { getApsShowcaseUrn } from "@/lib/aps/auth";

export const getTakeoffShowcaseData = tool({
  description:
    "Get the Autodesk showcase dashboard configuration for the fixed APS model, including the APS model URN, dashboard layout contract, and starter context for quantity and package-review dashboards.",
  inputSchema: z.object({
    focus: z
      .string()
      .nullable()
      .describe(
        "Optional focus area such as estimating, takeoffs, quantities, packages, or executive summary.",
      ),
  }),
  execute: async ({ focus }) => {
    const urn = getApsShowcaseUrn();

    if (!urn) {
      return {
        error:
          "APS_SHOWCASE_URN is not configured on the server. Add it to .env.local before requesting the showcase.",
      };
    }

    return {
      showcase: {
        name: "APS Dashboard Showcase",
        focus: focus ?? "general",
        note: "Single-model showcase for viewer-first dashboard generation.",
      },
      model: {
        urn,
        viewerType: "AutodeskViewer",
        tokenEndpoint: "/api/aps/token",
      },
      layoutContract: {
        viewerRequired: true,
        requiredSections: [
          "KPI strip",
          "Autodesk viewer",
          "Filters and slicers",
          "Charts",
          "Detailed table",
        ],
        preferredLayout: "Horizontal dashboard with viewer pinned near the top",
      },
      summary: {
        projectName: "Construction Showcase Demo",
        estimatePhase: "Dashboard showcase",
        modelStatus: "Viewer-ready fixed URN",
        dataStatus: "Normalized quantity and metadata snapshot",
      },
      highlights: [
        { label: "Model Source", value: "Autodesk Platform Services" },
        { label: "Use Case", value: "Viewer-first estimating dashboards" },
        { label: "Viewer", value: "Embedded Autodesk Viewer" },
      ],
      supportedDashboards: [
        {
          mode: "Walls",
          emphasis: "Wall quantities, type filters, material filters, and level breakdowns",
        },
        {
          mode: "Floors",
          emphasis: "Area-focused dashboards with level and type filters",
        },
        {
          mode: "Structural framing",
          emphasis: "Framing counts, quantities, materials, and member breakdowns",
        },
        {
          mode: "Ductwork",
          emphasis: "MEP quantity dashboards with family and category slices",
        },
        {
          mode: "Windows and doors",
          emphasis: "Schedule-style dashboards with family/type breakdowns",
        },
        {
          mode: "Foundations and columns",
          emphasis: "Structural category summaries and quantity breakdowns",
        },
        {
          mode: "Package review",
          emphasis: "Cross-category dashboards for walls, floors, and framing",
        },
      ],
      tradeBreakdown: [
        { trade: "Structural", amount: 320000 },
        { trade: "Envelope", amount: 210000 },
        { trade: "Interiors", amount: 185000 },
        { trade: "MEP", amount: 275000 },
      ],
      takeoffCategories: [
        { category: "Concrete", quantity: 1240, unit: "CY" },
        { category: "Curtain Wall", quantity: 18400, unit: "SF" },
        { category: "Stud Walls", quantity: 9600, unit: "LF" },
      ],
      estimatePackages: [
        {
          package: "Core & Shell",
          status: "review",
          owner: "Preconstruction",
        },
        {
          package: "Interiors",
          status: "draft",
          owner: "Estimating",
        },
        {
          package: "MEP Coordination",
          status: "review",
          owner: "VDC",
        },
      ],
    };
  },
});
