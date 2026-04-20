import type { Spec } from "@json-render/core";

interface ToolPartLike {
  type: string;
  state?: string;
  output?: unknown;
  data?: unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function extractCanonicalShowcaseState(parts: ToolPartLike[]) {
  let showcase: unknown;
  let analysis: unknown;

  for (const part of parts) {
    if (part.type === "data-showcaseContext" && part.data !== undefined) {
      showcase = part.data;
      continue;
    }

    if (!part.type.startsWith("tool-") || part.state !== "output-available") {
      continue;
    }

    const toolName = part.type.replace(/^tool-/, "");
    if (toolName === "getTakeoffShowcaseData") {
      showcase = part.output;
    } else if (toolName === "queryShowcaseModel") {
      analysis = part.output;
    }
  }

  return { showcase, analysis };
}

export function mergeShowcaseToolStateIntoSpec(
  spec: Spec | null,
  parts: ToolPartLike[],
): Spec | null {
  if (!spec) {
    return null;
  }

  const { showcase, analysis } = extractCanonicalShowcaseState(parts);
  if (showcase === undefined && analysis === undefined) {
    return spec;
  }

  const currentState = isRecord(spec.state) ? spec.state : {};
  return {
    ...spec,
    state: {
      ...currentState,
      ...(showcase !== undefined ? { showcase } : {}),
      ...(analysis !== undefined ? { analysis } : {}),
    },
  };
}
