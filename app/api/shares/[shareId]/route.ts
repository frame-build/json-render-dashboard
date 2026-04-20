import { z } from "zod";
import { getDashboardShare, updateDashboardShare } from "@/lib/shares";
import type { Spec } from "@json-render/react";

export const runtime = "nodejs";

const updateSchema = z.object({
  spec: z.unknown(),
  title: z.string().max(200).nullable().optional(),
});

export async function GET(
  _req: Request,
  context: { params: Promise<{ shareId: string }> },
) {
  const { shareId } = await context.params;
  const share = await getDashboardShare(shareId);

  if (!share) {
    return Response.json(
      {
        error: "share_not_found",
        message: "Shared dashboard was not found.",
      },
      { status: 404 },
    );
  }

  return Response.json(share, {
    headers: {
      "Cache-Control": "no-store",
    },
  });
}

export async function PUT(
  req: Request,
  context: { params: Promise<{ shareId: string }> },
) {
  try {
    const { shareId } = await context.params;
    const json = (await req.json()) as unknown;
    const parsed = updateSchema.parse(json);

    const serialized = JSON.stringify(parsed.spec);
    if (serialized.length > 2_000_000) {
      return Response.json(
        {
          error: "share_payload_too_large",
          message: "Dashboard spec is too large to save.",
        },
        { status: 413 },
      );
    }

    const share = await updateDashboardShare({
      shareId,
      spec: parsed.spec as Spec,
      title: parsed.title,
    });

    if (!share) {
      return Response.json(
        {
          error: "share_not_found",
          message: "Shared dashboard was not found.",
        },
        { status: 404 },
      );
    }

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
        error: "share_update_failed",
        message: error instanceof Error ? error.message : "Failed to update shared dashboard.",
      },
      { status: 400 },
    );
  }
}
