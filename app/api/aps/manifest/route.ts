import { getManifest } from "@/lib/aps/auth";
import { getApsUrnCandidates, normalizeApsUrn } from "@/lib/aps/urn";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const urn = normalizeApsUrn(url.searchParams.get("urn") ?? "");

  if (!urn) {
    return Response.json(
      {
        ok: false,
        error: "missing_urn",
        message: "Missing Autodesk model URN.",
      },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }

  try {
    const candidates = getApsUrnCandidates(urn);
    let lastError: string | null = null;

    for (const candidate of candidates) {
      try {
        const manifest = await getManifest(candidate);

        if (!manifest) {
          continue;
        }

        const status = manifest.status ?? "unknown";
        const progress = manifest.progress ?? null;
        const isReady = status === "success";

        return Response.json(
          {
            ok: isReady,
            urn: candidate,
            status,
            progress,
            hasThumbnail: manifest.hasThumbnail ?? null,
            message: isReady
              ? "Manifest is ready."
              : status === "inprogress" || status === "pending"
                ? `Model translation is not ready yet (${progress ?? status}).`
                : `Model manifest is not ready (${status}${progress ? `, ${progress}` : ""}).`,
          },
          { headers: { "Cache-Control": "no-store" } },
        );
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Unknown manifest error";
        lastError = message;

        if (!message.includes("requested manifest urn is invalid")) {
          throw error;
        }
      }
    }

    return Response.json(
      {
        ok: false,
        error: "manifest_not_found",
        urn,
        candidates,
        message:
          lastError ??
          "No APS derivative manifest was found for this URN. Confirm the showcase URN points to a translated model.",
      },
      { status: 404, headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to fetch Autodesk manifest.";

    return Response.json(
      {
        ok: false,
        error: "manifest_error",
        urn,
        message,
      },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
