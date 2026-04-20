import type { Spec } from "@json-render/react";
import { normalizeShowcaseDashboardSpec } from "@/lib/render/normalize-showcase-spec";
import { markSpecAsCanonicalShare } from "@/lib/render/share-spec-version";

export function deepCloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function prepareCanonicalShareSpec(spec: Spec): Spec {
  const cloned = deepCloneJson(spec);
  const normalized = normalizeShowcaseDashboardSpec(cloned) ?? cloned;
  return markSpecAsCanonicalShare(normalized);
}
