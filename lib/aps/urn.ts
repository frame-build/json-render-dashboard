function encodeUrn(value: string) {
  if (typeof window === "undefined") {
    return Buffer.from(value, "utf8").toString("base64").replace(/=/g, "");
  }

  return window.btoa(value).replace(/=/g, "");
}

function encodeUrnUrlSafe(value: string) {
  return encodeUrn(value).replace(/\+/g, "-").replace(/\//g, "_");
}

function tryDecodeBase64(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");

  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(normalized)) {
    return null;
  }

  try {
    const padded =
      normalized + "=".repeat((4 - (normalized.length % 4 || 4)) % 4);
    const decoded =
      typeof window === "undefined"
        ? Buffer.from(padded, "base64").toString("utf8")
        : window.atob(padded);
    const reencoded = encodeUrn(decoded);

    if (
      reencoded !== normalized.replace(/=/g, "") &&
      encodeUrnUrlSafe(decoded) !== value.replace(/=/g, "")
    ) {
      return null;
    }

    return decoded;
  } catch {
    return null;
  }
}

function asTrimmedString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export function normalizeApsUrn(value: string | null | undefined) {
  const trimmed = asTrimmedString(value);

  if (!trimmed) {
    return "";
  }

  const decoded = tryDecodeBase64(trimmed);
  if (decoded) {
    return trimmed.replace(/=/g, "");
  }

  const rawValue = trimmed;
  const withoutPrefix = rawValue.startsWith("urn:")
    ? rawValue.slice(4)
    : rawValue;

  if (
    withoutPrefix.includes("adsk.objects:") ||
    withoutPrefix.includes("os.object:")
  ) {
    return encodeUrn(withoutPrefix);
  }

  return trimmed.replace(/^urn:/, "").replace(/=/g, "");
}

export function getApsUrnCandidates(value: string | null | undefined) {
  const trimmed = asTrimmedString(value);

  if (!trimmed) {
    return [];
  }

  const decoded = tryDecodeBase64(trimmed);
  const rawValue = decoded ?? trimmed;
  const rawWithoutPrefix = rawValue.replace(/^urn:/, "");
  const rawWithPrefix = rawValue.startsWith("urn:")
    ? rawValue
    : `urn:${rawValue}`;

  const candidates = [
    trimmed.replace(/=/g, ""),
    trimmed.replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_"),
    encodeUrn(rawWithoutPrefix),
    encodeUrnUrlSafe(rawWithoutPrefix),
    encodeUrn(rawWithPrefix),
    encodeUrnUrlSafe(rawWithPrefix),
  ];

  return [...new Set(candidates.filter(Boolean))];
}
