import { z } from "zod";
import { queryShowcaseTakeoff } from "@/lib/aps/showcase-query";

export const runtime = "nodejs";

const requestSchema = z.object({
  kinds: z
    .array(z.enum(["reference-level", "direct-instance", "instance", "subcomponent", "group"]))
    .optional(),
  categories: z.array(z.string()).optional(),
  families: z.array(z.string()).optional(),
  types: z.array(z.string()).optional(),
  levels: z.array(z.string()).optional(),
  materials: z.array(z.string()).optional(),
  activities: z.array(z.string()).optional(),
  search: z.string().optional(),
  rowLimit: z.number().int().min(1).max(200).optional(),
  groupLimit: z.number().int().min(1).max(30).optional(),
  facetLimit: z.number().int().min(1).max(500).optional(),
  maxDbIdsForIsolation: z.number().int().min(1).max(10000).optional(),
});

export async function POST(req: Request) {
  try {
    const json = (await req.json()) as unknown;
    const input = requestSchema.parse(json);
    const result = await queryShowcaseTakeoff(input);

    return Response.json(result, {
      headers: {
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid request.";

    return Response.json(
      {
        error: "showcase_query_error",
        message,
      },
      {
        status: 400,
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
  }
}
