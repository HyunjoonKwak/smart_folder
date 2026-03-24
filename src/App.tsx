import { useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useAppStore } from "@/stores/appStore";
import { useScanProgress } from "@/hooks/useTauriEvents";
import { TitleBar } from "@/components/layout/TitleBar";
import { Sidebar } from "@/components/sidebar/Sidebar";
import { GalleryGrid } from "@/components/gallery/GalleryGrid";
import { DuplicatesView } from "@/components/duplicates/DuplicatesView";
import { OrganizeView } from "@/components/organize/OrganizeView";
import { HistoryView } from "@/components/organize/HistoryView";
import { FolderTreeView } from "@/components/foldertree/FolderTreeView";
import type { AppView, MediaStats } from "@/types";

const FULL_WIDTH_VIEWS: ReadonlySet<AppView> = new Set(["foldertree"]);

function App() {
  const currentView = useAppStore((s) => s.currentView);
  const setStats = useAppStore((s) => s.setStats);

  useScanProgress();

  useEffect(() => {
    const loadStats = async () => {
      try {
        const stats = await invoke<MediaStats>("get_media_stats");
        setStats(stats);
      } catch {
        // DB not ready yet
      }
    };
    loadStats();
  }, [setStats]);

  const renderMainContent = () => {
    switch (currentView) {
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
      default:
        return <GalleryGrid />;
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
