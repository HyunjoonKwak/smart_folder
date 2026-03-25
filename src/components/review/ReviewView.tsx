import { useState, useEffect, useCallback, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { formatFileSize, formatDate } from "@/utils/format";
import type { MediaFile, MediaListResponse } from "@/types";
import {
  ScanSearch,
  FolderOpen,
  Trash2,
  Check,
  ChevronLeft,
  ChevronRight,
  Eye,
  X,
} from "lucide-react";

type MarkState = "keep" | "discard" | "unmarked";

interface ReviewFile extends MediaFile {
  mark: MarkState;
  preview?: string;
}

export function ReviewView() {
  const [folderPath, setFolderPath] = useState("");
  const [files, setFiles] = useState<ReviewFile[]>([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [loading, setLoading] = useState(false);
  const [trashing, setTrashing] = useState(false);
  const [trashResult, setTrashResult] = useState<string | null>(null);
  const [previewCache, setPreviewCache] = useState<Map<string, string>>(
    new Map(),
  );
  const stripRef = useRef<HTMLDivElement>(null);

  const current = files[currentIdx] ?? null;
  const discardCount = files.filter((f) => f.mark === "discard").length;
  const keepCount = files.filter((f) => f.mark === "keep").length;
  const totalCount = files.length;

  const handleSelectFolder = async () => {
    const result = await open({ directory: true, multiple: false });
    if (result) {
      setFolderPath(result as string);
      setTrashResult(null);
    }
  };

  // Load files from selected folder
  const loadFiles = useCallback(async () => {
    if (!folderPath) return;
    setLoading(true);
    try {
      const result = await invoke<MediaListResponse>("get_media_list", {
        folderPath,
        mediaType: "image",
        offset: 0,
        limit: 5000,
      });
      setFiles(result.files.map((f) => ({ ...f, mark: "unmarked" as const })));
      setCurrentIdx(0);
      setPreviewCache(new Map());
    } catch {
      // Handle error
    }
    setLoading(false);
  }, [folderPath]);

  useEffect(() => {
    if (folderPath) loadFiles();
  }, [folderPath, loadFiles]);

  // Preload preview for current and adjacent files
  const loadPreview = useCallback(
    async (idx: number) => {
      if (idx < 0 || idx >= files.length) return;
      const file = files[idx];
      if (previewCache.has(file.id)) return;

      try {
        const cmd =
          file.media_type === "video"
            ? "get_preview_video_frame"
            : "get_preview_image";
        const preview = await invoke<string>(cmd, {
          filePath: file.file_path,
        });
        setPreviewCache((prev) => {
          const next = new Map(prev);
          next.set(file.id, preview);
          return next;
        });
      } catch {
        // Handle error
      }
    },
    [files, previewCache],
  );

  useEffect(() => {
    loadPreview(currentIdx);
    loadPreview(currentIdx + 1);
    loadPreview(currentIdx - 1);
  }, [currentIdx, loadPreview]);

  // Scroll strip to keep current visible
  useEffect(() => {
    if (stripRef.current) {
      const el = stripRef.current.children[currentIdx] as HTMLElement;
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
      }
    }
  }, [currentIdx]);

  const toggleMark = useCallback(
    (mark: MarkState) => {
      setFiles((prev) => {
        const next = [...prev];
        const current = next[currentIdx];
        next[currentIdx] = {
          ...current,
          mark: current.mark === mark ? "unmarked" : mark,
        };
        return next;
      });
    },
    [currentIdx],
  );

  const goNext = useCallback(() => {
    setCurrentIdx((i) => Math.min(i + 1, files.length - 1));
  }, [files.length]);

  const goPrev = useCallback(() => {
    setCurrentIdx((i) => Math.max(i - 1, 0));
  }, []);

  // Mark as discard and advance
  const markDiscardAndNext = useCallback(() => {
    setFiles((prev) => {
      const next = [...prev];
      const c = next[currentIdx];
      next[currentIdx] = {
        ...c,
        mark: c.mark === "discard" ? "unmarked" : "discard",
      };
      return next;
    });
    if (currentIdx < files.length - 1) {
      setTimeout(() => goNext(), 100);
    }
  }, [currentIdx, files.length, goNext]);

  // Keyboard shortcuts
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (files.length === 0) return;

      switch (e.key) {
        case "ArrowRight":
        case "l":
          e.preventDefault();
          goNext();
          break;
        case "ArrowLeft":
        case "h":
          e.preventDefault();
          goPrev();
          break;
        case " ":
          e.preventDefault();
          markDiscardAndNext();
          break;
        case "k":
          e.preventDefault();
          toggleMark("keep");
          break;
        case "Escape":
          e.preventDefault();
          toggleMark("unmarked");
          break;
      }
    },
    [files.length, goNext, goPrev, markDiscardAndNext, toggleMark],
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  const handlePreview = async () => {
    if (current) await invoke("preview_file", { path: current.file_path });
  };

  const handleTrash = async () => {
    const toTrash = files.filter((f) => f.mark === "discard");
    if (toTrash.length === 0) return;

    setTrashing(true);
    setTrashResult(null);

    const paths = toTrash.map((f) => f.file_path);
    try {
      const result = await invoke<{
        success: number;
        failed: number;
        errors: string[];
      }>("trash_review_files", { filePaths: paths });
      setTrashResult(
        `${result.success}개 파일 휴지통 이동 완료` +
          (result.failed > 0 ? ` (${result.failed}개 실패)` : ""),
      );
      // Reload
      await loadFiles();
    } catch {
      setTrashResult("휴지통 이동 실패");
    }
    setTrashing(false);
  };

  const preview = current ? previewCache.get(current.id) : undefined;

  // Empty state
  if (!folderPath) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <ScanSearch
            size={40}
            className="mx-auto mb-3 text-text-secondary/30"
          />
          <p className="text-sm text-text-primary font-medium mb-1">
            사진 리뷰어
          </p>
          <p className="text-[10px] text-text-secondary leading-relaxed mb-4">
            폴더의 사진을 빠르게 넘기면서
            <br />
            B컷을 마킹하고 일괄 정리합니다
          </p>
          <button
            onClick={handleSelectFolder}
            className="flex items-center gap-2 mx-auto px-4 py-2 rounded-md text-xs font-medium bg-accent text-white hover:bg-accent-hover transition-colors"
          >
            <FolderOpen size={14} />
            폴더 선택
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Top bar */}
      <div className="p-2 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button
            onClick={handleSelectFolder}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium bg-bg-secondary hover:bg-bg-primary text-text-primary transition-colors"
          >
            <FolderOpen size={12} />
            폴더 변경
          </button>
          <span className="text-[10px] text-text-secondary truncate max-w-[300px]">
            {folderPath}
          </span>
        </div>
        <div className="flex items-center gap-3 text-[11px]">
          <span className="text-text-secondary">
            {currentIdx + 1} / {totalCount}
          </span>
          <span className="text-success">
            <Check size={10} className="inline mr-0.5" />
            {keepCount}
          </span>
          <span className="text-danger">
            <Trash2 size={10} className="inline mr-0.5" />
            {discardCount}
          </span>
          {discardCount > 0 && (
            <button
              onClick={handleTrash}
              disabled={trashing}
              className="flex items-center gap-1.5 px-3 py-1 rounded-md text-[11px] font-medium bg-danger text-white hover:bg-danger/90 disabled:opacity-50 transition-colors"
            >
              {trashing ? (
                <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <Trash2 size={11} />
              )}
              {discardCount}개 휴지통으로
            </button>
          )}
        </div>
      </div>

      {trashResult && (
        <div className="px-3 py-1.5 border-b border-success/30 bg-success/5 text-xs text-success">
          {trashResult}
        </div>
      )}

      {loading ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="w-5 h-5 border-2 border-accent border-t-transparent rounded-full animate-spin" />
        </div>
      ) : files.length === 0 ? (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-sm text-text-secondary">이미지가 없습니다</p>
        </div>
      ) : (
        <>
          {/* Main preview area */}
          <div className="flex-1 flex items-center justify-center relative bg-black/5 overflow-hidden">
            {/* Nav buttons */}
            <button
              onClick={goPrev}
              disabled={currentIdx === 0}
              className="absolute left-3 z-10 p-2 rounded-full bg-black/30 hover:bg-black/50 disabled:opacity-20 text-white backdrop-blur-sm transition-colors"
            >
              <ChevronLeft size={24} />
            </button>
            <button
              onClick={goNext}
              disabled={currentIdx === files.length - 1}
              className="absolute right-3 z-10 p-2 rounded-full bg-black/30 hover:bg-black/50 disabled:opacity-20 text-white backdrop-blur-sm transition-colors"
            >
              <ChevronRight size={24} />
            </button>

            {/* Image */}
            <div className="max-h-full max-w-full p-4 flex items-center justify-center">
              {preview ? (
                <img
                  src={`data:image/jpeg;base64,${preview}`}
                  alt={current?.file_name}
                  className={`max-h-[calc(100vh-220px)] max-w-full object-contain rounded-lg shadow-lg transition-opacity ${
                    current?.mark === "discard" ? "opacity-40" : ""
                  }`}
                />
              ) : current?.thumbnail ? (
                <img
                  src={`data:image/jpeg;base64,${current.thumbnail}`}
                  alt={current.file_name}
                  className="max-h-[calc(100vh-220px)] max-w-full object-contain rounded-lg shadow-lg blur-sm"
                />
              ) : (
                <div className="w-20 h-20 flex items-center justify-center">
                  <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
                </div>
              )}
            </div>

            {/* Mark overlay */}
            {current?.mark === "discard" && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="bg-danger/80 text-white px-6 py-3 rounded-xl text-lg font-bold backdrop-blur-sm">
                  <Trash2 size={20} className="inline mr-2 -mt-1" />
                  B컷
                </div>
              </div>
            )}
            {current?.mark === "keep" && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="bg-success/80 text-white px-6 py-3 rounded-xl text-lg font-bold backdrop-blur-sm">
                  <Check size={20} className="inline mr-2 -mt-1" />
                  유지
                </div>
              </div>
            )}

            {/* Quick Look button */}
            <button
              onClick={handlePreview}
              className="absolute top-3 right-3 p-2 rounded-full bg-black/30 hover:bg-black/50 text-white backdrop-blur-sm transition-colors"
              title="Quick Look"
            >
              <Eye size={16} />
            </button>
          </div>

          {/* File info + action buttons */}
          <div className="px-3 py-2 border-t border-border flex items-center justify-between">
            <div className="text-[10px] text-text-secondary flex gap-3">
              <span className="font-medium text-text-primary">
                {current?.file_name}
              </span>
              <span>{current ? formatFileSize(current.file_size) : ""}</span>
              {current?.width && current?.height && (
                <span>
                  {current.width}x{current.height}
                </span>
              )}
              {current?.date_taken && (
                <span>{formatDate(current.date_taken)}</span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => toggleMark("keep")}
                className={`flex items-center gap-1 px-3 py-1.5 rounded-md text-[11px] font-medium transition-colors ${
                  current?.mark === "keep"
                    ? "bg-success text-white"
                    : "bg-success/10 text-success hover:bg-success/20"
                }`}
              >
                <Check size={12} />
                유지 (K)
              </button>
              <button
                onClick={() => markDiscardAndNext()}
                className={`flex items-center gap-1 px-3 py-1.5 rounded-md text-[11px] font-medium transition-colors ${
                  current?.mark === "discard"
                    ? "bg-danger text-white"
                    : "bg-danger/10 text-danger hover:bg-danger/20"
                }`}
              >
                <X size={12} />
                B컷 (Space)
              </button>
            </div>
          </div>

          {/* Thumbnail strip */}
          <div
            ref={stripRef}
            className="flex gap-0.5 px-2 py-1.5 border-t border-border bg-bg-secondary/50 overflow-x-auto scrollbar-thin"
          >
            {files.map((file, idx) => (
              <button
                key={file.id}
                onClick={() => setCurrentIdx(idx)}
                className={`shrink-0 w-12 h-12 rounded overflow-hidden border-2 transition-all ${
                  idx === currentIdx
                    ? "border-accent scale-110 z-10"
                    : file.mark === "discard"
                      ? "border-danger/50 opacity-40"
                      : file.mark === "keep"
                        ? "border-success/50"
                        : "border-transparent opacity-70 hover:opacity-100"
                }`}
              >
                {file.thumbnail ? (
                  <img
                    src={`data:image/jpeg;base64,${file.thumbnail}`}
                    alt=""
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full bg-bg-secondary" />
                )}
                {file.mark === "discard" && (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <X size={16} className="text-danger" />
                  </div>
                )}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
