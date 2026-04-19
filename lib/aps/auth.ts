import { normalizeApsUrn } from "@/lib/aps/urn";

const APS_TOKEN_URL = "https://developer.api.autodesk.com/authentication/v2/token";
const VIEWER_SCOPE = "viewables:read";
const MANIFEST_SCOPE = "viewables:read data:read";

type ApsTokenResponse = {
  access_token: string;
  token_type: string;
  expires_in: number;
};

type ApsManifestResponse = {
  status?: string;
  progress?: string;
  type?: string;
  hasThumbnail?: "true" | "false";
  derivatives?: unknown[];
};

type CachedViewerToken = {
  expiresAt: number;
  payload: ApsTokenResponse;
};

let cachedViewerToken: CachedViewerToken | null = null;

function getRequiredEnv(name: "APS_CLIENT_ID" | "APS_CLIENT_SECRET") {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export function getApsShowcaseUrn() {
  return normalizeApsUrn(process.env.APS_SHOWCASE_URN ?? "");
}

async function requestApsToken(scope: string): Promise<ApsTokenResponse> {
  const now = Date.now();
  if (scope === VIEWER_SCOPE && cachedViewerToken && cachedViewerToken.expiresAt > now + 60_000) {
    return cachedViewerToken.payload;
  }

  const clientId = getRequiredEnv("APS_CLIENT_ID");
  const clientSecret = getRequiredEnv("APS_CLIENT_SECRET");
  const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString(
    "base64",
  );

  const response = await fetch(APS_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
      Authorization: `Basic ${basicAuth}`,
    },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      scope,
    }),
    cache: "no-store",
  });

  if (!response.ok) {
    const details = await response.text();
    throw new Error(
      `APS token request failed (${response.status} ${response.statusText}): ${details}`,
    );
  }

  const payload = (await response.json()) as ApsTokenResponse;

  if (!payload.access_token || typeof payload.expires_in !== "number") {
    throw new Error("APS token response was missing required fields.");
  }

  if (scope === VIEWER_SCOPE) {
    cachedViewerToken = {
      payload,
      expiresAt: now + payload.expires_in * 1000,
    };
  }

  return payload;
}

export async function getViewerToken(): Promise<ApsTokenResponse> {
  return requestApsToken(VIEWER_SCOPE);
}

export async function getManifest(urn: string): Promise<ApsManifestResponse | null> {
  const normalizedUrn = normalizeApsUrn(urn);

  if (!normalizedUrn) {
    throw new Error("Missing APS URN for manifest lookup.");
  }

  const token = await requestApsToken(MANIFEST_SCOPE);
  const response = await fetch(
    `https://developer.api.autodesk.com/modelderivative/v2/designdata/${encodeURIComponent(
      normalizedUrn,
    )}/manifest`,
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token.access_token}`,
        Accept: "application/json",
      },
      cache: "no-store",
    },
  );

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    const details = await response.text();
    throw new Error(
      `APS manifest request failed (${response.status} ${response.statusText}): ${details}`,
    );
  }

  return (await response.json()) as ApsManifestResponse;
}
