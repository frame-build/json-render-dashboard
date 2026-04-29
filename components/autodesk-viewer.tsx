"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { normalizeApsUrn } from "@/lib/aps/urn";

const VIEWER_SCRIPT_URL =
  "https://developer.api.autodesk.com/modelderivative/v2/viewers/7.*/viewer3D.js";
const VIEWER_STYLE_URL =
  "https://developer.api.autodesk.com/modelderivative/v2/viewers/7.*/style.css";

type AutodeskAccessTokenCallback = (
  accessToken: string,
  expiresInSeconds: number,
) => void;

type AutodeskDocument = {
  getRoot(): {
    getDefaultGeometry(): unknown;
  };
};

type AutodeskViewerInstance = {
  start(): number;
  finish(): void;
  resize?(): void;
  setTheme(theme: string): void;
  setLightPreset(preset: number): void;
  loadDocumentNode(doc: AutodeskDocument, node: unknown): Promise<unknown>;
  fitToView(objectIds?: number[], model?: unknown, immediate?: boolean): void;
  isolate(objectIds: number[] | number | null, model?: unknown): void;
  showAll(): void;
  select(objectIds: number[] | number, model?: unknown, selectionType?: number): void;
  clearSelection(): void;
  getSelection(): number[];
  addEventListener(type: string | number, callback: (event: unknown) => void): void;
  removeEventListener(type: string | number, callback: (event: unknown) => void): void;
};

type AutodeskNamespace = {
  Viewing: {
    SELECTION_CHANGED_EVENT: string | number;
    Initializer(
      options: {
        env: "AutodeskProduction";
        getAccessToken: (callback: AutodeskAccessTokenCallback) => void;
      },
      callback: () => void,
    ): void;
    GuiViewer3D: new (
      container: HTMLElement,
      config?: { extensions?: string[] },
    ) => AutodeskViewerInstance;
    Document: {
      load(
        urn: string,
        onSuccess: (doc: AutodeskDocument) => void,
        onFailure: (
          code: number,
          message: string,
          errors?: unknown,
        ) => void,
      ): void;
    };
  };
};

declare global {
  interface Window {
    Autodesk?: AutodeskNamespace;
  }
}

let viewerAssetsPromise: Promise<AutodeskNamespace> | null = null;

function ensureViewerStylesheet() {
  if (document.querySelector(`link[href="${VIEWER_STYLE_URL}"]`)) {
    return;
  }

  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = VIEWER_STYLE_URL;
  document.head.appendChild(link);
}

function loadViewerAssets(): Promise<AutodeskNamespace> {
  const existing = window.Autodesk;
  if (existing) {
    ensureViewerStylesheet();
    return Promise.resolve(existing);
  }

  if (!viewerAssetsPromise) {
    viewerAssetsPromise = new Promise<AutodeskNamespace>((resolve, reject) => {
      ensureViewerStylesheet();

      const current = window.Autodesk;
      if (current) {
        resolve(current);
        return;
      }

      const script = document.createElement("script");
      script.src = VIEWER_SCRIPT_URL;
      script.async = true;
      script.onload = () => {
        const loaded = window.Autodesk;
        if (loaded) {
          resolve(loaded);
        } else {
          reject(new Error("Autodesk Viewer script loaded but API is unavailable."));
        }
      };
      script.onerror = () => {
        reject(new Error("Failed to load Autodesk Viewer assets."));
      };
      document.body.appendChild(script);
    }).catch((error) => {
      viewerAssetsPromise = null;
      throw error;
    });
  }

  return viewerAssetsPromise;
}

async function fetchViewerToken() {
  const response = await fetch("/api/aps/token", {
    method: "GET",
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }

  return (await response.json()) as {
    access_token: string;
    expires_in: number;
  };
}

async function fetchManifestStatus(urn: string) {
  const response = await fetch(
    `/api/aps/manifest?urn=${encodeURIComponent(urn)}`,
    {
      method: "GET",
      cache: "no-store",
    },
  );

  const payload = (await response.json()) as {
    ok: boolean;
    status?: string;
    progress?: string | null;
    message?: string;
    urn?: string;
  };

  if (!response.ok || !payload.ok) {
    throw new Error(
      payload.message ??
        `Autodesk manifest check failed (${response.status}).`,
    );
  }

  return payload;
}

function initializeViewer(
  Autodesk: AutodeskNamespace,
  container: HTMLElement,
  {
    showModelBrowser,
    theme,
  }: {
    showModelBrowser: boolean;
    theme: string;
  },
) {
  return new Promise<AutodeskViewerInstance>((resolve, reject) => {
    Autodesk.Viewing.Initializer(
      {
        env: "AutodeskProduction",
        getAccessToken(callback) {
          fetchViewerToken()
            .then(({ access_token, expires_in }) => {
              callback(access_token, expires_in);
            })
            .catch(reject);
        },
      },
      () => {
        try {
          const viewer = new Autodesk.Viewing.GuiViewer3D(container, {
            extensions: showModelBrowser ? ["Autodesk.DocumentBrowser"] : [],
          });
          const startCode = viewer.start();
          if (typeof startCode === "number" && startCode > 0) {
            reject(
              new Error(
                `Autodesk Viewer failed to start (code ${String(startCode)}).`,
              ),
            );
            return;
          }
          viewer.setTheme(theme);
          resolve(viewer);
        } catch (error) {
          reject(error);
        }
      },
    );
  });
}

function loadModel(
  Autodesk: AutodeskNamespace,
  viewer: AutodeskViewerInstance,
  urn: string,
  fitToView: boolean,
) {
  return new Promise<void>((resolve, reject) => {
    viewer.setLightPreset(0);
    Autodesk.Viewing.Document.load(
      `urn:${urn}`,
      async (doc) => {
        try {
          await viewer.loadDocumentNode(doc, doc.getRoot().getDefaultGeometry());
          if (fitToView) {
            viewer.fitToView();
          }
          resolve();
        } catch (error) {
          reject(error);
        }
      },
      (code, message, errors) => {
        reject(
          new Error(
            `Failed to load Autodesk document (code ${String(code)}): ${message}${
              errors ? ` ${JSON.stringify(errors)}` : ""
            }`,
          ),
        );
      },
    );
  });
}

export interface AutodeskViewerProps {
  urn?: string | null;
  height?: string | null;
  theme?: "light-theme" | "dark-theme" | null;
  showModelBrowser?: boolean | null;
  fitToView?: boolean | null;
  isolatedDbIds?: number[] | null;
  selectedDbIds?: number[] | null;
  fitToSelection?: boolean | null;
  onSelectionChange?: ((dbIds: number[]) => void) | null;
}

export function AutodeskViewer({
  urn,
  height,
  theme,
  showModelBrowser,
  fitToView,
  isolatedDbIds,
  selectedDbIds,
  fitToSelection,
  onSelectionChange,
}: AutodeskViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<AutodeskViewerInstance | null>(null);
  const loadedUrnRef = useRef<string | null>(null);
  const suppressSelectionEventRef = useRef(false);
  const [ready, setReady] = useState(false);
  const [loadedUrn, setLoadedUrn] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [modelLoading, setModelLoading] = useState(false);
  const [containerReady, setContainerReady] = useState(false);
  const resizeFrameRef = useRef<number | null>(null);

  const resolvedTheme = useMemo(
    () => theme ?? "dark-theme",
    [theme],
  );
  const resolvedHeight = useMemo(() => height ?? "520px", [height]);
  const normalizedUrn = useMemo(() => normalizeApsUrn(urn), [urn]);

  const scheduleResize = useCallback(() => {
    if (resizeFrameRef.current != null) {
      cancelAnimationFrame(resizeFrameRef.current);
    }

    resizeFrameRef.current = requestAnimationFrame(() => {
      resizeFrameRef.current = null;
      viewerRef.current?.resize?.();
    });
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    const updateReadyState = () => {
      const nextReady = container.clientWidth > 0 && container.clientHeight > 0;
      setContainerReady(nextReady);
    };

    updateReadyState();

    if (typeof ResizeObserver === "undefined") {
      return;
    }

    const observer = new ResizeObserver(() => {
      updateReadyState();
    });

    observer.observe(container);

    return () => {
      observer.disconnect();
    };
  }, [resolvedHeight]);

  useEffect(() => {
    let disposed = false;

    async function setup() {
      if (!containerRef.current || viewerRef.current || !containerReady) {
        return;
      }

      setError(null);
      try {
        const Autodesk = await loadViewerAssets();
        if (disposed || !containerRef.current) {
          return;
        }

        const viewer = await initializeViewer(Autodesk, containerRef.current, {
          showModelBrowser: showModelBrowser ?? false,
          theme: resolvedTheme,
        });

        if (disposed) {
          viewer.finish();
          return;
        }

        viewerRef.current = viewer;
        setReady(true);
      } catch (setupError) {
        if (disposed) {
          return;
        }
        setError(
          setupError instanceof Error
            ? setupError.message
            : "Failed to initialize Autodesk Viewer.",
        );
      }
    }

    setup();

    return () => {
      disposed = true;
      if (resizeFrameRef.current != null) {
        cancelAnimationFrame(resizeFrameRef.current);
        resizeFrameRef.current = null;
      }
      loadedUrnRef.current = null;
      setLoadedUrn(null);
      const viewer = viewerRef.current;
      if (viewer) {
        viewer.finish();
        viewerRef.current = null;
      }
    };
  }, [containerReady, resolvedTheme, showModelBrowser]);

  useEffect(() => {
    if (!viewerRef.current) {
      return;
    }

    viewerRef.current.setTheme(resolvedTheme);
  }, [resolvedTheme]);

  useEffect(() => {
    if (!ready || !containerReady) {
      return;
    }

    scheduleResize();
  }, [containerReady, ready, resolvedHeight, scheduleResize]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !ready || !containerReady || typeof ResizeObserver === "undefined") {
      return;
    }

    const observer = new ResizeObserver(() => {
      scheduleResize();
    });

    observer.observe(container);

    return () => {
      observer.disconnect();
    };
  }, [containerReady, ready, scheduleResize]);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      const viewer = viewerRef.current;
      const Autodesk = window.Autodesk;

      if (!viewer || !Autodesk || !ready || !containerReady) {
        return;
      }

      if (!normalizedUrn) {
        setError("Missing Autodesk model URN.");
        return;
      }

      if (loadedUrnRef.current === normalizedUrn) {
        return;
      }

      setError(null);
      setLoadedUrn(null);
      setModelLoading(true);

      try {
        await fetchManifestStatus(normalizedUrn);
        await loadModel(Autodesk, viewer, normalizedUrn, fitToView ?? true);
        if (cancelled) {
          return;
        }
        scheduleResize();
        loadedUrnRef.current = normalizedUrn;
        setLoadedUrn(normalizedUrn);
      } catch (loadError) {
        if (cancelled) {
          return;
        }
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Failed to load Autodesk model.",
        );
      } finally {
        if (!cancelled) {
          setModelLoading(false);
        }
      }
    }

    run();

    return () => {
      cancelled = true;
    };
  }, [containerReady, fitToView, normalizedUrn, ready, scheduleResize]);

  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || !ready || loadedUrn !== normalizedUrn) {
      return;
    }

    if (isolatedDbIds && isolatedDbIds.length > 0) {
      viewer.isolate(isolatedDbIds);
      if (fitToView ?? true) {
        viewer.fitToView(isolatedDbIds);
      }
      return;
    }

    viewer.showAll();
  }, [fitToView, isolatedDbIds, loadedUrn, normalizedUrn, ready]);

  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || !ready || loadedUrn !== normalizedUrn) {
      return;
    }

    suppressSelectionEventRef.current = true;

    if (selectedDbIds && selectedDbIds.length > 0) {
      viewer.select(selectedDbIds);
      if (fitToSelection ?? false) {
        viewer.fitToView(selectedDbIds, undefined, true);
      }
    } else {
      viewer.clearSelection();
    }

    queueMicrotask(() => {
      suppressSelectionEventRef.current = false;
    });
  }, [fitToSelection, loadedUrn, normalizedUrn, ready, selectedDbIds]);

  useEffect(() => {
    const viewer = viewerRef.current;
    const Autodesk = window.Autodesk;

    if (
      !viewer ||
      !Autodesk ||
      !onSelectionChange ||
      !ready ||
      loadedUrn !== normalizedUrn
    ) {
      return;
    }

    const selectionChangedEvent =
      Autodesk.Viewing.SELECTION_CHANGED_EVENT ?? "selection";

    const handleSelectionChanged = () => {
      if (suppressSelectionEventRef.current) {
        return;
      }
      onSelectionChange(viewer.getSelection());
    };

    viewer.addEventListener(selectionChangedEvent, handleSelectionChanged);

    return () => {
      viewer.removeEventListener(selectionChangedEvent, handleSelectionChanged);
    };
  }, [loadedUrn, normalizedUrn, onSelectionChange, ready]);

  return (
    <div
      className="relative min-h-0 w-full overflow-hidden rounded-lg border bg-card"
      style={{
        contain: "layout paint",
        flex: `0 0 ${resolvedHeight}`,
        height: resolvedHeight,
        maxHeight: resolvedHeight,
        maxWidth: "100%",
        minHeight: resolvedHeight,
        width: "100%",
      }}
    >
      <div ref={containerRef} className="h-full w-full" />

      {(modelLoading || ((!ready || !containerReady) && !error)) && (
        <div className="absolute inset-0 flex items-center justify-center bg-background/70 text-sm text-muted-foreground backdrop-blur-[1px]">
          {containerReady ? "Loading Autodesk Viewer…" : "Preparing viewer layout…"}
        </div>
      )}

      {error && (
        <div className="absolute inset-x-4 bottom-4 rounded-md border border-destructive/40 bg-background/95 px-3 py-2 text-sm text-destructive shadow-sm">
          {error}
        </div>
      )}
    </div>
  );
}
