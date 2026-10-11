// components/educator/ImageTextarea.tsx
// A rich textarea that supports:
//   – Drag-and-drop image upload
//   – Clipboard paste image upload
//   – File picker ("Add Image" button)
//   – Live image preview with remove buttons
//
// IMPORTANT: Image `<img>` tags are NEVER shown in the textarea.
// The user only sees/edits the plain text portion. Images are stored
// as `<img>` tags appended at the end of the value string but are
// presented only as visual thumbnails below the textarea. This
// prevents accidental corruption of HTML markup.

import { useState, useRef, useCallback, useMemo, useEffect } from "react";
import { Textarea } from "@shared/ui/textarea";
import { Button } from "@shared/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@shared/ui/dialog";
import { Crop as CropIcon, Image as ImageIcon, Loader2, X, Upload } from "lucide-react";
import { toast } from "sonner";
import { uploadToImageKit } from "@shared/lib/imagekitUpload";
import { cn } from "@shared/lib/utils";
import ReactCrop, { type Crop, type PercentCrop, type PixelCrop } from "react-image-crop";
import "react-image-crop/dist/ReactCrop.css";

interface ImageTextareaProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  minHeight?: string;
  folder?: string;
  disabled?: boolean;
  /** Hide the bottom "Add Image" button + hint row */
  hideControls?: boolean;
  /** Label for the upload button — same upload flow, just a caller-chosen label */
  addImageLabel?: string;
}

// ─── Helpers to split / combine text and images ────────────────────────

const IMG_TAG_REGEX = /<img[^>]+src\s*=\s*["']([^"']+)["'][^>]*\/?>/gi;

/** Split a combined value into { text, imageUrls }. */
function splitContent(raw: string): { text: string; imageUrls: string[] } {
  const imageUrls: string[] = [];
  const regex = new RegExp(IMG_TAG_REGEX.source, "gi");
  let match: RegExpExecArray | null;
  while ((match = regex.exec(raw)) !== null) {
    if (match[1]) imageUrls.push(match[1]);
  }

  // Strip all <img …> tags and collapse resulting blank lines
  const text = raw.replace(new RegExp(IMG_TAG_REGEX.source, "gi"), "").replace(/\n{3,}/g, "\n\n");

  return { text, imageUrls };
}

/** Combine plain text + image URLs back into a single stored value. */
function combineContent(text: string, imageUrls: string[]): string {
  if (imageUrls.length === 0) return text;
  const tags = imageUrls.map((url) => `<img src="${url}" alt="" />`).join("\n");
  if (!text) return tags;
  return text.endsWith("\n") ? `${text}${tags}` : `${text}\n${tags}`;
}

// ─── Component ─────────────────────────────────────────────────────────

export default function ImageTextarea({
  value,
  onChange,
  placeholder,
  className,
  minHeight = "140px",
  folder = "/test-questions",
  disabled = false,
  hideControls = false,
  addImageLabel = "Add Image",
}: ImageTextareaProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [cropDialogOpen, setCropDialogOpen] = useState(false);
  const [cropTargetUrl, setCropTargetUrl] = useState<string | null>(null);
  const [cropTargetIndex, setCropTargetIndex] = useState<number | null>(null);
  const [cropSelection, setCropSelection] = useState<Crop>({
    unit: "%",
    x: 10,
    y: 10,
    width: 80,
    height: 80,
  });
  const [cropPixels, setCropPixels] = useState<PixelCrop | null>(null);
  const [cropping, setCropping] = useState(false);
  const dragCounter = useRef(0);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const cropImageRef = useRef<HTMLImageElement | null>(null);

  // Derive text (shown in textarea) and imageUrls (shown as previews)
  const { text, imageUrls } = useMemo(() => splitContent(value), [value]);

  const resizeTextarea = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;

    el.style.height = "auto";
    const minPx = Number.parseFloat(minHeight);
    if (Number.isFinite(minPx)) {
      el.style.height = `${Math.max(el.scrollHeight, minPx)}px`;
    } else {
      el.style.height = `${el.scrollHeight}px`;
    }
  }, [minHeight]);

  useEffect(() => {
    resizeTextarea();
  }, [text, resizeTextarea]);

  // ─── When the user edits the textarea, keep existing images ────────
  const handleTextChange = useCallback(
    (newText: string) => {
      onChange(combineContent(newText, imageUrls));
    },
    [onChange, imageUrls]
  );

  // ─── Upload a single image file ───────────────────────────────────
  const uploadAndAppend = useCallback(
    async (file: File) => {
      if (!file.type.startsWith("image/")) {
        toast.error("Only image files are supported");
        return;
      }
      if (file.size > 10 * 1024 * 1024) {
        toast.error("Image must be under 10 MB");
        return;
      }

      setUploading(true);
      try {
        const { url } = await uploadToImageKit(file, file.name, folder, "website");
        // Re-read the latest split (avoids stale closure)
        const latest = splitContent(value);
        onChange(combineContent(latest.text, [...latest.imageUrls, url]));
        toast.success("Image uploaded");
      } catch (error) {
        const msg = error instanceof Error ? error.message : "Image upload failed";
        console.error("[ImageTextarea upload error]", msg);
        toast.error(msg);
      } finally {
        setUploading(false);
      }
    },
    [value, onChange, folder]
  );

  // ─── Remove an image by URL ────────────────────────────────────────
  const removeImage = useCallback(
    (urlToRemove: string) => {
      const latest = splitContent(value);
      const next = latest.imageUrls.filter((u) => u !== urlToRemove);
      onChange(combineContent(latest.text, next));
    },
    [value, onChange]
  );

  const replaceImageAtIndex = useCallback(
    (index: number, nextUrl: string) => {
      const latest = splitContent(value);
      if (index < 0 || index >= latest.imageUrls.length) return;
      const next = [...latest.imageUrls];
      next[index] = nextUrl;
      onChange(combineContent(latest.text, next));
    },
    [value, onChange]
  );

  const openCropDialog = useCallback((index: number, url: string) => {
    setCropTargetIndex(index);
    setCropTargetUrl(url);
    setCropSelection({ unit: "%", x: 10, y: 10, width: 80, height: 80 });
    setCropPixels(null);
    setCropDialogOpen(true);
  }, []);

  const closeCropDialog = useCallback(() => {
    setCropDialogOpen(false);
    setCropTargetIndex(null);
    setCropTargetUrl(null);
    setCropPixels(null);
  }, []);

  const createCroppedBlob = useCallback(
    async (image: HTMLImageElement, pixelCrop: PixelCrop): Promise<Blob> => {
      const scaleX = image.naturalWidth / image.width;
      const scaleY = image.naturalHeight / image.height;

      const outWidth = Math.max(1, Math.floor(pixelCrop.width * scaleX));
      const outHeight = Math.max(1, Math.floor(pixelCrop.height * scaleY));

      const canvas = document.createElement("canvas");
      canvas.width = outWidth;
      canvas.height = outHeight;

      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Could not create crop canvas");

      ctx.drawImage(
        image,
        pixelCrop.x * scaleX,
        pixelCrop.y * scaleY,
        pixelCrop.width * scaleX,
        pixelCrop.height * scaleY,
        0,
        0,
        outWidth,
        outHeight
      );

      const blob = await new Promise<Blob | null>((resolve) => {
        canvas.toBlob((output) => resolve(output), "image/png", 1);
      });

      if (!blob) throw new Error("Failed to generate cropped image");
      return blob;
    },
    []
  );

  const applyCrop = useCallback(async () => {
    if (cropTargetIndex == null || !cropTargetUrl || !cropPixels || !cropImageRef.current) {
      toast.error("Select an area to crop");
      return;
    }

    setCropping(true);
    try {
      const croppedBlob = await createCroppedBlob(cropImageRef.current, cropPixels);
      const fileName = `cropped-${Date.now()}.png`;
      const { url } = await uploadToImageKit(croppedBlob, fileName, folder, "website");
      replaceImageAtIndex(cropTargetIndex, url);
      toast.success("Image cropped");
      closeCropDialog();
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Image crop failed";
      console.error("[ImageTextarea crop error]", msg);
      toast.error(msg);
    } finally {
      setCropping(false);
    }
  }, [
    closeCropDialog,
    createCroppedBlob,
    cropPixels,
    cropTargetIndex,
    cropTargetUrl,
    folder,
    replaceImageAtIndex,
  ]);

  // ─── Drag-and-drop handlers ───────────────────────────────────────
  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current++;
    if (e.dataTransfer.types.includes("Files")) {
      setIsDragging(true);
    }
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current--;
    if (dragCounter.current <= 0) {
      dragCounter.current = 0;
      setIsDragging(false);
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);
      dragCounter.current = 0;

      const files = Array.from(e.dataTransfer.files);
      const imageFile = files.find((f) => f.type.startsWith("image/"));
      if (imageFile) {
        await uploadAndAppend(imageFile);
      }
    },
    [uploadAndAppend]
  );

  // ─── Paste handler ────────────────────────────────────────────────
  const handlePaste = useCallback(
    async (e: React.ClipboardEvent) => {
      const items = Array.from(e.clipboardData.items);
      const imageItem = items.find((item) => item.type.startsWith("image/"));
      if (!imageItem) return; // allow normal text paste

      e.preventDefault();
      const file = imageItem.getAsFile();
      if (file) {
        await uploadAndAppend(file);
      }
    },
    [uploadAndAppend]
  );

  // ─── File picker ──────────────────────────────────────────────────
  const handlePickFile = useCallback(() => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.onchange = () => {
      const f = input.files?.[0];
      if (f) uploadAndAppend(f);
    };
    input.click();
  }, [uploadAndAppend]);

  const busy = uploading || cropping || disabled;

  return (
    <div className="space-y-2">
      {/* Textarea with drag-and-drop overlay */}
      <div
        className={cn(
          "relative rounded-xl transition-all duration-200",
          isDragging && "scale-[1.005] ring-2 ring-primary ring-offset-2 ring-offset-background"
        )}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
      >
        {/* Drag overlay */}
        {isDragging && (
          <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-xl border-2 border-dashed border-primary bg-primary/10 backdrop-blur-[2px]">
            <div className="flex flex-col items-center gap-1.5 text-primary">
              <Upload className="h-7 w-7 animate-bounce" />
              <p className="text-sm font-semibold">Drop image here</p>
            </div>
          </div>
        )}

        {/* Uploading overlay */}
        {uploading && (
          <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-xl bg-background/70 backdrop-blur-[2px]">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
              <p className="text-sm font-medium">Uploading image…</p>
            </div>
          </div>
        )}

        {/* The textarea shows ONLY the text portion — no HTML img tags */}
        <Textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => handleTextChange(e.target.value)}
          onPaste={handlePaste}
          className={cn("rounded-xl", className)}
          style={{ minHeight, overflowY: "hidden" }}
          placeholder={
            placeholder || "Type your text here. You can drag & drop or paste images too."
          }
          disabled={busy}
        />
      </div>

      {/* ─── Image previews ─────────────────────────────────────────── */}
      {imageUrls.length > 0 && (
        <div className="flex flex-wrap gap-2.5 rounded-xl border border-border/60 bg-muted/30 p-2.5">
          <p className="mb-0.5 w-full text-[11px] font-medium text-muted-foreground">
            Attached images ({imageUrls.length})
          </p>
          {imageUrls.map((url, i) => (
            <div
              key={`${url}-${i}`}
              className="group relative overflow-hidden rounded-lg border border-border/50 bg-background shadow-sm"
            >
              <img
                src={url}
                alt={`Preview ${i + 1}`}
                className="h-[72px] w-[72px] cursor-pointer object-cover transition-transform group-hover:scale-105"
                onClick={() => openCropDialog(i, url)}
                title="Click to crop"
                onError={(e) => {
                  const el = e.target as HTMLImageElement;
                  el.style.display = "none";
                }}
              />
              <button
                type="button"
                onClick={() => openCropDialog(i, url)}
                className={cn(
                  "absolute -left-0.5 -top-0.5 h-5 w-5 rounded-full",
                  "border border-border bg-background/95 text-foreground",
                  "opacity-0 shadow-md transition-opacity group-hover:opacity-100",
                  "hover:bg-muted focus:opacity-100 focus:outline-none"
                )}
                title="Crop image"
              >
                <CropIcon className="h-3 w-3" />
              </button>

              <button
                type="button"
                onClick={() => removeImage(url)}
                className={cn(
                  "absolute -right-0.5 -top-0.5 h-5 w-5 rounded-full",
                  "flex items-center justify-center bg-destructive text-white",
                  "opacity-0 shadow-md transition-opacity group-hover:opacity-100",
                  "hover:bg-destructive/90 focus:opacity-100 focus:outline-none"
                )}
                title="Remove image"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* ─── Bottom controls ────────────────────────────────────────── */}
      {!hideControls && (
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 gap-1.5 rounded-xl text-xs"
            disabled={busy}
            onClick={handlePickFile}
          >
            {uploading ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <ImageIcon className="h-3 w-3" />
            )}
            {addImageLabel}
          </Button>
          <span className="text-[11px] text-muted-foreground">
            or drag &amp; drop · paste from clipboard
          </span>
        </div>
      )}

      <Dialog
        open={cropDialogOpen}
        onOpenChange={(open) => {
          if (!open && !cropping) closeCropDialog();
        }}
      >
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Crop Image</DialogTitle>
            <DialogDescription>
              Select the exact region to keep for this question block image.
            </DialogDescription>
          </DialogHeader>

          <div className="max-h-[68vh] overflow-auto rounded-xl border bg-black/70 p-2">
            {cropTargetUrl ? (
              <ReactCrop
                crop={cropSelection}
                onChange={(_px: PixelCrop, percentCrop: PercentCrop) =>
                  setCropSelection(percentCrop)
                }
                onComplete={(pixelCrop) => setCropPixels(pixelCrop)}
                keepSelection
                minWidth={20}
                minHeight={20}
              >
                <img
                  ref={cropImageRef}
                  src={cropTargetUrl}
                  alt="Crop preview"
                  crossOrigin="anonymous"
                  className="mx-auto max-h-[60vh] w-auto"
                />
              </ReactCrop>
            ) : (
              <div className="flex h-[260px] items-center justify-center text-sm text-muted-foreground">
                No image selected
              </div>
            )}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={closeCropDialog} disabled={cropping}>
              Cancel
            </Button>
            <Button
              type="button"
              onClick={applyCrop}
              disabled={cropping || !cropPixels || cropPixels.width < 2 || cropPixels.height < 2}
            >
              {cropping ? <Loader2 className="h-4 w-4 animate-spin" /> : "Apply Crop"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
