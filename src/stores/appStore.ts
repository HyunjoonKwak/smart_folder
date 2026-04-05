import { create } from "zustand";
import type {
  AppConfig,
  AppView,
  ViewMode,
  MediaStats,
  ScanProgress,
  OrganizePlan,
} from "@/types";

interface AppState {
  // Navigation
  currentView: AppView;
  setCurrentView: (view: AppView) => void;

  // View mode
  viewMode: ViewMode;
  setViewMode: (mode: ViewMode) => void;

  // Selected folder
  selectedFolder: string | null;
  setSelectedFolder: (folder: string | null) => void;

  // Selected media
  selectedMediaIds: Set<string>;
  toggleMediaSelection: (id: string) => void;
  selectAll: (ids: string[]) => void;
  clearSelection: () => void;

  // Stats
  stats: MediaStats | null;
  setStats: (stats: MediaStats | null) => void;

  // Scanning
  isScanning: boolean;
  scanProgress: ScanProgress | null;
  setIsScanning: (scanning: boolean) => void;
  setScanProgress: (progress: ScanProgress | null) => void;

  // Organize
  organizePlan: OrganizePlan | null;
  setOrganizePlan: (plan: OrganizePlan | null) => void;

  // Filter
  mediaFilter: "all" | "image" | "video";
  setMediaFilter: (filter: "all" | "image" | "video") => void;
  groupBy: "none" | "date" | "folder";
  setGroupBy: (group: "none" | "date" | "folder") => void;
  dateFilter: string | null;
  setDateFilter: (date: string | null) => void;
  folderFilter: string | null;
  setFolderFilter: (folder: string | null) => void;

  // Refresh trigger
  refreshCounter: number;
  triggerRefresh: () => void;

  // Phase 1 progress
  phase1Done: number;
  phase1Total: number;
  phase1Running: boolean;
  setPhase1Progress: (done: number, total: number, running: boolean) => void;

  // Search
  searchQuery: string;
  setSearchQuery: (query: string) => void;

  // Theme
  theme: "light" | "dark" | "system";
  setTheme: (theme: "light" | "dark" | "system") => void;

  // Config
  config: AppConfig | null;
  setConfig: (config: AppConfig | null) => void;
}

export const useAppStore = create<AppState>((set) => ({
  currentView: "dashboard",
  setCurrentView: (view) => set({ currentView: view }),

  viewMode: "grid",
  setViewMode: (mode) => set({ viewMode: mode }),

  selectedFolder: null,
  setSelectedFolder: (folder) => set({ selectedFolder: folder }),

  selectedMediaIds: new Set(),
  toggleMediaSelection: (id) =>
    set((state) => {
      const newSet = new Set(state.selectedMediaIds);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return { selectedMediaIds: newSet };
    }),
  selectAll: (ids) => set({ selectedMediaIds: new Set(ids) }),
  clearSelection: () => set({ selectedMediaIds: new Set() }),

  stats: null,
  setStats: (stats) => set({ stats }),

  isScanning: false,
  scanProgress: null,
  setIsScanning: (scanning) => set({ isScanning: scanning }),
  setScanProgress: (progress) => set({ scanProgress: progress }),

  organizePlan: null,
  setOrganizePlan: (plan) => set({ organizePlan: plan }),

  refreshCounter: 0,
  triggerRefresh: () => set((s) => ({ refreshCounter: s.refreshCounter + 1 })),

  phase1Done: 0,
  phase1Total: 0,
  phase1Running: false,
  setPhase1Progress: (done, total, running) => set({ phase1Done: done, phase1Total: total, phase1Running: running }),

  mediaFilter: "all",
  setMediaFilter: (filter) => set({ mediaFilter: filter }),
  groupBy: "none",
  setGroupBy: (group) => set({ groupBy: group }),
  dateFilter: null,
  setDateFilter: (date) => set({ dateFilter: date }),
  folderFilter: null,
  setFolderFilter: (folder) => set({ folderFilter: folder }),

  searchQuery: "",
  setSearchQuery: (query) => set({ searchQuery: query }),

  theme: "system",
  setTheme: (theme) => set({ theme }),

  config: null,
  setConfig: (config) => set({ config }),
}));
