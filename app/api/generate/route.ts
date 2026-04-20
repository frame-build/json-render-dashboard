import { agent } from "@/lib/agent";
import {
  buildPromptRefinementSpec,
  getLatestUserPrompt,
  getPromptRefinementSelection,
  type PromptRefinementAssessment,
} from "@/lib/chat/prompt-refinement";
import {
  SPEC_DATA_PART_TYPE,
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

  const modelMessages = await convertToModelMessages(uiMessages);
  const stream = createUIMessageStream({
    execute: async ({ writer }) => {
      writer.write({ type: "start" });

      let refinementWritten = false;
      const result = await agent.stream({
        messages: modelMessages,
        options: {
          latestPrompt,
          skipPromptAssessment: Boolean(refinementSelection),
        },
        onStepFinish: async (step) => {
          console.info("[prompt-refinement][route] step-finish", {
            stepNumber: step.stepNumber,
            toolNames: step.toolResults.map((toolResult) => toolResult.toolName),
            finishReason: step.finishReason,
          });

          if (refinementWritten) {
            return;
          }

          const assessment = step.toolResults.find(
            (toolResult) => toolResult.toolName === "assessPromptRefinement",
          );

          if (!assessment) {
            return;
          }

          const output = assessment.output as PromptRefinementAssessment | undefined;
          console.info("[prompt-refinement][route] assessment-result", {
            latestPrompt,
            action: output?.action ?? null,
            reason: output?.reason ?? null,
            hasRefinementPayload: Boolean(output?.refinement),
          });
          if (output?.action === "generate") {
            return;
          }

          const textId = "prompt-refinement";

          if (output?.action === "irrelevant") {
            writer.write({ type: "text-start", id: textId });
            writer.write({
              type: "text-delta",
              id: textId,
              delta:
                "This app is focused on APS showcase dashboards. Try a BIM prompt like 'Build a Walls dashboard with the Autodesk viewer, filters, KPIs, charts, and a schedule.'",
            });
            writer.write({ type: "text-end", id: textId });
            refinementWritten = true;
            return;
          }

          if (!output?.refinement) {
            return;
          }

          const spec = buildPromptRefinementSpec(
            output.refinement,
            latestPrompt,
            true,
          );
          console.info("[prompt-refinement][route] writing-selector", {
            latestPrompt,
            action: output.action,
            optionCount: output.refinement.options.length,
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
          refinementWritten = true;
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
