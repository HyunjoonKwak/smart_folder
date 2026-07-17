import { useTranslation } from "react-i18next";
import { useAppStore } from "@/stores/appStore";
import { AreaTabs } from "@/components/layout/AreaTabs";
import { GalleryGrid } from "@/components/gallery/GalleryGrid";
import { MapView } from "@/components/map/MapView";

/**
 * 라이브러리 — 모든 사진·영상 탐색.
 * 격자/리스트/지도는 별도 화면이 아니라 보기 방식 탭이다.
 */
export function LibraryView() {
  const { t } = useTranslation();
  const currentView = useAppStore((s) => s.currentView);
  const setCurrentView = useAppStore((s) => s.setCurrentView);
  const viewMode = useAppStore((s) => s.viewMode);
  const setViewMode = useAppStore((s) => s.setViewMode);

  const activeTab = currentView === "map" ? "map" : viewMode;

  const tabs = [
    { id: "grid", label: t("libraryView.grid") },
    { id: "list", label: t("libraryView.list") },
    { id: "map", label: t("libraryView.map") },
  ];

  const onSelect = (id: string) => {
    if (id === "map") {
      setCurrentView("map");
      return;
    }
    setViewMode(id as "grid" | "list");
    if (currentView !== "gallery") setCurrentView("gallery");
  };

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <div className="px-4 pt-3 pb-2 border-b border-border shrink-0 flex items-center gap-3">
        <AreaTabs tabs={tabs} activeId={activeTab} onSelect={onSelect} />
      </div>
      <div className="flex-1 flex flex-col overflow-hidden">
        {currentView === "map" ? <MapView /> : <GalleryGrid />}
      </div>
    </div>
  );
}
