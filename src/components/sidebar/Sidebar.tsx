import { useState, useEffect, useRef, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { useAppStore } from "@/stores/appStore";
import {
  FolderPlus,
  FolderOpen,
  Image,
  Video,
  Calendar,
  Tag,
  Copy,
  Sparkles,
  ChevronRight,
  ChevronDown,
  RefreshCw,
  Trash2,
  RotateCcw,
  FolderTree,
} from "lucide-react";
import { formatFileSize } from "@/utils/format";

interface SourceFolder {
  id: string;
  path: string;
  name: string;
  added_at: string;
  last_scanned_at: string | null;
}

export function Sidebar() {
  const [folders, setFolders] = useState<SourceFolder[]>([]);
  const selectedFolder = useAppStore((s) => s.selectedFolder);
  const setSelectedFolder = useAppStore((s) => s.setSelectedFolder);
  const setIsScanning = useAppStore((s) => s.setIsScanning);
  const setStats = useAppStore((s) => s.setStats);
  const stats = useAppStore((s) => s.stats);
  const isScanning = useAppStore((s) => s.isScanning);

  // Load saved folders on mount
  useEffect(() => {
    const loadFolders = async () => {
      try {
        const saved = await invoke<SourceFolder[]>("get_source_folders");
        setFolders(saved);
      } catch {
        // DB not ready yet
      }
    };
    loadFolders();
  }, []);

  const handleAddFolder = async () => {
    try {
      const selected = await open({ directory: true, multiple: false });
      if (selected) {
        const path = selected as string;
        const name = path.split("/").pop() || path;

        // Save to DB
        const folder = await invoke<SourceFolder>("add_source_folder", {
          path,
          name,
        });

        setFolders((prev) => {
          const exists = prev.find((f) => f.path === path);
          if (exists) return prev;
          return [...prev, folder];
        });

        setSelectedFolder(path);
        setIsScanning(true);

        // Phase 0: fast file list
        await invoke("scan_directory", { path });
        await invoke("update_folder_scan_time", { path });
        const newStats = await invoke("get_media_stats");
        setStats(newStats as any);
        setIsScanning(false);

        // Phase 1: process batches in a loop from frontend
        startPhase1();
      }
    } catch {
      setIsScanning(false);
    }
  };

  const startPhase1 = () => {
    useAppStore.getState().setPhase1Progress(0, 0, true);
    const run = async () => {
      try {
        const [processed, done, total] = await invoke<[number, number, number]>("process_phase1");

        useAppStore.getState().setPhase1Progress(done, total, processed > 0);

        // Refresh gallery every 5 batches (not every batch, to reduce flicker)
        if (done % 250 < 50) {
          const newStats = await invoke("get_media_stats");
          setStats(newStats as any);
          useAppStore.getState().triggerRefresh();
        }

        if (processed > 0) {
          setTimeout(run, 300);
        } else {
          // Final refresh
          const newStats = await invoke("get_media_stats");
          setStats(newStats as any);
          useAppStore.getState().triggerRefresh();
          useAppStore.getState().setPhase1Progress(total, total, false);
        }
      } catch {
        useAppStore.getState().setPhase1Progress(0, 0, false);
      }
    };
    run();
  };

  const handleRescan = async (path: string) => {
    setIsScanning(true);
    try {
      await invoke("scan_directory", { path });
      await invoke("update_folder_scan_time", { path });
      const newStats = await invoke("get_media_stats");
      setStats(newStats as any);
      startPhase1();
    } catch {
      // Handle error
    }
    setIsScanning(false);
  };

  const handleResetLibrary = async () => {
    try {
      await invoke("reset_library");
      setFolders([]);
      setSelectedFolder(null);
      setStats(null);
      useAppStore.getState().triggerRefresh();
    } catch {
      // Handle error
    }
  };

  const handleRemoveFolder = async (path: string) => {
    try {
      await invoke("remove_source_folder", { path });
      setFolders((prev) => prev.filter((f) => f.path !== path));
      if (selectedFolder === path) {
        setSelectedFolder(null);
      }
      const newStats = await invoke("get_media_stats");
      setStats(newStats as any);
      // Force gallery to reload
      useAppStore.getState().triggerRefresh();
    } catch {
      // Handle error
    }
  };

  const [width, setWidth] = useState(224);
  const isResizing = useRef(false);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isResizing.current = true;
    const startX = e.clientX;
    const startWidth = width;

    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing.current) return;
      const newWidth = Math.min(500, Math.max(160, startWidth + (e.clientX - startX)));
      setWidth(newWidth);
    };

    const handleMouseUp = () => {
      isResizing.current = false;
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };

    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
  }, [width]);

  return (
    <aside className="bg-bg-secondary border-r border-border flex flex-col shrink-0 select-none relative" style={{ width }}>
      {/* Resize handle */}
      <div
        onMouseDown={handleMouseDown}
        className="absolute top-0 right-0 w-1 h-full cursor-col-resize hover:bg-accent/30 active:bg-accent/50 z-20"
      />
      <div className="p-3 border-b border-border">
        <button
          onClick={handleAddFolder}
          disabled={isScanning}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-md text-xs font-medium bg-accent text-white hover:bg-accent-hover transition-colors disabled:opacity-50"
        >
          {isScanning ? (
            <>
              <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              스캔 중...
            </>
          ) : (
            <>
              <FolderPlus size={14} />
              폴더 추가
            </>
          )}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-2">
        <SidebarSection title="소스">
          {folders.map((folder) => (
            <SidebarItem
              key={folder.path}
              icon={FolderOpen}
              label={folder.name}
              isActive={selectedFolder === folder.path}
              onClick={() => setSelectedFolder(folder.path)}
              onContextAction={() => handleRescan(folder.path)}
              contextIcon={RefreshCw}
              onRemove={() => handleRemoveFolder(folder.path)}
            />
          ))}
          {folders.length === 0 && (
            <p className="text-xs text-text-secondary px-2 py-4 text-center">
              "폴더 추가"를 눌러 사진을 스캔하세요
            </p>
          )}
        </SidebarSection>

        <SidebarSection title="라이브러리">
          <SidebarItem
            icon={Image}
            label="모든 파일"
            count={stats?.total_count}
            onClick={() => {
              setSelectedFolder(null);
              useAppStore.getState().setMediaFilter("all");
              useAppStore.getState().setGroupBy("none");
              useAppStore.getState().setCurrentView("gallery");
            }}
            isActive={selectedFolder === null && useAppStore.getState().mediaFilter === "all" && useAppStore.getState().groupBy === "none"}
          />
          <SidebarItem
            icon={Image}
            label="사진만"
            count={stats?.image_count}
            onClick={() => {
              setSelectedFolder(null);
              useAppStore.getState().setMediaFilter("image");
              useAppStore.getState().setGroupBy("none");
              useAppStore.getState().setCurrentView("gallery");
            }}
            isActive={useAppStore.getState().mediaFilter === "image"}
          />
          <SidebarItem
            icon={Video}
            label="영상만"
            count={stats?.video_count}
            onClick={() => {
              setSelectedFolder(null);
              useAppStore.getState().setMediaFilter("video");
              useAppStore.getState().setGroupBy("none");
              useAppStore.getState().setCurrentView("gallery");
            }}
            isActive={useAppStore.getState().mediaFilter === "video"}
          />
          <DateGroupList />
          <FolderGroupList />
          <SidebarItem icon={Tag} label="태그별 (준비 중)" />
        </SidebarSection>

        <SidebarSection title="도구">
          <SidebarItem
            icon={Copy}
            label="중복 탐지"
            onClick={() => useAppStore.getState().setCurrentView("duplicates")}
          />
          <SidebarItem
            icon={Sparkles}
            label="AI 분류"
            onClick={() => useAppStore.getState().setCurrentView("organize")}
          />
          <SidebarItem
            icon={FolderTree}
            label="폴더 탐색"
            onClick={() => useAppStore.getState().setCurrentView("foldertree")}
          />
        </SidebarSection>
      </div>

      <div className="p-3 border-t border-border text-xs text-text-secondary">
        {stats && stats.total_count > 0 ? (
          <>
            <div className="flex justify-between">
              <span>전체</span>
              <span>{stats.total_count}개 파일</span>
            </div>
            <div className="flex justify-between mt-1">
              <span>용량</span>
              <span>{formatFileSize(stats.total_size)}</span>
            </div>
            <button
              onClick={handleResetLibrary}
              className="w-full flex items-center justify-center gap-1.5 mt-2 px-2 py-1.5 rounded text-[10px] text-danger hover:bg-danger/10 transition-colors"
            >
              <RotateCcw size={10} />
              라이브러리 초기화
            </button>
          </>
        ) : (
          <p className="text-center text-[10px] py-1">라이브러리가 비어있습니다</p>
        )}
      </div>
    </aside>
  );
}

function SidebarSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  const [isOpen, setIsOpen] = useState(true);

  return (
    <div className="mb-3">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-1 px-2 py-1 text-xs font-semibold text-text-secondary uppercase tracking-wider w-full hover:text-text-primary"
      >
        {isOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        {title}
      </button>
      {isOpen && <div className="mt-1 space-y-0.5">{children}</div>}
    </div>
  );
}

function SidebarItem({
  icon: Icon,
  label,
  count,
  isActive,
  onClick,
  onContextAction,
  contextIcon: ContextIcon,
  onRemove,
}: {
  icon: React.ComponentType<{ size?: number }>;
  label: string;
  count?: number;
  isActive?: boolean;
  onClick?: () => void;
  onContextAction?: () => void;
  contextIcon?: React.ComponentType<{ size?: number }>;
  onRemove?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs group transition-colors ${
        isActive
          ? "bg-accent/10 text-accent"
          : "text-text-secondary hover:bg-bg-primary hover:text-text-primary"
      }`}
    >
      <Icon size={14} />
      <span className="flex-1 text-left truncate">{label}</span>
      {count !== undefined && (
        <span className="text-text-secondary">{count}</span>
      )}
      {ContextIcon && onContextAction && (
        <span
          onClick={(e) => {
            e.stopPropagation();
            onContextAction();
          }}
          className="opacity-0 group-hover:opacity-100 hover:text-accent"
        >
          <ContextIcon size={12} />
        </span>
      )}
      {onRemove && (
        <span
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          className="opacity-0 group-hover:opacity-100 hover:text-danger"
        >
          <Trash2 size={12} />
        </span>
      )}
    </button>
  );
}

interface GroupInfo {
  label: string;
  count: number;
}

function DateGroupList() {
  const [isOpen, setIsOpen] = useState(false);
  const [dates, setDates] = useState<GroupInfo[]>([]);
  const dateFilter = useAppStore((s) => s.dateFilter);

  const handleToggle = async () => {
    if (!isOpen && dates.length === 0) {
      try {
        const result = await invoke<GroupInfo[]>("get_date_groups");
        setDates(result);
      } catch {}
    }
    setIsOpen(!isOpen);
  };

  const handleSelect = (date: string) => {
    useAppStore.getState().setSelectedFolder(null);
    useAppStore.getState().setMediaFilter("all");
    useAppStore.getState().setGroupBy("none");
    useAppStore.getState().setDateFilter(date);
    useAppStore.getState().setFolderFilter(null);
    useAppStore.getState().setCurrentView("gallery");
    useAppStore.getState().triggerRefresh();
  };

  const handleShowAll = () => {
    useAppStore.getState().setSelectedFolder(null);
    useAppStore.getState().setMediaFilter("all");
    useAppStore.getState().setGroupBy("date");
    useAppStore.getState().setDateFilter(null);
    useAppStore.getState().setFolderFilter(null);
    useAppStore.getState().setCurrentView("gallery");
  };

  return (
    <div>
      <button
        onClick={handleToggle}
        className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs transition-colors ${
          isOpen ? "text-accent" : "text-text-secondary hover:bg-bg-primary hover:text-text-primary"
        }`}
      >
        {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        <Calendar size={14} />
        <span className="flex-1 text-left">날짜별</span>
        {dates.length > 0 && <span className="text-[10px] text-text-secondary">{dates.length}일</span>}
      </button>
      {isOpen && (
        <div className="ml-5 mt-0.5 max-h-48 overflow-y-auto space-y-0.5">
          <button
            onClick={handleShowAll}
            className="w-full text-left px-2 py-1 rounded text-[10px] text-accent hover:bg-accent/10"
          >
            전체 날짜별 보기
          </button>
          {dates.map((d) => (
            <button
              key={d.label}
              onClick={() => handleSelect(d.label)}
              className={`w-full flex items-center justify-between px-2 py-1 rounded text-[10px] transition-colors ${
                dateFilter === d.label ? "bg-accent/10 text-accent" : "text-text-secondary hover:bg-bg-primary"
              }`}
            >
              <span className="truncate">{d.label}</span>
              <span>{d.count}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

interface FolderNode {
  name: string;
  fullPath: string;
  count: number;
  children: FolderNode[];
}

function buildFolderTree(folders: GroupInfo[]): FolderNode[] {
  const root: FolderNode = { name: "", fullPath: "", count: 0, children: [] };

  for (const f of folders) {
    const parts = f.label.split("/").filter(Boolean);
    let current = root;

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      let child = current.children.find((c) => c.name === part);
      if (!child) {
        child = {
          name: part,
          fullPath: "/" + parts.slice(0, i + 1).join("/"),
          count: 0,
          children: [],
        };
        current.children.push(child);
      }
      if (i === parts.length - 1) {
        child.count += f.count;
      }
      current = child;
    }
  }

  // Propagate counts upward
  function sumCounts(node: FolderNode): number {
    if (node.children.length === 0) return node.count;
    const childSum = node.children.reduce((s, c) => s + sumCounts(c), 0);
    node.count = node.count + childSum;
    return node.count;
  }
  for (const c of root.children) sumCounts(c);

  // Collapse single-child chains: A -> B -> C => A/B/C
  function collapse(node: FolderNode): FolderNode {
    while (node.children.length === 1 && node.children[0].children.length > 0) {
      const child = node.children[0];
      node.name = node.name ? node.name + "/" + child.name : child.name;
      node.fullPath = child.fullPath;
      node.children = child.children;
    }
    node.children = node.children.map(collapse);
    return node;
  }
  root.children = root.children.map(collapse);

  return root.children;
}

function FolderGroupList() {
  const [isOpen, setIsOpen] = useState(false);
  const [tree, setTree] = useState<FolderNode[]>([]);
  const [rawCount, setRawCount] = useState(0);

  const handleToggle = async () => {
    if (!isOpen && tree.length === 0) {
      try {
        const result = await invoke<GroupInfo[]>("get_folder_groups");
        setRawCount(result.length);
        setTree(buildFolderTree(result));
      } catch {}
    }
    setIsOpen(!isOpen);
  };

  return (
    <div>
      <button
        onClick={handleToggle}
        className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs transition-colors ${
          isOpen ? "text-accent" : "text-text-secondary hover:bg-bg-primary hover:text-text-primary"
        }`}
      >
        {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        <FolderOpen size={14} />
        <span className="flex-1 text-left">폴더별</span>
        {rawCount > 0 && <span className="text-[10px] text-text-secondary">{rawCount}곳</span>}
      </button>
      {isOpen && (
        <div className="ml-3 mt-0.5 max-h-64 overflow-y-auto">
          {tree.map((node) => (
            <FolderTreeNode key={node.fullPath} node={node} depth={0} />
          ))}
        </div>
      )}
    </div>
  );
}

function FolderTreeNode({ node, depth }: { node: FolderNode; depth: number }) {
  const [isOpen, setIsOpen] = useState(depth < 2);
  const folderFilter = useAppStore((s) => s.folderFilter);
  const hasChildren = node.children.length > 0;

  const handleSelect = () => {
    if (hasChildren) {
      setIsOpen(!isOpen);
    }
    useAppStore.getState().setSelectedFolder(node.fullPath);
    useAppStore.getState().setMediaFilter("all");
    useAppStore.getState().setGroupBy("none");
    useAppStore.getState().setDateFilter(null);
    useAppStore.getState().setFolderFilter(node.fullPath);
    useAppStore.getState().setCurrentView("gallery");
    useAppStore.getState().triggerRefresh();
  };

  return (
    <div>
      <button
        onClick={handleSelect}
        title={node.fullPath}
        className={`w-full flex items-center gap-1 py-0.5 rounded text-[10px] transition-colors ${
          folderFilter === node.fullPath ? "bg-accent/10 text-accent" : "text-text-secondary hover:bg-bg-primary hover:text-text-primary"
        }`}
        style={{ paddingLeft: `${depth * 10 + 4}px` }}
      >
        {hasChildren ? (
          isOpen ? <ChevronDown size={10} className="shrink-0" /> : <ChevronRight size={10} className="shrink-0" />
        ) : (
          <span className="w-[10px] shrink-0" />
        )}
        <span className="truncate">{node.name}</span>
        <span className="shrink-0 ml-auto text-text-secondary/60">{node.count}</span>
      </button>
      {hasChildren && isOpen && (
        <div>
          {node.children.map((child) => (
            <FolderTreeNode key={child.fullPath} node={child} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );
}
