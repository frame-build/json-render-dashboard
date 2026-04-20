import { agent } from "@/lib/agent";
import {
  assessPromptRefinement,
  buildPromptRefinementSpec,
  getLatestUserPrompt,
  getPromptRefinementSelection,
  type PromptRefinementAssessment,
} from "@/lib/chat/prompt-refinement";
import {
  CHAT_STATUS_DATA_PART_TYPE,
  SPEC_DATA_PART_TYPE,
  SHOWCASE_CONTEXT_DATA_PART_TYPE,
  type AppMessage,
} from "@/lib/chat/types";
import { minuteRateLimit, dailyRateLimit } from "@/lib/rate-limit";
import {
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
} from "ai";
import { pipeJsonRender } from "@json-render/core";
import { headers } from "next/headers";
import { getTakeoffShowcasePayload } from "@/lib/tools/takeoff-showcase";

export const maxDuration = 60;

export async function POST(req: Request) {
  const headersList = await headers();
  const ip = headersList.get("x-forwarded-for")?.split(",")[0] ?? "anonymous";

  const [minuteResult, dailyResult] = await Promise.all([
    minuteRateLimit.limit(ip),
    dailyRateLimit.limit(ip),
  ]);

  if (!minuteResult.success || !dailyResult.success) {
    const isMinuteLimit = !minuteResult.success;
    return new Response(
      JSON.stringify({
        error: "Rate limit exceeded",
        message: isMinuteLimit
          ? "Too many requests. Please wait a moment before trying again."
          : "Daily limit reached. Please try again tomorrow.",
      }),
      {
        status: 429,
        headers: { "Content-Type": "application/json" },
      },
    );
  }

  const body = await req.json();
  const uiMessages: AppMessage[] = body.messages;

  if (!uiMessages || !Array.isArray(uiMessages) || uiMessages.length === 0) {
    return new Response(
      JSON.stringify({ error: "messages array is required" }),
      {
        status: 400,
        headers: { "Content-Type": "application/json" },
      },
    );
  }

  const lastUserMessage = [...uiMessages]
    .reverse()
    .find((message) => message.role === "user");
  const latestPrompt = getLatestUserPrompt(uiMessages);
  const refinementSelection = getPromptRefinementSelection(lastUserMessage);

  console.info("[prompt-refinement][route] request", {
    latestPrompt,
    hasRefinementSelection: Boolean(refinementSelection),
  });

  const stream = createUIMessageStream<AppMessage>({
    execute: async ({ writer }) => {
      writer.write({ type: "start" });

      let assessment: PromptRefinementAssessment | null = null;

      if (!refinementSelection) {
        writer.write({
          type: CHAT_STATUS_DATA_PART_TYPE,
          data: {
            phase: "prompt-assessment",
            message: "Checking prompt...",
          },
          transient: true,
        });

        assessment = await assessPromptRefinement(latestPrompt);
        console.info("[prompt-refinement][route] assessment-result", {
          latestPrompt,
          action: assessment.action,
          reason: assessment.reason,
          hasRefinementPayload: Boolean(assessment.refinement),
        });

        const textId = "prompt-refinement";

        if (assessment.action === "irrelevant") {
          writer.write({ type: "text-start", id: textId });
          writer.write({
            type: "text-delta",
            id: textId,
            delta:
              "This app is focused on APS showcase dashboards. Try a BIM prompt like 'Build a Walls dashboard with the Autodesk viewer, filters, KPIs, charts, and a schedule.'",
          });
          writer.write({ type: "text-end", id: textId });
          return;
        }

        if (assessment.action === "refine" && assessment.refinement) {
          const spec = buildPromptRefinementSpec(
            assessment.refinement,
            latestPrompt,
            true,
          );
          console.info("[prompt-refinement][route] writing-selector", {
            latestPrompt,
            action: assessment.action,
            optionCount: assessment.refinement.options.length,
          });
          writer.write({ type: "text-start", id: textId });
          writer.write({
            type: "text-delta",
            id: textId,
            delta:
              "This prompt is a bit underspecified for the BIM dashboard workflow. Choose one of these stronger options or continue with your original prompt.",
          });
          writer.write({ type: "text-end", id: textId });
          writer.write({
            type: SPEC_DATA_PART_TYPE,
            data: {
              type: "flat",
              spec,
            },
          });
          return;
        }
      }

      writer.write({
        type: CHAT_STATUS_DATA_PART_TYPE,
        data: {
          phase: "dashboard-generation",
          message: "Building dashboard...",
        },
        transient: true,
      });

      const showcasePayload = getTakeoffShowcasePayload();
      if ("error" in showcasePayload) {
        const errorId = "showcase-context-error";
        writer.write({ type: "text-start", id: errorId });
        writer.write({
          type: "text-delta",
          id: errorId,
          delta: showcasePayload.error,
        });
        writer.write({ type: "text-end", id: errorId });
        return;
      }

      writer.write({
        type: SHOWCASE_CONTEXT_DATA_PART_TYPE,
        data: showcasePayload,
      });

      const modelMessages = await convertToModelMessages(uiMessages);
      const result = await agent.stream({
        messages: modelMessages,
        options: {
          showcaseContext: JSON.stringify(showcasePayload),
        },
        onStepFinish: async (step) => {
          console.info("[dashboard-generation][route] step-finish", {
            stepNumber: step.stepNumber,
            toolNames: step.toolResults.map((toolResult) => toolResult.toolName),
            finishReason: step.finishReason,
          });
        },
      });

      writer.merge(
        pipeJsonRender(
          result.toUIMessageStream({
            sendStart: false,
          }),
        ),
      );
    },
  });

  return createUIMessageStreamResponse({ stream });
}
