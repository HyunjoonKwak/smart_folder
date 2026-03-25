import { useState, useRef, useEffect } from "react";
import { useAppStore } from "@/stores/appStore";
import { formatFileSize, formatCount } from "@/utils/format";
import {
  Search,
  Grid3x3,
  List,
  FolderOpen,
  Copy,
  ArrowRightLeft,
  History,
  FolderTree,
  Focus,
  ScanSearch,
  ChevronDown,
  Wrench,
} from "lucide-react";
import type { AppView } from "@/types";

const NAV_ITEMS: Array<{
  id: AppView;
  label: string;
  icon: typeof Grid3x3;
}> = [
  { id: "gallery", label: "갤러리", icon: Grid3x3 },
  { id: "foldertree", label: "폴더", icon: FolderTree },
  { id: "duplicates", label: "중복 탐지", icon: Copy },
  { id: "organize", label: "정리", icon: ArrowRightLeft },
  { id: "history", label: "히스토리", icon: History },
];

const TOOL_ITEMS: Array<{
  id: AppView;
  label: string;
  desc: string;
  icon: typeof Grid3x3;
}> = [
  { id: "bcut", label: "B컷 자동 탐지", desc: "선명도·노출 분석", icon: Focus },
  {
    id: "review",
    label: "사진 리뷰어",
    desc: "수동 B컷 마킹",
    icon: ScanSearch,
  },
];

export function TitleBar() {
  const currentView = useAppStore((s) => s.currentView);
  const setCurrentView = useAppStore((s) => s.setCurrentView);
  const viewMode = useAppStore((s) => s.viewMode);
  const setViewMode = useAppStore((s) => s.setViewMode);
  const searchQuery = useAppStore((s) => s.searchQuery);
  const setSearchQuery = useAppStore((s) => s.setSearchQuery);
  const stats = useAppStore((s) => s.stats);
  const isScanning = useAppStore((s) => s.isScanning);
  const scanProgress = useAppStore((s) => s.scanProgress);

  const [toolsOpen, setToolsOpen] = useState(false);
  const toolsRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (toolsRef.current && !toolsRef.current.contains(e.target as Node)) {
        setToolsOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const activeTool = TOOL_ITEMS.find((t) => t.id === currentView);
  const isToolView = !!activeTool;

  return (
    <header
      className="h-11 bg-bg-secondary/80 backdrop-blur-md border-b border-border flex items-center px-4 gap-2 shrink-0 select-none"
      data-tauri-drag-region
    >
      {/* Logo */}
      <div className="flex items-center gap-1.5 mr-1">
        <FolderOpen size={16} className="text-accent" />
        <span className="font-semibold text-[13px] text-text-primary tracking-tight">
          스마트 폴더
        </span>
      </div>

      {/* Separator */}
      <div className="w-px h-4 bg-border mx-1" />

      {/* Main nav */}
      <nav className="flex items-center gap-0.5">
        {NAV_ITEMS.map((item) => (
          <button
            key={item.id}
            onClick={() => {
              setCurrentView(item.id);
              setToolsOpen(false);
            }}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium transition-all ${
              currentView === item.id
                ? "bg-accent text-white shadow-sm shadow-accent/25"
                : "text-text-secondary hover:bg-bg-primary hover:text-text-primary"
            }`}
          >
            <item.icon size={13} />
            {item.label}
          </button>
        ))}

        {/* Tools dropdown */}
        <div ref={toolsRef} className="relative">
          <button
            onClick={() => setToolsOpen(!toolsOpen)}
            className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-medium transition-all ${
              isToolView
                ? "bg-accent text-white shadow-sm shadow-accent/25"
                : "text-text-secondary hover:bg-bg-primary hover:text-text-primary"
            }`}
          >
            {activeTool ? (
              <>
                <activeTool.icon size={13} />
                {activeTool.label}
              </>
            ) : (
              <>
                <Wrench size={13} />
                도구
              </>
            )}
            <ChevronDown
              size={10}
              className={`transition-transform ${toolsOpen ? "rotate-180" : ""}`}
            />
          </button>

          {toolsOpen && (
            <div className="absolute top-full left-0 mt-1 w-52 bg-bg-elevated border border-border rounded-lg shadow-lg shadow-black/10 overflow-hidden z-50 animate-slide-in">
              {TOOL_ITEMS.map((item) => (
                <button
                  key={item.id}
                  onClick={() => {
                    setCurrentView(item.id);
                    setToolsOpen(false);
                  }}
                  className={`w-full flex items-start gap-2.5 px-3 py-2.5 text-left transition-colors ${
                    currentView === item.id
                      ? "bg-accent/10"
                      : "hover:bg-bg-secondary"
                  }`}
                >
                  <item.icon
                    size={15}
                    className={
                      currentView === item.id
                        ? "text-accent mt-0.5"
                        : "text-text-secondary mt-0.5"
                    }
                  />
                  <div>
                    <p
                      className={`text-[11px] font-medium ${
                        currentView === item.id
                          ? "text-accent"
                          : "text-text-primary"
                      }`}
                    >
                      {item.label}
                    </p>
                    <p className="text-[9px] text-text-secondary">
                      {item.desc}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </nav>

      {/* Search */}
      <div className="flex-1 max-w-sm mx-3">
        <div className="relative">
          <Search
            size={13}
            className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-secondary"
          />
          <input
            type="text"
            placeholder="검색..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full h-7 pl-8 pr-3 rounded-md text-[11px] bg-bg-primary border border-border text-text-primary placeholder:text-text-secondary/50 focus:outline-none focus:ring-1 focus:ring-accent/50 focus:border-accent/50 transition-shadow"
          />
        </div>
      </div>

      {/* Scan progress */}
      {isScanning && scanProgress && (
        <div className="flex items-center gap-2 text-[10px] text-accent">
          <div className="w-16 h-1 bg-bg-primary rounded-full overflow-hidden">
            <div
              className="h-full bg-accent rounded-full transition-all"
              style={{
                width: `${scanProgress.total > 0 ? (scanProgress.current / scanProgress.total) * 100 : 0}%`,
              }}
            />
          </div>
          <span className="tabular-nums">
            {scanProgress.current}/{scanProgress.total}
          </span>
        </div>
      )}

      {/* View mode toggle */}
      {currentView === "gallery" && (
        <div className="flex items-center border border-border rounded-md overflow-hidden">
          <button
            onClick={() => setViewMode("grid")}
            className={`p-1 transition-colors ${viewMode === "grid" ? "bg-accent text-white" : "text-text-secondary hover:text-text-primary"}`}
          >
            <Grid3x3 size={13} />
          </button>
          <button
            onClick={() => setViewMode("list")}
            className={`p-1 transition-colors ${viewMode === "list" ? "bg-accent text-white" : "text-text-secondary hover:text-text-primary"}`}
          >
            <List size={13} />
          </button>
        </div>
      )}

      {/* Stats */}
      {stats && (
        <div className="text-[10px] text-text-secondary/70 tabular-nums">
          {formatCount(stats.total_count)} · {formatFileSize(stats.total_size)}
        </div>
      )}
    </header>
  );
}
