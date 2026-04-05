import { useState, useRef } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { useAppStore } from "@/stores/appStore";
import { formatFileSize, formatCount } from "@/utils/format";
import {
  Search,
  Grid3x3,
  List,
  FolderOpen,
  ScanSearch,
  RefreshCw,
  Sparkles,
  Settings,
  Copy,
  ArrowRightLeft,
  FolderTree,
  History,
  LayoutDashboard,
} from "lucide-react";
import type { AppView } from "@/types";

export function TitleBar() {
  const { t } = useTranslation();
  const currentView = useAppStore((s) => s.currentView);
  const setCurrentView = useAppStore((s) => s.setCurrentView);
  const viewMode = useAppStore((s) => s.viewMode);
  const setViewMode = useAppStore((s) => s.setViewMode);
  const searchQuery = useAppStore((s) => s.searchQuery);
  const setSearchQuery = useAppStore((s) => s.setSearchQuery);
  const stats = useAppStore((s) => s.stats);
  const isScanning = useAppStore((s) => s.isScanning);
  const scanProgress = useAppStore((s) => s.scanProgress);

  const NAV_ITEMS: Array<{ id: AppView; label: string; icon: typeof Grid3x3; tooltip: string }> = [
    { id: "dashboard", label: t("nav.dashboard"), icon: LayoutDashboard, tooltip: "라이브러리 현황 및 빠른 실행" },
    { id: "duplicates", label: t("nav.duplicates"), icon: Copy, tooltip: "동일/유사 파일 탐지 및 삭제" },
    { id: "review", label: t("tools.photoReview"), icon: ScanSearch, tooltip: "수동 검토 + 자동 B컷 분석" },
    { id: "organize", label: t("nav.organize"), icon: ArrowRightLeft, tooltip: "날짜/유형별 폴더 자동 분류" },
    { id: "cleanup", label: t("nav.cleanup"), icon: Sparkles, tooltip: "중복→B컷→정리 자동 워크플로우" },
    { id: "sync", label: t("nav.sync"), icon: RefreshCw, tooltip: "소스→대상 단방향 파일 동기화" },
    { id: "foldertree", label: t("nav.folder"), icon: FolderTree, tooltip: "폴더 구조, 용량 분석, 비교" },
    { id: "history", label: t("nav.history"), icon: History, tooltip: "작업 이력 확인 및 되돌리기" },
  ];

  return (
    <header
      className="h-11 bg-bg-secondary/80 backdrop-blur-md border-b border-border flex items-center px-4 gap-2 shrink-0 select-none"
      data-tauri-drag-region
    >
      {/* Logo - click to go home */}
      <div className="flex items-center gap-1.5 mr-1 cursor-pointer" onClick={() => setCurrentView("dashboard")}>
        <FolderOpen size={16} className="text-accent" />
        <span className="font-semibold text-[13px] text-text-primary tracking-tight">
          {t("app.name")}
        </span>
      </div>

      {/* Separator */}
      <div className="w-px h-4 bg-border mx-1" />

      {/* Main nav */}
      <nav className="flex items-center gap-0.5">
        {NAV_ITEMS.map((item) => (
          <NavButton
            key={item.id}
            icon={item.icon}
            label={item.label}
            tooltip={item.tooltip}
            isActive={currentView === item.id}
            onClick={() => setCurrentView(item.id)}
          />
        ))}
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
            placeholder={t("app.search")}
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

      {/* Settings */}
      <button
        onClick={() => setCurrentView("settings")}
        className={`p-1 rounded-md transition-colors ${
          currentView === "settings"
            ? "bg-accent text-white"
            : "text-text-secondary hover:text-text-primary hover:bg-bg-primary"
        }`}
      >
        <Settings size={14} />
      </button>

      {/* Stats */}
      {stats && (
        <div className="text-[10px] text-text-secondary/70 tabular-nums">
          {formatCount(stats.total_count)} · {formatFileSize(stats.total_size)}
        </div>
      )}
    </header>
  );
}

function NavButton({
  icon: Icon,
  label,
  tooltip,
  isActive,
  onClick,
}: {
  icon: React.ComponentType<{ size?: number }>;
  label: string;
  tooltip: string;
  isActive: boolean;
  onClick: () => void;
}) {
  const [showTip, setShowTip] = useState(false);
  const [tipPos, setTipPos] = useState({ x: 0, y: 0 });
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);

  const handleEnter = () => {
    timerRef.current = setTimeout(() => {
      if (btnRef.current) {
        const rect = btnRef.current.getBoundingClientRect();
        setTipPos({ x: rect.left + rect.width / 2, y: rect.bottom + 8 });
        setShowTip(true);
      }
    }, 400);
  };

  const handleLeave = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setShowTip(false);
  };

  return (
    <>
      <button
        ref={btnRef}
        onClick={onClick}
        onMouseEnter={handleEnter}
        onMouseLeave={handleLeave}
        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium transition-all ${
          isActive
            ? "bg-accent text-white shadow-sm shadow-accent/25"
            : "text-text-secondary hover:bg-bg-primary hover:text-text-primary active:scale-[0.96]"
        }`}
      >
        <Icon size={13} />
        {label}
      </button>
      {showTip && createPortal(
        <div
          className="fixed px-2.5 py-1.5 rounded-md bg-[#1a1a2e] text-white text-[10px] whitespace-nowrap shadow-lg shadow-black/20 pointer-events-none z-[9999] animate-fade-in"
          style={{ left: tipPos.x, top: tipPos.y, transform: "translateX(-50%)" }}
        >
          {tooltip}
          <div className="absolute bottom-full left-1/2 -translate-x-1/2 border-4 border-transparent border-b-[#1a1a2e]" />
        </div>,
        document.body,
      )}
    </>
  );
}
