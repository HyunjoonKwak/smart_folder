import { useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useAppStore } from "@/stores/appStore";
import { useScanProgress } from "@/hooks/useTauriEvents";
import { TitleBar } from "@/components/layout/TitleBar";
import { Sidebar } from "@/components/sidebar/Sidebar";
import { DashboardView } from "@/components/dashboard/DashboardView";
import { GalleryGrid } from "@/components/gallery/GalleryGrid";
import { DuplicatesView } from "@/components/duplicates/DuplicatesView";
import { OrganizeView } from "@/components/organize/OrganizeView";
import { HistoryView } from "@/components/organize/HistoryView";
import { FolderTreeView } from "@/components/foldertree/FolderTreeView";
import { BcutView } from "@/components/bcut/BcutView";
import { ReviewView } from "@/components/review/ReviewView";
import { SyncView } from "@/components/sync/SyncView";
import { CleanupWizardView } from "@/components/cleanup/CleanupWizardView";
import { SettingsView } from "@/components/settings/SettingsView";
import { TagManager } from "@/components/tags/TagManager";
import { AlbumManager } from "@/components/albums/AlbumManager";
import { MapView } from "@/components/map/MapView";
import type { AppConfig, AppView, MediaStats } from "@/types";

const FULL_WIDTH_VIEWS: ReadonlySet<AppView> = new Set([]);

function App() {
  const currentView = useAppStore((s) => s.currentView);
  const setStats = useAppStore((s) => s.setStats);
  const setConfig = useAppStore((s) => s.setConfig);
  const config = useAppStore((s) => s.config);

  useScanProgress();

  useEffect(() => {
    const loadInitial = async () => {
      try {
        const stats = await invoke<MediaStats>("get_media_stats");
        setStats(stats);
      } catch {
        // DB not ready yet
      }
      try {
        const config = await invoke<AppConfig>("get_config");
        setConfig(config);
      } catch {
        // Config not ready yet
      }
    };
    loadInitial();
  }, [setStats, setConfig]);

  // Apply theme to document when config changes
  useEffect(() => {
    if (!config) return;
    if (config.theme === "dark") {
      document.documentElement.setAttribute("data-theme", "dark");
    } else if (config.theme === "light") {
      document.documentElement.setAttribute("data-theme", "light");
    } else {
      document.documentElement.removeAttribute("data-theme");
    }
  }, [config]);

  const renderMainContent = () => {
    switch (currentView) {
      case "dashboard":
        return <DashboardView />;
      case "gallery":
        return <GalleryGrid />;
      case "duplicates":
        return <DuplicatesView />;
      case "organize":
      case "before-after":
        return <OrganizeView />;
      case "history":
        return <HistoryView />;
      case "foldertree":
        return <FolderTreeView />;
      case "bcut":
        return <BcutView />;
      case "review":
        return <ReviewView />;
      case "sync":
        return <SyncView />;
      case "cleanup":
        return <CleanupWizardView />;
      case "settings":
        return <SettingsView />;
      case "tags":
        return <TagManager />;
      case "albums":
        return <AlbumManager />;
      case "map":
        return <MapView />;
      default:
        return <DashboardView />;
    }
  };

  return (
    <div className="flex flex-col h-screen bg-bg-primary">
      <TitleBar />
      <div className="flex flex-1 overflow-hidden">
        {!FULL_WIDTH_VIEWS.has(currentView) && <Sidebar />}
        <main className="flex-1 flex flex-col overflow-hidden">
          {renderMainContent()}
        </main>
      </div>
    </div>
  );
}

export default App;
