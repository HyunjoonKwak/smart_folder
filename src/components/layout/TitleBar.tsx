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
} from "lucide-react";

const NAV_ITEMS = [
  { id: "gallery" as const, label: "갤러리", icon: Grid3x3 },
  { id: "foldertree" as const, label: "폴더 탐색", icon: FolderTree },
  { id: "duplicates" as const, label: "중복 탐지", icon: Copy },
  { id: "organize" as const, label: "정리", icon: ArrowRightLeft },
  { id: "history" as const, label: "히스토리", icon: History },
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

  return (
    <header className="h-12 bg-bg-secondary border-b border-border flex items-center px-4 gap-3 shrink-0 select-none"
      data-tauri-drag-region
    >
      <div className="flex items-center gap-1 mr-2">
        <FolderOpen size={18} className="text-accent" />
        <span className="font-semibold text-sm text-text-primary">
          스마트 폴더
        </span>
      </div>

      <nav className="flex items-center gap-1">
        {NAV_ITEMS.map((item) => (
          <button
            key={item.id}
            onClick={() => setCurrentView(item.id)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
              currentView === item.id
                ? "bg-accent text-white"
                : "text-text-secondary hover:bg-bg-primary hover:text-text-primary"
            }`}
          >
            <item.icon size={14} />
            {item.label}
          </button>
        ))}
      </nav>

      <div className="flex-1 max-w-md mx-4">
        <div className="relative">
          <Search
            size={14}
            className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-secondary"
          />
          <input
            type="text"
            placeholder="파일, 태그 검색..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full h-7 pl-8 pr-3 rounded-md text-xs bg-bg-primary border border-border text-text-primary placeholder:text-text-secondary focus:outline-none focus:ring-1 focus:ring-accent"
          />
        </div>
      </div>

      {isScanning && scanProgress && (
        <div className="flex items-center gap-2 text-xs text-accent">
          <div className="w-20 h-1.5 bg-bg-primary rounded-full overflow-hidden">
            <div
              className="h-full bg-accent rounded-full transition-all"
              style={{
                width: `${scanProgress.total > 0 ? (scanProgress.current / scanProgress.total) * 100 : 0}%`,
              }}
            />
          </div>
          <span>
            {scanProgress.current}/{scanProgress.total}
          </span>
        </div>
      )}

      {currentView === "gallery" && (
        <div className="flex items-center gap-1 border border-border rounded-md">
          <button
            onClick={() => setViewMode("grid")}
            className={`p-1 rounded-l-md ${viewMode === "grid" ? "bg-accent text-white" : "text-text-secondary hover:text-text-primary"}`}
          >
            <Grid3x3 size={14} />
          </button>
          <button
            onClick={() => setViewMode("list")}
            className={`p-1 rounded-r-md ${viewMode === "list" ? "bg-accent text-white" : "text-text-secondary hover:text-text-primary"}`}
          >
            <List size={14} />
          </button>
        </div>
      )}

      {stats && (
        <div className="text-xs text-text-secondary">
          {formatCount(stats.total_count)}개 파일 ·{" "}
          {formatFileSize(stats.total_size)}
        </div>
      )}
    </header>
  );
}
