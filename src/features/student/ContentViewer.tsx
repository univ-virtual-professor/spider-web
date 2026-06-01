import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Loader2,
  Maximize2,
  Minimize2,
  RotateCw,
  Scan,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { Button } from "@shared/ui/button";
import { cn } from "@shared/lib/utils";

const PDFJS_VERSION = "5.4.624";
const PDFJS_MODULE_URL = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${PDFJS_VERSION}/build/pdf.min.mjs`;
const PDFJS_WORKER_URL = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${PDFJS_VERSION}/build/pdf.worker.min.mjs`;

const ZOOM_MIN = 0.5;
const ZOOM_MAX = 3.0;
const ZOOM_STEP = 0.25;

export type ViewerContentItem = {
  id: string;
  title: string;
  fileUrl: string;
  fileName: string;
  mimeType?: string;
};

type Props = {
  item: ViewerContentItem | null;
  studentName: string;
  onClose: () => void;
};

function detectMime(item: ViewerContentItem): string {
  if (item.mimeType) return item.mimeType;
  const ext = item.fileName.split(".").pop()?.toLowerCase() ?? "";
  if (ext === "pdf") return "application/pdf";
  if (["jpg", "jpeg", "png", "gif", "webp", "bmp"].includes(ext))
    return `image/${ext === "jpg" ? "jpeg" : ext}`;
  if (["mp4", "webm", "ogg", "mov"].includes(ext)) return `video/${ext}`;
  return "application/octet-stream";
}

function clampZoom(z: number) {
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z));
}

export default function ContentViewer({ item, studentName, onClose }: Props) {
  const isApp =
    new URLSearchParams(window.location.search).get("_app") === "1" ||
    window.sessionStorage.getItem("__PK_APP_WEBVIEW__") === "1";
  // PDF state
  const [pageNum, setPageNum] = useState(1);
  const [numPages, setNumPages] = useState(0);
  const [pageRendering, setPageRendering] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pdfZoom, setPdfZoom] = useState(1.0);
  const [pageInputMode, setPageInputMode] = useState(false);
  const [pageInputValue, setPageInputValue] = useState("");

  // Image state
  const [imgZoom, setImgZoom] = useState(1.0);
  const [imgRotation, setImgRotation] = useState(0);
  const [imgPan, setImgPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragOrigin = useRef({ x: 0, y: 0 });

  // Shared
  const [isFullscreen, setIsFullscreen] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const viewerRootRef = useRef<HTMLDivElement>(null);
  const pdfDocRef = useRef<any>(null);
  const renderTaskRef = useRef<any>(null);
  const renderGenerationRef = useRef(0);
  const pdfZoomRef = useRef(pdfZoom);
  pdfZoomRef.current = pdfZoom;
  const pageInputRef = useRef<HTMLInputElement>(null);

  const mime = item ? detectMime(item) : "";
  const isPdf = mime === "application/pdf";
  const isImage = mime.startsWith("image/");
  const isVideo = mime.startsWith("video/");

  // ── Keyboard handler ──────────────────────────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Block print/save
      if ((e.ctrlKey || e.metaKey) && ["s", "p", "S", "P"].includes(e.key)) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        if (document.fullscreenElement) {
          document.exitFullscreen();
        } else {
          onClose();
        }
        return;
      }
      if (isPdf && !pageInputMode) {
        if (e.key === "ArrowRight" || e.key === "PageDown") {
          e.preventDefault();
          setPageNum((n) => Math.min(n + 1, numPages));
        } else if (e.key === "ArrowLeft" || e.key === "PageUp") {
          e.preventDefault();
          setPageNum((n) => Math.max(n - 1, 1));
        } else if (e.key === "Home") {
          e.preventDefault();
          setPageNum(1);
        } else if (e.key === "End") {
          e.preventDefault();
          setPageNum(numPages || 1);
        } else if (e.key === "+" || e.key === "=") {
          setPdfZoom((z) => clampZoom(z + ZOOM_STEP));
        } else if (e.key === "-") {
          setPdfZoom((z) => clampZoom(z - ZOOM_STEP));
        }
      }
    };
    window.addEventListener("keydown", handler, true);
    return () => window.removeEventListener("keydown", handler, true);
  }, [isPdf, numPages, pageInputMode, onClose]);

  // ── Fullscreen sync ───────────────────────────────────────────────────────
  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", handler);
    return () => document.removeEventListener("fullscreenchange", handler);
  }, []);

  const toggleFullscreen = () => {
    if (isApp) {
      setIsFullscreen((prev) => !prev);
      return;
    }
    if (!document.fullscreenElement) {
      viewerRootRef.current?.requestFullscreen();
    } else {
      document.exitFullscreen();
    }
  };

  // ── Reset state when item changes ─────────────────────────────────────────
  useEffect(() => {
    setPageNum(1);
    setNumPages(0);
    setLoadError(null);
    setPdfLoading(false);
    setPdfZoom(1.0);
    setPageInputMode(false);
    setImgZoom(1.0);
    setImgRotation(0);
    setImgPan({ x: 0, y: 0 });
  }, [item?.id]);

  // ── Load PDF ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!item || !isPdf) return;
    setPdfLoading(true);
    pdfDocRef.current = null;
    let cancelled = false;

    (async () => {
      try {
        const pdfjs = (await import(/* @vite-ignore */ PDFJS_MODULE_URL)) as any;
        if (pdfjs?.GlobalWorkerOptions) pdfjs.GlobalWorkerOptions.workerSrc = PDFJS_WORKER_URL;
        const doc = await pdfjs.getDocument(item.fileUrl).promise;
        if (cancelled) return;
        pdfDocRef.current = doc;
        setNumPages(doc.numPages);
        setPageNum(1);
      } catch {
        if (!cancelled) setLoadError("Failed to load PDF. The file may be unavailable.");
      } finally {
        if (!cancelled) setPdfLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [item?.id, isPdf]);

  // ── Render PDF page ───────────────────────────────────────────────────────
  const renderPage = useCallback(async (num: number, zoom: number) => {
    const doc = pdfDocRef.current;
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!doc || !canvas || !container) return;

    if (renderTaskRef.current) {
      renderTaskRef.current.cancel();
      renderTaskRef.current = null;
    }

    const generation = ++renderGenerationRef.current;
    setPageRendering(true);
    try {
      const page = await doc.getPage(num);
      if (generation !== renderGenerationRef.current) return;

      const containerWidth = Math.max(container.clientWidth - 32, 200);
      const baseViewport = page.getViewport({ scale: 1 });
      const baseScale = containerWidth / baseViewport.width;
      const viewport = page.getViewport({ scale: baseScale * zoom });

      canvas.height = viewport.height;
      canvas.width = viewport.width;

      const ctx = canvas.getContext("2d");
      const task = page.render({ canvasContext: ctx, viewport });
      renderTaskRef.current = task;
      await task.promise;
    } catch (err: any) {
      if (err?.name !== "RenderingCancelledException") {
        setLoadError("Failed to render this page.");
      }
    } finally {
      if (generation === renderGenerationRef.current) {
        setPageRendering(false);
      }
    }
  }, []);

  useEffect(() => {
    if (isPdf && pdfDocRef.current && numPages > 0) {
      renderPage(pageNum, pdfZoom);
    }
  }, [pageNum, numPages, pdfZoom, isPdf, renderPage]);

  // Re-render on container resize (fit-to-width)
  useEffect(() => {
    const container = containerRef.current;
    if (!container || !isPdf) return;
    const observer = new ResizeObserver(() => {
      if (pdfDocRef.current && numPages > 0) {
        renderPage(pageNum, pdfZoomRef.current);
      }
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, [isPdf, numPages, pageNum, renderPage]);

  // ── Page input helpers ────────────────────────────────────────────────────
  const openPageInput = () => {
    setPageInputValue(String(pageNum));
    setPageInputMode(true);
    setTimeout(() => pageInputRef.current?.select(), 0);
  };

  const commitPageInput = () => {
    const n = parseInt(pageInputValue, 10);
    if (!isNaN(n)) setPageNum(Math.min(Math.max(1, n), numPages));
    setPageInputMode(false);
  };

  const handleFitToScreen = useCallback(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas || !canvas.width || !canvas.height) return;
    // p-4 wrapper adds 16px padding on each side → 32px per axis
    const availW = container.clientWidth - 32;
    const availH = container.clientHeight - 32;
    const scale = Math.min(availW / canvas.width, availH / canvas.height);
    setPdfZoom(clampZoom(pdfZoomRef.current * scale));
  }, []);

  // ── Image drag handlers ───────────────────────────────────────────────────
  const onImgMouseDown = (e: React.MouseEvent) => {
    if (imgZoom <= 1) return;
    e.preventDefault();
    setIsDragging(true);
    dragOrigin.current = { x: e.clientX - imgPan.x, y: e.clientY - imgPan.y };
  };

  const onImgMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    setImgPan({ x: e.clientX - dragOrigin.current.x, y: e.clientY - dragOrigin.current.y });
  };

  const stopDrag = () => setIsDragging(false);

  if (!item) return null;

  const progressPct = numPages > 0 ? (pageNum / numPages) * 100 : 0;

  return (
    <div
      ref={viewerRootRef}
      className="fixed inset-0 z-50 flex flex-col bg-background"
      onContextMenu={(e) => e.preventDefault()}
    >
      {/* ── Header ── */}
      {!(isApp && isFullscreen) && (
        <div className="flex h-14 shrink-0 items-center justify-between gap-2 border-b border-border bg-card px-3">
          {!isApp && (
            <Button variant="ghost" size="sm" onClick={onClose} className="shrink-0 gap-1 px-2">
              <ChevronLeft className="h-4 w-4" />
              <span className="hidden text-sm sm:inline">Back</span>
            </Button>
          )}

          <p className="flex-1 truncate px-2 text-center text-sm font-semibold">{item.title}</p>

          <div className="flex shrink-0 items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              onClick={toggleFullscreen}
              title={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
            >
              {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
            </Button>
            <Button variant="ghost" size="icon" onClick={onClose} title="Close">
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Floating exit-fullscreen button (WebView only) */}
      {isApp && isFullscreen && (
        <button
          onClick={toggleFullscreen}
          className="absolute right-3 top-3 z-10 rounded-full bg-black/50 p-1.5 text-white"
          title="Exit fullscreen"
        >
          <Minimize2 className="h-4 w-4" />
        </button>
      )}

      {/* PDF progress bar */}
      {isPdf && numPages > 0 && (
        <div className="h-0.5 shrink-0 bg-muted">
          <div
            className="h-full bg-primary transition-all duration-300"
            style={{ width: `${progressPct}%` }}
          />
        </div>
      )}

      {/* ── Content area ── */}
      <div
        ref={containerRef}
        className={cn(
          "relative flex-1 select-none overflow-y-auto",
          isPdf && pdfZoom > 1 ? "overflow-x-auto" : "overflow-x-hidden",
          isImage && imgZoom > 1 ? "overflow-hidden" : ""
        )}
        onMouseMove={isImage ? onImgMouseMove : undefined}
        onMouseUp={isImage ? stopDrag : undefined}
        onMouseLeave={isImage ? stopDrag : undefined}
      >
        {/* Spinners */}
        {(pdfLoading || pageRendering) && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/70">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        )}

        {/* Error */}
        {loadError && (
          <div className="flex flex-col items-center justify-center gap-3 py-24 text-muted-foreground">
            <AlertCircle className="h-10 w-10" />
            <p className="text-sm">{loadError}</p>
          </div>
        )}

        {/* PDF canvas */}
        {isPdf && !loadError && (
          <div className="relative flex justify-center p-4">
            <canvas ref={canvasRef} className="max-w-none rounded shadow" />
            <WatermarkOverlay name={studentName} />
          </div>
        )}

        {/* Image */}
        {isImage && (
          <div
            className="relative flex min-h-full items-center justify-center overflow-hidden p-4"
            style={{ cursor: imgZoom > 1 ? (isDragging ? "grabbing" : "grab") : "default" }}
          >
            <img
              src={item.fileUrl}
              alt={item.title}
              draggable={false}
              onContextMenu={(e) => e.preventDefault()}
              onMouseDown={onImgMouseDown}
              style={{
                transform: `translate(${imgPan.x}px, ${imgPan.y}px) scale(${imgZoom}) rotate(${imgRotation}deg)`,
                transformOrigin: "center",
                transition: isDragging ? "none" : "transform 0.15s ease",
                maxWidth: "100%",
                maxHeight: "100%",
                userSelect: "none",
              }}
            />
            <WatermarkOverlay name={studentName} />
          </div>
        )}

        {/* Video */}
        {isVideo && (
          <div className="relative flex min-h-full items-center justify-center p-4">
            <video
              src={item.fileUrl}
              controls
              controlsList="nodownload"
              onContextMenu={(e) => e.preventDefault()}
              className="max-h-full max-w-full rounded shadow"
            />
            <WatermarkOverlay name={studentName} />
          </div>
        )}

        {/* Unsupported */}
        {!isPdf && !isImage && !isVideo && !loadError && (
          <div className="flex flex-col items-center justify-center gap-3 py-24 text-muted-foreground">
            <AlertCircle className="h-10 w-10" />
            <p className="text-sm">Preview not available for this file type</p>
          </div>
        )}
      </div>

      {/* ── PDF toolbar ── */}
      {isPdf && (
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-border bg-card px-3 py-2">
          {/* Page navigation */}
          <div className="flex items-center gap-0.5">
            <Button
              variant="ghost"
              size="icon"
              className="hidden h-8 w-8 sm:inline-flex"
              disabled={pageNum <= 1 || pageRendering}
              onClick={() => setPageNum(1)}
              title="First page"
            >
              <ChevronsLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              disabled={pageNum <= 1 || pageRendering}
              onClick={() => setPageNum((n) => n - 1)}
              title="Previous page"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>

            {/* Page counter / input */}
            <div className="flex items-center gap-1 px-1">
              {pageInputMode ? (
                <input
                  ref={pageInputRef}
                  type="number"
                  min={1}
                  max={numPages}
                  value={pageInputValue}
                  onChange={(e) => setPageInputValue(e.target.value)}
                  onBlur={commitPageInput}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") commitPageInput();
                    if (e.key === "Escape") setPageInputMode(false);
                  }}
                  className="w-10 rounded border border-border bg-background text-center text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                />
              ) : (
                <button
                  onClick={openPageInput}
                  className="min-w-[54px] rounded px-1.5 py-0.5 text-sm text-muted-foreground hover:bg-muted"
                  title="Click to jump to page"
                >
                  {numPages > 0 ? `${pageNum} / ${numPages}` : "—"}
                </button>
              )}
            </div>

            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              disabled={pageNum >= numPages || pageRendering}
              onClick={() => setPageNum((n) => n + 1)}
              title="Next page"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="hidden h-8 w-8 sm:inline-flex"
              disabled={pageNum >= numPages || pageRendering}
              onClick={() => setPageNum(numPages)}
              title="Last page"
            >
              <ChevronsRight className="h-4 w-4" />
            </Button>
          </div>

          {/* Zoom controls */}
          <div className="flex items-center gap-0.5">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              disabled={pdfZoom <= ZOOM_MIN}
              onClick={() => setPdfZoom((z) => clampZoom(z - ZOOM_STEP))}
              title="Zoom out"
            >
              <ZoomOut className="h-4 w-4" />
            </Button>
            <button
              onClick={() => setPdfZoom(1.0)}
              className="min-w-[52px] rounded px-1.5 py-0.5 text-sm text-muted-foreground hover:bg-muted"
              title="Reset zoom"
            >
              {Math.round(pdfZoom * 100)}%
            </button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              disabled={pdfZoom >= ZOOM_MAX}
              onClick={() => setPdfZoom((z) => clampZoom(z + ZOOM_STEP))}
              title="Zoom in"
            >
              <ZoomIn className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={handleFitToScreen}
              title="Fit to screen"
            >
              <Scan className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* ── Image toolbar ── */}
      {isImage && (
        <div className="flex shrink-0 items-center justify-center gap-1 border-t border-border bg-card px-3 py-2">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            disabled={imgZoom <= ZOOM_MIN}
            onClick={() => {
              setImgZoom((z) => clampZoom(z - ZOOM_STEP));
              setImgPan({ x: 0, y: 0 });
            }}
            title="Zoom out"
          >
            <ZoomOut className="h-4 w-4" />
          </Button>
          <button
            onClick={() => {
              setImgZoom(1.0);
              setImgPan({ x: 0, y: 0 });
            }}
            className="min-w-[52px] rounded px-1.5 py-0.5 text-sm text-muted-foreground hover:bg-muted"
            title="Reset zoom"
          >
            {Math.round(imgZoom * 100)}%
          </button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            disabled={imgZoom >= ZOOM_MAX}
            onClick={() => setImgZoom((z) => clampZoom(z + ZOOM_STEP))}
            title="Zoom in"
          >
            <ZoomIn className="h-4 w-4" />
          </Button>

          <div className="mx-2 h-5 w-px bg-border" />

          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => {
              setImgRotation((r) => (r + 90) % 360);
              setImgPan({ x: 0, y: 0 });
            }}
            title="Rotate 90°"
          >
            <RotateCw className="h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  );
}

function WatermarkOverlay({ name }: { name: string }) {
  const label = name || "Student";
  const tiles = Array.from({ length: 24 });
  return (
    <div
      className="pointer-events-none absolute inset-0 select-none overflow-hidden"
      aria-hidden="true"
    >
      {tiles.map((_, i) => (
        <span
          key={i}
          style={{
            position: "absolute",
            top: `${Math.floor(i / 3) * 16}%`,
            left: `${(i % 3) * 33}%`,
            transform: "rotate(-30deg)",
            opacity: 0.07,
            fontSize: "13px",
            fontWeight: 700,
            whiteSpace: "nowrap",
            userSelect: "none",
            pointerEvents: "none",
          }}
        >
          {label}
        </span>
      ))}
    </div>
  );
}
