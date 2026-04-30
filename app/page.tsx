"use client";

import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import {
  SPEC_DATA_PART_TYPE,
} from "@json-render/core";
import { useJsonRenderMessage } from "@json-render/react";
import { DashboardSpecRenderer } from "@/lib/render/renderer";
import { mergeShowcaseToolStateIntoSpec } from "@/lib/render/merge-showcase-tool-state";
import { APP_DISPLAY_NAME } from "@/lib/dashboard-naming";
import { ThemeToggle } from "@/components/theme-toggle";
import {
  CHAT_STATUS_DATA_PART_TYPE,
  PROMPT_REFINEMENT_DATA_PART_TYPE,
  type AppMessage,
  type ChatStatusData,
  type PromptRefinementSelection,
} from "@/lib/chat/types";
import {
  ArrowDown,
  ArrowUp,
  ChevronRight,
  ExternalLink,
  Loader2,
  Share2,
  Sparkles,
} from "lucide-react";
import { Streamdown } from "streamdown";
import { code } from "@streamdown/code";
import { toast } from "sonner";

// =============================================================================
// Transport
// =============================================================================

const transport = new DefaultChatTransport({ api: "/api/generate" });

// =============================================================================
// Suggestions (shown in empty state)
// =============================================================================

const SUGGESTIONS = [
  {
    label: "Basic Wall",
    prompt:
      "Build a Basic Wall dashboard for the Autodesk showcase model with the Autodesk viewer, Family, Type, Base Constraint, Structural Material, and keyword search filters, wall count, length, area, and volume KPIs, charts by type and base constraint, and a full Basic Wall schedule",
  },
  {
    label: "Curtain Wall",
    prompt:
      "Build a Curtain Wall dashboard for the Autodesk showcase model with the Autodesk viewer, Family, Type, Base Constraint, Structural Material, and keyword search filters, facade count, area, and volume KPIs, charts by type and base constraint, and a full curtain wall schedule",
  },
  {
    label: "Round Duct",
    prompt:
      "Build a Round Duct dashboard for the Autodesk showcase model with the Autodesk viewer, Family, Type, Reference Level, and keyword search filters, duct count and length KPIs, charts by type and reference level, and a full Round Duct schedule",
  },
  {
    label: "Duct Fittings",
    prompt:
      "Build a Duct Fittings dashboard for the Autodesk showcase model focused on the Round Elbow family and Tees types, with the Autodesk viewer, Family, Type, and keyword search filters, fitting count KPIs, charts by family and type, and a full duct fittings schedule",
  },
  {
    label: "Structural Framing",
    prompt:
      "Build a Structural Framing dashboard for the Autodesk showcase model with the Autodesk viewer, Family, Type, Reference Level, Structural Material, and keyword search filters, framing count and volume KPIs, charts for W Shapes and K-Series Bar Joist-Angle Web members by type and reference level, and a full member schedule",
  },
  {
    label: "Support - Steel Bar",
    prompt:
      "Build a Supports dashboard for the Autodesk showcase model focused on the Support - Steel Bar family, with the Autodesk viewer, Family, Type, Material, and keyword search filters, support count KPIs, charts by family and material, and a full support schedule",
  },
  {
    label: "Floors",
    prompt:
      "Build a Floors dashboard for the Autodesk showcase model with the Autodesk viewer, Family, Type, Material, and keyword search filters, floor count, area, and volume KPIs, charts by type and material, and a full floor schedule",
  },
  {
    label: "Windows",
    prompt:
      "Build a Windows dashboard for the Autodesk showcase model focused on the Window-Sliding-Double family, with the Autodesk viewer, Family, Type, and keyword search filters, count KPIs, charts by family and type, and a full window schedule",
  },
  {
    label: "Doors",
    prompt:
      "Build a Doors dashboard for the Autodesk showcase model focused on the Door-Passage-Single-Flush family, with the Autodesk viewer, Family, Type, and keyword search filters, count KPIs, charts by family and type, and a full door schedule",
  },
];

// =============================================================================
// Tool Call Display
// =============================================================================

/** Readable labels for tool names: [loading, done] */
const TOOL_LABELS: Record<string, [string, string]> = {
  queryShowcaseModel: [
    "Querying showcase model data",
    "Queried showcase model data",
  ],
};

const HIDDEN_TOOL_NAMES = new Set(["assessPromptRefinement"]);

function ToolCallDisplay({
  toolName,
  state,
  result,
}: {
  toolName: string;
  state: string;
  result: unknown;
}) {
  const [expanded, setExpanded] = useState(false);
  const isLoading =
    state !== "output-available" &&
    state !== "output-error" &&
    state !== "output-denied";
  const labels = TOOL_LABELS[toolName];
  const label = labels ? (isLoading ? labels[0] : labels[1]) : toolName;

  return (
    <div className="text-sm group">
      <button
        type="button"
        className="flex items-center gap-1.5"
        onClick={() => setExpanded((e) => !e)}
      >
        <span
          className={`text-muted-foreground ${isLoading ? "animate-shimmer" : ""}`}
        >
          {label}
        </span>
        {!isLoading && (
          <ChevronRight
            className={`h-3 w-3 text-muted-foreground/0 group-hover:text-muted-foreground transition-all ${expanded ? "rotate-90" : ""}`}
          />
        )}
      </button>
      {expanded && !isLoading && result != null && (
        <div className="mt-1 max-h-64 overflow-auto">
          <pre className="text-xs text-muted-foreground whitespace-pre-wrap break-all">
            {typeof result === "string"
              ? result
              : JSON.stringify(result, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}

// =============================================================================
// Message Bubble
// =============================================================================

function MessageBubble({
  message,
  isLast,
  isStreaming,
  streamingStatus,
  handlePromptRefinementSubmit,
}: {
  message: AppMessage;
  isLast: boolean;
  isStreaming: boolean;
  streamingStatus: string | null;
  handlePromptRefinementSubmit: (
    selection: PromptRefinementSelection,
  ) => void | Promise<void>;
}) {
  const isUser = message.role === "user";
  const { spec: rawSpec, text, hasSpec } = useJsonRenderMessage(message.parts);
  const spec = useMemo(
    () => mergeShowcaseToolStateIntoSpec(rawSpec, message.parts),
    [message.parts, rawSpec],
  );
  const rootType = spec?.elements?.[spec.root]?.type ?? null;
  const isPromptRefinementSpec = rootType === "PromptRefinementChooser";
  const [shareId, setShareId] = useState<string | null>(null);
  const [isSharing, setIsSharing] = useState(false);
  const specContainerRef = useRef<HTMLDivElement>(null);
  const didScrollToSpecRef = useRef(false);

  const inferTitle = useCallback(() => {
    const firstLine = text
      ?.split("\n")
      .map((line) => line.trim())
      .find(Boolean);

    if (firstLine) {
      return firstLine.slice(0, 120);
    }

    return "Shared dashboard";
  }, [text]);

  const ensureShare = useCallback(async () => {
    if (shareId) {
      return shareId;
    }

    if (!spec) {
      throw new Error("No dashboard spec available to share.");
    }

    setIsSharing(true);
    try {
      const response = await fetch("/api/shares", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title: inferTitle(),
          spec,
          sourceMessageId: message.id,
          summaryText: text,
        }),
      });

      if (!response.ok) {
        throw new Error(await response.text());
      }

      const payload = (await response.json()) as { id: string };
      setShareId(payload.id);
      return payload.id;
    } finally {
      setIsSharing(false);
    }
  }, [inferTitle, message.id, shareId, spec, text]);

  const handleOpenFullPage = useCallback(async () => {
    try {
      const id = await ensureShare();
      window.open(`/dashboards/${id}`, "_blank", "noopener,noreferrer");
    } catch (openError) {
      toast.error(
        openError instanceof Error
          ? openError.message
          : "Failed to open full page dashboard.",
      );
    }
  }, [ensureShare]);

  const handleCopyShare = useCallback(async () => {
    try {
      const id = await ensureShare();
      const shareUrl = `${window.location.origin}/dashboards/${id}`;
      await navigator.clipboard.writeText(shareUrl);
      toast.success("Share link copied to clipboard");
    } catch (copyError) {
      toast.error(
        copyError instanceof Error
          ? copyError.message
          : "Failed to create share link.",
      );
    }
  }, [ensureShare]);

  const showPreviewSkeleton = hasSpec && isLast && isStreaming;

  // Build ordered segments from parts, collapsing adjacent text and adjacent tools.
  // Spec data parts are tracked so the rendered UI appears inline where the AI
  // placed it rather than always at the bottom.
  const { segments, specInserted } = useMemo(() => {
    const nextSegments: Array<
      | { kind: "text"; text: string }
      | {
          kind: "tools";
          tools: Array<{
            toolCallId: string;
            toolName: string;
            state: string;
            output?: unknown;
          }>;
        }
      | { kind: "spec" }
    > = [];

    let nextSpecInserted = false;

    for (const part of message.parts) {
      if (part.type === "text") {
        if (!part.text.trim()) continue;
        const last = nextSegments[nextSegments.length - 1];
        if (last?.kind === "text") {
          last.text += part.text;
        } else {
          nextSegments.push({ kind: "text", text: part.text });
        }
      } else if (part.type.startsWith("tool-")) {
        const tp = part as {
          type: string;
          toolCallId: string;
          state: string;
          output?: unknown;
        };
        const toolName = tp.type.replace(/^tool-/, "");
        if (HIDDEN_TOOL_NAMES.has(toolName)) {
          continue;
        }
        const last = nextSegments[nextSegments.length - 1];
        if (last?.kind === "tools") {
          last.tools.push({
            toolCallId: tp.toolCallId,
            toolName,
            state: tp.state,
            output: tp.output,
          });
        } else {
          nextSegments.push({
            kind: "tools",
            tools: [
              {
                toolCallId: tp.toolCallId,
                toolName,
                state: tp.state,
                output: tp.output,
              },
            ],
          });
        }
      } else if (part.type === SPEC_DATA_PART_TYPE && !nextSpecInserted) {
        nextSegments.push({ kind: "spec" });
        nextSpecInserted = true;
      }
    }

    return { segments: nextSegments, specInserted: nextSpecInserted };
  }, [message.parts]);

  const hasAnything = segments.length > 0 || hasSpec;
  const showLoader =
    isLast && isStreaming && message.role === "assistant" && !hasAnything;
  const loaderLabel = streamingStatus ?? "Thinking...";

  useEffect(() => {
    if (!hasSpec || !isLast || isStreaming) {
      if (!hasSpec) {
        didScrollToSpecRef.current = false;
      }
      return;
    }

    if (didScrollToSpecRef.current) {
      return;
    }

    specContainerRef.current?.scrollIntoView({
      block: "start",
      behavior: "smooth",
    });
    didScrollToSpecRef.current = true;
  }, [hasSpec, isLast, isStreaming]);

  if (isUser) {
    return (
      <div className="flex justify-end">
        {text && (
          <div className="max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap bg-primary text-primary-foreground rounded-tr-md">
            {text}
          </div>
        )}
      </div>
    );
  }

  const renderSpec = () => {
    if (!hasSpec) return null;

    if (isPromptRefinementSpec) {
      return (
        <div ref={specContainerRef} className="w-full">
          <DashboardSpecRenderer
            spec={spec}
            loading={false}
            renderMode="full"
            promptRefinementSubmit={handlePromptRefinementSubmit}
          />
        </div>
      );
    }

    return (
      <div ref={specContainerRef} className="w-full rounded-lg border p-3">
        <div className="mb-3 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => void handleOpenFullPage()}
            disabled={isStreaming || isSharing}
            className="inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs text-muted-foreground hover:text-foreground disabled:opacity-50"
          >
            {isSharing ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <ExternalLink className="h-3.5 w-3.5" />
            )}
            Open full page
          </button>
          <button
            type="button"
            onClick={() => void handleCopyShare()}
            disabled={isStreaming || isSharing}
            className="inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs text-muted-foreground hover:text-foreground disabled:opacity-50"
          >
            <Share2 className="h-3.5 w-3.5" />
            {shareId ? "Copy share link" : "Share"}
          </button>
        </div>

        <div className="relative overflow-hidden rounded-[1.75rem]">
<div className="max-h-[34rem] overflow-hidden">
            {showPreviewSkeleton ? (
               <div className="rounded-lg border border-border/60 bg-background p-3">
                 <div className="flex flex-col gap-4">
                   <div className="h-16 rounded-lg border border-border/40 bg-card/50" />
                   <div className="grid gap-4 xl:grid-cols-12">
                     <div className="rounded-lg border border-border/40 bg-card/50 xl:col-span-7 xl:min-h-[34rem]" />
                     <div className="grid gap-4 xl:col-span-5">
                       <div className="rounded-lg border border-border/40 bg-card/50 min-h-[18rem]" />
                       <div className="rounded-lg border border-border/40 bg-card/50 min-h-[18rem]" />
                     </div>
                     <div className="rounded-lg border border-border/40 bg-card/50 xl:col-span-6 xl:min-h-[20rem]" />
                     <div className="rounded-lg border border-border/40 bg-card/50 xl:col-span-6 xl:min-h-[20rem]" />
                   </div>
                 </div>
               </div>
             ) : (
              <DashboardSpecRenderer
                spec={spec}
                loading={false}
                renderMode="preview"
                promptRefinementSubmit={handlePromptRefinementSubmit}
              />
            )}
          </div>

          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-background via-background/90 to-transparent" />
          <div className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-center px-4 pb-5">
            <div className="rounded-full border border-border/70 bg-background/90 px-3 py-1.5 text-xs text-muted-foreground shadow-sm backdrop-blur-sm">
              Preview only. Open full page for the complete dashboard.
            </div>
          </div>
        </div>
      </div>
    );
  };

  // If there's a spec but no spec segment was inserted (edge case),
  // append it so it still renders.
  const specRenderedInline = specInserted;
  const showSpecAtEnd = hasSpec && !specRenderedInline;

  if (hasSpec) {
    return (
      <div className="w-full flex flex-col gap-3">
        {renderSpec()}

        {showLoader && (
          <div className="text-sm text-muted-foreground animate-shimmer">
            {loaderLabel}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="w-full flex flex-col gap-3">
      {segments.map((seg, i) => {
        if (seg.kind === "text") {
          const isLastSegment = i === segments.length - 1;
          return (
            <div
              key={`text-${i}`}
              className="text-sm leading-relaxed [&_p+p]:mt-3 [&_ul]:mt-2 [&_ol]:mt-2 [&_pre]:mt-2"
            >
              <Streamdown
                plugins={{ code }}
                animated={isLast && isStreaming && isLastSegment}
              >
                {seg.text}
              </Streamdown>
            </div>
          );
        }
        if (seg.kind === "spec") {
          return <div key="spec">{renderSpec()}</div>;
        }
        return (
          <div key={`tools-${i}`} className="flex flex-col gap-1">
            {seg.tools.map((t) => (
              <ToolCallDisplay
                key={t.toolCallId}
                toolName={t.toolName}
                state={t.state}
                result={t.output}
              />
            ))}
          </div>
        );
      })}

      {/* Loading indicator */}
      {showLoader && (
        <div className="text-sm text-muted-foreground animate-shimmer">
          {loaderLabel}
        </div>
      )}

      {/* Fallback: render spec at end if no inline position was found */}
      {showSpecAtEnd && <div>{renderSpec()}</div>}
    </div>
  );
}

// =============================================================================
// Page
// =============================================================================

export default function ChatPage() {
  const [input, setInput] = useState("");
  const [transientStatus, setTransientStatus] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLElement>(null);
  const [showScrollButton, setShowScrollButton] = useState(false);
  const isStickToBottom = useRef(true);
  const isAutoScrolling = useRef(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const { messages, sendMessage, setMessages, status, error } =
    useChat<AppMessage>({
      transport,
      onData: (dataPart) => {
        if (dataPart.type !== CHAT_STATUS_DATA_PART_TYPE) {
          return;
        }

        const payload = dataPart.data as ChatStatusData;
        setTransientStatus(payload.message);
      },
      onFinish: () => {
        setTransientStatus(null);
      },
      onError: () => {
        setTransientStatus(null);
      },
    });

  const isStreaming = status === "streaming" || status === "submitted";

  useEffect(() => {
    if (!isStreaming) {
      setTransientStatus(null);
    }
  }, [isStreaming]);

  // Track whether the user has scrolled away from the bottom.
  // During programmatic scrolling, suppress button updates until we arrive.
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    const THRESHOLD = 80;
    const handleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = container;
      const atBottom = scrollTop + clientHeight >= scrollHeight - THRESHOLD;

      if (isAutoScrolling.current) {
        // Wait for the programmatic scroll to reach the bottom before
        // handing control back to the user-scroll tracker.
        if (atBottom) {
          isAutoScrolling.current = false;
        }
        return;
      }

      isStickToBottom.current = atBottom;
      setShowScrollButton(!atBottom);
    };
    container.addEventListener("scroll", handleScroll, { passive: true });
    return () => container.removeEventListener("scroll", handleScroll);
  }, []);

  // Auto-scroll to bottom on new messages, unless user scrolled up.
  // Uses instant scrollTop assignment (no smooth animation) to avoid
  // an ongoing animation that fights user scroll input.
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container || !isStickToBottom.current) return;
    isAutoScrolling.current = true;
    container.scrollTop = container.scrollHeight;
    requestAnimationFrame(() => {
      isAutoScrolling.current = false;
    });
  }, [messages, isStreaming]);

  const scrollToBottom = useCallback(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    isStickToBottom.current = true;
    setShowScrollButton(false);
    isAutoScrolling.current = true;
    container.scrollTo({ top: container.scrollHeight, behavior: "smooth" });
    // isAutoScrolling is cleared by the scroll handler once it reaches bottom
  }, []);

  const handleSubmit = useCallback(
    async (text?: string) => {
      const message = text || input;
      if (!message.trim() || isStreaming) return;
      setInput("");
      await sendMessage({ text: message.trim() });
    },
    [input, isStreaming, sendMessage],
  );

  const handlePromptRefinementSubmit = useCallback(
    (selection: PromptRefinementSelection) => {
      if (isStreaming) {
        return;
      }

      const prompt = selection.selectedPrompt.trim();
      if (!prompt) {
        return;
      }

      void sendMessage({
        parts: [
          { type: "text", text: prompt },
          {
            type: PROMPT_REFINEMENT_DATA_PART_TYPE,
            data: selection,
          },
        ],
      });
    },
    [isStreaming, sendMessage],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSubmit();
      }
    },
    [handleSubmit],
  );

  const handleClear = useCallback(() => {
    setMessages([]);
    setInput("");
    inputRef.current?.focus();
  }, [setMessages]);

  const isEmpty = messages.length === 0;

  return (
    <div className="h-screen flex flex-col overflow-hidden">
      {/* Header */}
      <header className="border-b px-6 py-3 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-semibold">{APP_DISPLAY_NAME}</h1>
        </div>
        <div className="flex items-center gap-2">
          {messages.length > 0 && (
            <button
              onClick={handleClear}
              className="px-3 py-1.5 rounded-md text-sm text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            >
              Start Over
            </button>
          )}
          <ThemeToggle />
        </div>
      </header>

      {/* Messages area */}
      <main ref={scrollContainerRef} className="flex-1 overflow-auto">
        {isEmpty ? (
          /* Empty state */
          <div className="min-h-full flex flex-col items-center justify-center px-6 py-12">
            <div className="max-w-4xl w-full space-y-10">
              <div className="text-center space-y-3">
                <h2 className="text-3xl font-semibold tracking-tight">
                  Which showcase dashboard should we build?
                </h2>
                <p className="mx-auto max-w-2xl text-base text-muted-foreground">
                  Ask for estimating and quantity dashboards on the Autodesk
                  showcase model. Every response is designed as a dashboard with
                  the 3D viewer, filters, charts, and tables inside the layout.
                </p>
              </div>

              {/* Suggestions */}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s.label}
                    onClick={() => handleSubmit(s.prompt)}
                    className="group flex min-h-16 items-center gap-3 rounded-2xl border border-border/80 bg-card px-5 py-4 text-left text-base font-semibold text-foreground shadow-sm transition-colors hover:border-foreground/25 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:border-white/15 dark:bg-card dark:text-foreground dark:hover:border-white/35 dark:hover:bg-accent"
                  >
                    <Sparkles className="h-4 w-4 flex-shrink-0 text-primary transition-transform group-hover:scale-110" />
                    <span className="leading-tight">{s.label}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : (
          /* Message thread */
          <div className="mx-auto w-full max-w-6xl px-6 py-6 space-y-6">
            {messages.map((message, index) => (
              <MessageBubble
                key={message.id}
                message={message}
                isLast={index === messages.length - 1}
                isStreaming={isStreaming}
                streamingStatus={transientStatus}
                handlePromptRefinementSubmit={handlePromptRefinementSubmit}
              />
            ))}

            {/* Error display */}
            {error && (
              <div className="rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                {error.message}
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>
        )}
      </main>

      {/* Input bar - always visible at bottom */}
      <div className="px-6 pb-3 flex-shrink-0 bg-background relative">
        {/* Scroll to bottom button */}
        {showScrollButton && !isEmpty && (
          <button
            onClick={scrollToBottom}
            className="absolute left-1/2 -translate-x-1/2 -top-10 z-10 h-8 w-8 rounded-full border border-border bg-background text-muted-foreground shadow-md flex items-center justify-center hover:text-foreground hover:bg-accent transition-colors"
            aria-label="Scroll to bottom"
          >
            <ArrowDown className="h-4 w-4" />
          </button>
        )}
        <div className="mx-auto w-full max-w-6xl relative">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              isEmpty
                ? "e.g., Build a structural framing dashboard with the Autodesk viewer, filters, charts, and tables..."
                : "Ask a follow-up..."
            }
            rows={2}
            className="w-full resize-none rounded-xl border border-input bg-card px-4 py-3 pr-12 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            autoFocus
          />
          <button
            onClick={() => handleSubmit()}
            disabled={!input.trim() || isStreaming}
            className="absolute right-3 bottom-3 h-8 w-8 rounded-lg bg-primary text-primary-foreground flex items-center justify-center hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isStreaming ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <ArrowUp className="h-4 w-4" />
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
