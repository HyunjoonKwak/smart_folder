import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useTranslation } from "react-i18next";
import { useAppStore } from "@/stores/appStore";
import { formatFileSize, formatCount } from "@/utils/format";
import {
  Image,
  Video,
  HardDrive,
  Copy,
  ScanSearch,
  ArrowRightLeft,
  Sparkles,
  RefreshCw,
  FolderTree,
  FolderOpen,
  Tag,
  FolderHeart,
  MapPin,
  Clock,
  AlertTriangle,
} from "lucide-react";

interface QuickAction {
  id: string;
  label: string;
  desc: string;
  icon: typeof Copy;
  view: string;
  color: string;
}

export function DashboardView() {
  const { t } = useTranslation();
  const stats = useAppStore((s) => s.stats);
  const setCurrentView = useAppStore((s) => s.setCurrentView);
  const [recentFolders, setRecentFolders] = useState<
    { path: string; name: string; last_scanned_at: string | null }[]
  >([]);
  const [duplicateCount, setDuplicateCount] = useState<number | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        const folders = await invoke<any[]>("get_source_folders");
        setRecentFolders(folders.slice(0, 5));
      } catch {}
      try {
        const groups = await invoke<{ total_groups: number; total_duplicates: number }>(
          "get_duplicate_groups",
        );
        setDuplicateCount(groups.total_duplicates);
      } catch {}
    };
    load();
  }, []);

  const quickActions: QuickAction[] = [
    {
      id: "cleanup",
      label: t("nav.cleanup"),
      desc: "중복 → B컷 → 정리 자동 실행",
      icon: Sparkles,
      view: "cleanup",
      color: "text-purple-500 bg-purple-500/10",
    },
    {
      id: "duplicates",
      label: t("nav.duplicates"),
      desc: "동일/유사 파일 탐지 및 삭제",
      icon: Copy,
      view: "duplicates",
      color: "text-orange-500 bg-orange-500/10",
    },
    {
      id: "review",
      label: t("tools.photoReview"),
      desc: "수동 검토 + 자동 분석 지원",
      icon: ScanSearch,
      view: "review",
      color: "text-cyan-500 bg-cyan-500/10",
    },
    {
      id: "organize",
      label: t("nav.organize"),
      desc: "날짜/유형별 폴더 자동 분류",
      icon: ArrowRightLeft,
      view: "organize",
      color: "text-green-500 bg-green-500/10",
    },
    {
      id: "sync",
      label: t("nav.sync"),
      desc: "소스 → 대상 단방향 동기화",
      icon: RefreshCw,
      view: "sync",
      color: "text-blue-500 bg-blue-500/10",
    },
    {
      id: "foldertree",
      label: t("nav.folder"),
      desc: "용량 분석, 구조 탐색, 비교",
      icon: FolderTree,
      view: "foldertree",
      color: "text-amber-500 bg-amber-500/10",
    },
  ];

  return (
    <div className="flex-1 overflow-y-auto bg-bg-primary">
      <div className="max-w-4xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-xl font-bold text-text-primary">
            {t("app.name")}
          </h1>
          <p className="text-[12px] text-text-secondary mt-1">
            미디어 라이브러리 현황 및 빠른 실행
          </p>
        </div>

        {/* Stats cards */}
        <div className="grid grid-cols-4 gap-3 mb-8">
          <StatCard
            icon={<HardDrive size={18} />}
            label="전체 파일"
            value={stats ? formatCount(stats.total_count) : "—"}
            sub={stats ? formatFileSize(stats.total_size) : ""}
            color="text-accent bg-accent/10"
          />
          <StatCard
            icon={<Image size={18} />}
            label="사진"
            value={stats ? formatCount(stats.image_count) : "—"}
            color="text-green-500 bg-green-500/10"
          />
          <StatCard
            icon={<Video size={18} />}
            label="영상"
            value={stats ? formatCount(stats.video_count) : "—"}
            color="text-purple-500 bg-purple-500/10"
          />
          <StatCard
            icon={<AlertTriangle size={18} />}
            label="중복 파일"
            value={duplicateCount !== null ? String(duplicateCount) : "—"}
            sub={duplicateCount && duplicateCount > 0 ? "정리 필요" : ""}
            color={
              duplicateCount && duplicateCount > 0
                ? "text-danger bg-danger/10"
                : "text-success bg-success/10"
            }
            onClick={() => setCurrentView("duplicates" as any)}
          />
        </div>

        {/* Quick actions */}
        <div className="mb-8">
          <h2 className="text-[13px] font-semibold text-text-primary mb-3">
            빠른 실행
          </h2>
          <div className="grid grid-cols-3 gap-3">
            {quickActions.map((action) => (
              <button
                key={action.id}
                onClick={() => setCurrentView(action.view as any)}
                className="flex items-start gap-3 p-4 rounded-xl border border-border bg-bg-secondary/30 hover:bg-bg-secondary/60 hover:border-accent/30 transition-all text-left group"
              >
                <div
                  className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${action.color}`}
                >
                  <action.icon size={18} />
                </div>
                <div className="min-w-0">
                  <p className="text-[12px] font-semibold text-text-primary group-hover:text-accent transition-colors">
                    {action.label}
                  </p>
                  <p className="text-[10px] text-text-secondary mt-0.5 leading-relaxed">
                    {action.desc}
                  </p>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Bottom row: Sources + Browse shortcuts */}
        <div className="grid grid-cols-2 gap-6">
          {/* Recent sources */}
          <div>
            <h2 className="text-[13px] font-semibold text-text-primary mb-3">
              소스 폴더
            </h2>
            {recentFolders.length === 0 ? (
              <div className="text-center py-8 text-[11px] text-text-secondary border border-dashed border-border rounded-xl">
                사이드바에서 폴더를 추가하세요
              </div>
            ) : (
              <div className="space-y-1.5">
                {recentFolders.map((f) => (
                  <div
                    key={f.path}
                    className="flex items-center gap-2.5 px-3 py-2 rounded-lg border border-border/50 bg-bg-secondary/20 hover:bg-bg-secondary/50 transition-colors cursor-pointer"
                    onClick={() => {
                      useAppStore.getState().setSelectedFolder(f.path);
                      useAppStore.getState().setCurrentView("gallery");
                    }}
                  >
                    <FolderOpen size={14} className="text-accent shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-[11px] font-medium text-text-primary truncate">
                        {f.name}
                      </p>
                      <p className="text-[9px] text-text-secondary truncate">
                        {f.path}
                      </p>
                    </div>
                    {f.last_scanned_at && (
                      <span className="flex items-center gap-1 text-[9px] text-text-secondary/50 shrink-0">
                        <Clock size={9} />
                        {f.last_scanned_at.slice(0, 10)}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Browse shortcuts */}
          <div>
            <h2 className="text-[13px] font-semibold text-text-primary mb-3">
              라이브러리 탐색
            </h2>
            <div className="space-y-1.5">
              {[
                {
                  icon: Image,
                  label: "모든 파일",
                  count: stats?.total_count,
                  action: () => {
                    useAppStore.getState().setMediaFilter("all");
                    useAppStore.getState().setGroupBy("none");
                    setCurrentView("gallery" as any);
                  },
                },
                {
                  icon: Image,
                  label: "사진만",
                  count: stats?.image_count,
                  action: () => {
                    useAppStore.getState().setMediaFilter("image");
                    setCurrentView("gallery" as any);
                  },
                },
                {
                  icon: Video,
                  label: "영상만",
                  count: stats?.video_count,
                  action: () => {
                    useAppStore.getState().setMediaFilter("video");
                    setCurrentView("gallery" as any);
                  },
                },
                {
                  icon: Tag,
                  label: "태그",
                  action: () => setCurrentView("tags" as any),
                },
                {
                  icon: FolderHeart,
                  label: "앨범",
                  action: () => setCurrentView("albums" as any),
                },
                {
                  icon: MapPin,
                  label: "사진 지도",
                  action: () => setCurrentView("map" as any),
                },
              ].map((item) => (
                <button
                  key={item.label}
                  onClick={item.action}
                  className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg border border-border/50 bg-bg-secondary/20 hover:bg-bg-secondary/50 transition-colors text-left"
                >
                  <item.icon size={14} className="text-text-secondary shrink-0" />
                  <span className="flex-1 text-[11px] text-text-primary">
                    {item.label}
                  </span>
                  {item.count !== undefined && (
                    <span className="text-[10px] text-text-secondary tabular-nums">
                      {formatCount(item.count)}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  sub,
  color,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
  color: string;
  onClick?: () => void;
}) {
  return (
    <div
      onClick={onClick}
      className={`rounded-xl border border-border p-4 bg-bg-secondary/20 ${onClick ? "cursor-pointer hover:border-accent/30 hover:bg-bg-secondary/50" : ""} transition-all`}
    >
      <div className={`w-8 h-8 rounded-lg flex items-center justify-center mb-3 ${color}`}>
        {icon}
      </div>
      <p className="text-[10px] text-text-secondary">{label}</p>
      <p className="text-lg font-bold text-text-primary tabular-nums mt-0.5">
        {value}
      </p>
      {sub && <p className="text-[9px] text-text-secondary mt-0.5">{sub}</p>}
    </div>
  );
}
