import { getViewerToken } from "@/lib/aps/auth";

export const runtime = "nodejs";

export async function GET() {
  try {
    const token = await getViewerToken();

    return Response.json(token, {
      headers: {
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to generate Autodesk viewer token.";

    return Response.json(
      {
        error: "aps_token_error",
        message,
      },
      {
        status: 500,
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
  }
}
