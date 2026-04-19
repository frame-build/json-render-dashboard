import { z } from "zod";
import { createDashboardShare } from "@/lib/shares";

export const runtime = "nodejs";

const requestSchema = z.object({
  title: z.string().max(200).nullable().optional(),
  spec: z.unknown(),
  sourceMessageId: z.string().nullable().optional(),
  summaryText: z.string().max(4000).nullable().optional(),
});

export async function POST(req: Request) {
  try {
    const json = (await req.json()) as unknown;
    const parsed = requestSchema.parse(json);

    const serialized = JSON.stringify(parsed.spec);
    if (serialized.length > 2_000_000) {
      return Response.json(
        {
          error: "share_payload_too_large",
          message: "Dashboard spec is too large to share.",
        },
        { status: 413 },
      );
    }

    const share = await createDashboardShare({
      title: parsed.title,
      spec: parsed.spec,
      meta: {
        sourceMessageId: parsed.sourceMessageId ?? undefined,
        summaryText: parsed.summaryText ?? undefined,
      },
    });

    return Response.json(
      {
        id: share.id,
        title: share.title,
        createdAt: share.createdAt,
      },
      {
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
  } catch (error) {
    return Response.json(
      {
        error: "share_create_failed",
        message: error instanceof Error ? error.message : "Failed to create share.",
      },
      { status: 400 },
    );
  }
}
