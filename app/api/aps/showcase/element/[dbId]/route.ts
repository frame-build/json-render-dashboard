import { getShowcaseElementByDbId } from "@/lib/aps/showcase-dataset";

export const runtime = "nodejs";

export async function GET(
  _req: Request,
  context: { params: Promise<{ dbId: string }> },
) {
  const { dbId } = await context.params;
  const parsedDbId = Number(dbId);

  if (!Number.isInteger(parsedDbId)) {
    return Response.json(
      {
        error: "invalid_dbid",
        message: "dbId must be an integer.",
      },
      { status: 400 },
    );
  }

  const element = await getShowcaseElementByDbId(parsedDbId);

  if (!element) {
    return Response.json(
      {
        error: "not_found",
        message: `No showcase element found for dbId ${parsedDbId}.`,
      },
      { status: 404 },
    );
  }

  return Response.json(element, {
    headers: {
      "Cache-Control": "no-store",
    },
  });
}
