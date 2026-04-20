import type { Spec } from "@json-render/react";

type JsonRecord = Record<string, unknown>;

export const SHARE_SPEC_VERSION = 1;

function isJsonRecord(value: unknown): value is JsonRecord {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

export function getShareSpecVersion(spec: Spec | null | undefined): number | null {
  if (!spec || !isJsonRecord(spec.state)) {
    return null;
  }

  const marker = spec.state.__share;
  if (!isJsonRecord(marker)) {
    return null;
  }

  return typeof marker.specVersion === "number" ? marker.specVersion : null;
}

export function markSpecAsCanonicalShare(spec: Spec): Spec {
  const state = isJsonRecord(spec.state) ? spec.state : {};

  return {
    ...spec,
    state: {
      ...state,
      __share: {
        specVersion: SHARE_SPEC_VERSION,
      },
    },
  };
}
