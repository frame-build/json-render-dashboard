import { tool } from "ai";
import { z } from "zod";
import { queryShowcaseTakeoff } from "@/lib/aps/showcase-query";

export const queryShowcaseModel = tool({
  description:
    "Query the normalized Autodesk showcase model dataset for filtered quantities, category totals, facet values, schedules, and grouped summaries. Use this for viewer-first showcase dashboards built around real model data.",
  inputSchema: z.object({
    kinds: z
      .array(
        z.enum([
          "reference-level",
          "direct-instance",
          "instance",
          "subcomponent",
          "group",
        ]),
      )
      .nullable()
      .describe("Optional element kinds to include."),
    categories: z
      .array(z.string())
      .nullable()
      .describe("Optional model categories such as Walls, Floors, Doors, Windows."),
    families: z.array(z.string()).nullable().describe("Optional family filters."),
    types: z
      .array(z.string())
      .nullable()
      .describe("Optional type filters, often wall type names."),
    levels: z
      .array(z.string())
      .nullable()
      .describe("Optional level filters. Base Constraint values map to levels."),
    materials: z
      .array(z.string())
      .nullable()
      .describe("Optional structural/material filters."),
    activities: z
      .array(z.string())
      .nullable()
      .describe("Optional activity filters, such as Muros."),
    search: z
      .string()
      .nullable()
      .describe("Optional free-text search across normalized showcase fields."),
    rowLimit: z
      .number()
      .int()
      .min(1)
      .max(50)
      .nullable()
      .describe("How many rows to return. Defaults to 20."),
  }),
  execute: async ({
    kinds,
    categories,
    families,
    types,
    levels,
    materials,
    activities,
    search,
  }) => {
    return queryShowcaseTakeoff({
      kinds: kinds ?? undefined,
      categories: categories ?? undefined,
      families: families ?? undefined,
      types: types ?? undefined,
      levels: levels ?? undefined,
      materials: materials ?? undefined,
      activities: activities ?? undefined,
      search: search ?? undefined,
      groupLimit: 10,
      facetLimit: 100,
      maxDbIdsForIsolation: 200,
    });
  },
});
