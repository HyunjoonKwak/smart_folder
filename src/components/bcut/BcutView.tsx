import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { formatFileSize, formatDate } from "@/utils/format";
import {
  Focus,
  Search,
  Check,
  Trash2,
  Shield,
  Eye,
  FolderOpen,
  SkipForward,
  Sparkles,
} from "lucide-react";

interface BcutMember {
  media_id: string;
  file_path: string;
  file_name: string;
  file_size: number;
  width: number | null;
  height: number | null;
  thumbnail: string | null;
  date_taken: string | null;
  quality_score: number;
  sharpness_score: number;
  exposure_score: number;
  is_best: boolean;
}

interface BcutGroup {
  id: string;
  group_reason: string;
  status: string;
  members: BcutMember[];
}

interface BcutSummary {
  total_groups: number;
  total_bcuts: number;
  groups: BcutGroup[];
}

interface TrashResult {
  success: number;
  failed: number;
  errors: string[];
}

interface BcutProgress {
  phase: string;
  current: number;
  total: number;
}

export function BcutView() {
  const [summary, setSummary] = useState<BcutSummary | null>(null);
  const [selectedGroup, setSelectedGroup] = useState<BcutGroup | null>(null);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [scanning, setScanning] = useState(false);
  const [trashing, setTrashing] = useState(false);
  const [trashResult, setTrashResult] = useState<string | null>(null);
  const [progress, setProgress] = useState<BcutProgress | null>(null);
  const [timeGap, setTimeGap] = useState(5);

  useEffect(() => {
    const unlisten = listen<BcutProgress>("bcut-progress", (e) => {
      setProgress(e.payload);
    });
    return () => { unlisten.then((f) => f()); };
  }, []);

  const loadGroups = async () => {
    try {
      const result = await invoke<BcutSummary>("get_bcut_groups");
      setSummary(result);
      if (result.groups.length > 0) {
        setSelectedGroup(result.groups[0]);
        setSelectedIdx(0);
      } else {
        setSelectedGroup(null);
        setSelectedIdx(0);
      }
    } catch {
      // Handle error
    }
  };

  const handleDetect = async () => {
    setScanning(true);
    setSummary(null);
    setSelectedGroup(null);
    setTrashResult(null);
    try {
      await invoke("detect_bcuts", { timeGapSeconds: timeGap });
      await loadGroups();
    } catch {
      // Handle error
    }
    setScanning(false);
    setProgress(null);
  };

  const handlePreview = async (path: string) => {
    await invoke("preview_file", { path });
  };

  const handleOpenFile = async (path: string) => {
    await invoke("open_file", { path });
  };

  const handleSetBest = async (groupId: string, mediaId: string) => {
    try {
      await invoke("set_bcut_best", { groupId, mediaId });
      const result = await invoke<BcutSummary>("get_bcut_groups");
      setSummary(result);
      const updated = result.groups.find((g) => g.id === groupId);
      if (updated) setSelectedGroup(updated);
    } catch {
      // Handle error
    }
  };

  const handleDismissGroup = async (groupId: string) => {
    try {
      await invoke("dismiss_bcut_group", { groupId });
      const result = await invoke<BcutSummary>("get_bcut_groups");
      setSummary(result);
      if (result.groups.length > 0) {
        const nextIdx = Math.min(selectedIdx, result.groups.length - 1);
        setSelectedGroup(result.groups[nextIdx]);
        setSelectedIdx(nextIdx);
      } else {
        setSelectedGroup(null);
        setSelectedIdx(0);
      }
    } catch {
      // Handle error
    }
  };

  const handleTrashAll = async () => {
    if (!summary || summary.total_bcuts === 0) return;
    setTrashing(true);
    setTrashResult(null);
    try {
      const result = await invoke<TrashResult>("trash_bcut_files");
      setTrashResult(
        `${result.success}개 B컷 휴지통 이동 완료` +
          (result.failed > 0 ? ` (${result.failed}개 실패)` : ""),
      );
      await loadGroups();
    } catch {
      setTrashResult("휴지통 이동 실패");
    }
    setTrashing(false);
  };

  // Keyboard navigation
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!summary || !selectedGroup) return;
      const { groups } = summary;

      if (e.key === "ArrowDown" || e.key === "j") {
        e.preventDefault();
        const next = Math.min(selectedIdx + 1, groups.length - 1);
        setSelectedGroup(groups[next]);
        setSelectedIdx(next);
      } else if (e.key === "ArrowUp" || e.key === "k") {
        e.preventDefault();
        const prev = Math.max(selectedIdx - 1, 0);
        setSelectedGroup(groups[prev]);
        setSelectedIdx(prev);
      } else if (e.key === "s") {
        e.preventDefault();
        handleDismissGroup(selectedGroup.id);
      } else if (e.code === "Space") {
        e.preventDefault();
        if (selectedGroup.members.length > 0) {
          handlePreview(selectedGroup.members[0].file_path);
        }
      } else if (e.key >= "1" && e.key <= "9") {
        const idx = parseInt(e.key) - 1;
        if (idx < selectedGroup.members.length) {
          handleSetBest(selectedGroup.id, selectedGroup.members[idx].media_id);
        }
      }
    },
    [summary, selectedGroup, selectedIdx],
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  useEffect(() => {
    loadGroups();
  }, []);

  const groups = summary?.groups ?? [];

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="p-3 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Focus size={20} className="text-accent" />
          <h2 className="text-sm font-semibold text-text-primary">B컷 정리</h2>
        </div>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-1.5 text-[10px] text-text-secondary">
            시간 간격
            <select
              value={timeGap}
              onChange={(e) => setTimeGap(Number(e.target.value))}
              className="bg-bg-secondary border border-border rounded px-1.5 py-0.5 text-[10px]"
            >
              <option value={2}>2초</option>
              <option value={5}>5초</option>
              <option value={10}>10초</option>
              <option value={30}>30초</option>
              <option value={60}>1분</option>
            </select>
          </label>
          <button
            onClick={handleDetect}
            disabled={scanning}
            className="flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium bg-accent text-white hover:bg-accent-hover disabled:opacity-50 transition-colors"
          >
            {scanning ? (
              <>
                <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                분석 중...
              </>
            ) : (
              <>
                <Search size={13} />
                B컷 분석
              </>
            )}
          </button>
        </div>
      </div>

      {/* Progress */}
      {scanning && progress && (
        <div className="px-4 py-2 border-b border-border bg-bg-secondary/50">
          <div className="flex items-center justify-between text-[10px] text-text-secondary mb-1">
            <span>
              {progress.phase === "grouping"
                ? "시간 기반 그룹화 중..."
                : `품질 분석 중... (${progress.current}/${progress.total})`}
            </span>
            {progress.total > 0 && (
              <span>
                {Math.round((progress.current / progress.total) * 100)}%
              </span>
            )}
          </div>
          {progress.total > 0 && (
            <div className="w-full h-1 bg-bg-secondary rounded-full overflow-hidden">
              <div
                className="h-full bg-accent transition-all"
                style={{
                  width: `${(progress.current / progress.total) * 100}%`,
                }}
              />
            </div>
          )}
        </div>
      )}

      {/* Summary bar */}
      {summary && summary.total_groups > 0 && (
        <div className="p-3 border-b border-border bg-bg-secondary/50">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-4 flex-1 text-xs">
              <span className="text-text-secondary">
                <strong className="text-text-primary">
                  {summary.total_groups}
                </strong>{" "}
                그룹
              </span>
              <span className="text-danger">
                <Trash2 size={11} className="inline mr-0.5 -mt-0.5" />
                <strong>{summary.total_bcuts}</strong>개 B컷
              </span>
            </div>
            <button
              onClick={handleTrashAll}
              disabled={trashing || summary.total_bcuts === 0}
              className="flex items-center gap-2 px-4 py-2 rounded-md text-xs font-medium bg-danger text-white hover:bg-danger/90 disabled:opacity-50 transition-colors"
            >
              {trashing ? (
                <>
                  <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  처리 중...
                </>
              ) : (
                <>
                  <Trash2 size={13} />
                  {summary.total_bcuts}개 B컷 휴지통으로
                </>
              )}
            </button>
          </div>
          {trashResult && (
            <p className="text-xs text-success mt-2">{trashResult}</p>
          )}
        </div>
      )}

      {/* Empty / No results */}
      {!scanning && (!summary || summary.total_groups === 0) && (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center max-w-sm">
            <Focus size={40} className="mx-auto mb-3 text-text-secondary/30" />
            <p className="text-sm text-text-primary font-medium mb-1">
              B컷 자동 탐지
            </p>
            <p className="text-[10px] text-text-secondary leading-relaxed mb-4">
              연속 촬영된 사진들을 그룹화하고
              <br />
              선명도·노출을 분석하여 베스트 컷을 자동 추천합니다.
              <br />
              <span className="text-text-secondary/60">
                (EXIF 촬영일시 기준, 이미지만 분석)
              </span>
            </p>
            {summary && summary.total_groups === 0 && (
              <p className="text-[10px] text-success">
                <Check size={12} className="inline mr-1" />
                B컷이 발견되지 않았습니다.
              </p>
            )}
          </div>
        </div>
      )}

      {/* Main content */}
      {summary && groups.length > 0 && (
        <div className="flex-1 flex overflow-hidden">
          {/* Group list */}
          <div className="w-64 border-r border-border overflow-y-auto">
            {groups.map((group, idx) => {
              const best = group.members.find((m) => m.is_best);
              const bcutCount = group.members.filter((m) => !m.is_best).length;
              return (
                <button
                  key={group.id}
                  onClick={() => {
                    setSelectedGroup(group);
                    setSelectedIdx(idx);
                  }}
                  className={`w-full p-3 text-left border-b border-border/50 transition-colors ${
                    selectedGroup?.id === group.id
                      ? "bg-accent/5 border-l-2 border-l-accent"
                      : "hover:bg-bg-secondary"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-text-primary">
                      그룹 {idx + 1}
                    </span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-accent/10 text-accent">
                      {group.members.length}장
                    </span>
                  </div>
                  <p className="text-[10px] text-text-secondary mt-1 truncate">
                    {best?.file_name ?? group.members[0]?.file_name}
                  </p>
                  <div className="flex items-center gap-2 mt-1 text-[10px]">
                    <span className="text-success">
                      <Sparkles size={9} className="inline mr-0.5" />
                      {Math.round(best?.quality_score ?? 0)}점
                    </span>
                    <span className="text-danger">B컷 {bcutCount}개</span>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Detail view */}
          {selectedGroup && (
            <div className="flex-1 p-4 overflow-y-auto">
              {/* Explanation */}
              <p className="text-[10px] text-text-secondary mb-3 bg-bg-secondary/50 rounded-md px-3 py-2">
                <Sparkles
                  size={10}
                  className="inline text-accent mr-1 -mt-0.5"
                />
                선명도·노출·해상도를 종합 평가하여 베스트 컷을 추천합니다.
                다른 사진을 선택하려면 &quot;베스트로 선택&quot;을 누르세요.
                <span className="text-text-secondary/60 ml-1">
                  단축키: 1-9 선택, S 건너뛰기, J/K 이동, Space 미리보기
                </span>
              </p>

              {/* Member grid */}
              <div className="grid grid-cols-2 xl:grid-cols-3 gap-3">
                {selectedGroup.members.map((member, mi) => (
                  <div
                    key={member.media_id}
                    className={`rounded-lg border overflow-hidden transition-colors ${
                      member.is_best
                        ? "border-success ring-2 ring-success/20"
                        : "border-border"
                    }`}
                  >
                    {/* Thumbnail */}
                    <div className="relative aspect-[4/3] bg-bg-secondary">
                      {member.thumbnail ? (
                        <img
                          src={`data:image/jpeg;base64,${member.thumbnail}`}
                          alt={member.file_name}
                          className={`w-full h-full object-cover ${!member.is_best ? "opacity-70" : ""}`}
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <Focus
                            size={24}
                            className="text-text-secondary/20"
                          />
                        </div>
                      )}

                      {/* Score badge */}
                      <div
                        className={`absolute top-2 left-2 px-2 py-1 rounded-md text-[10px] font-bold backdrop-blur-sm ${
                          member.is_best
                            ? "bg-success/90 text-white"
                            : "bg-black/60 text-white/80"
                        }`}
                      >
                        {member.is_best && (
                          <Shield
                            size={9}
                            className="inline mr-0.5 -mt-0.5"
                          />
                        )}
                        {Math.round(member.quality_score)}점
                      </div>

                      {/* Number */}
                      <div className="absolute top-2 right-2 w-5 h-5 rounded-full bg-black/50 text-white text-[9px] flex items-center justify-center font-bold backdrop-blur-sm">
                        {mi + 1}
                      </div>

                      {/* Action overlay */}
                      <div className="absolute bottom-2 right-2 flex gap-1">
                        <button
                          onClick={() => handlePreview(member.file_path)}
                          className="p-1.5 rounded-md bg-black/50 hover:bg-black/70 backdrop-blur-sm transition-colors"
                          title="미리보기"
                        >
                          <Eye size={12} className="text-white" />
                        </button>
                        <button
                          onClick={() => handleOpenFile(member.file_path)}
                          className="p-1.5 rounded-md bg-black/50 hover:bg-black/70 backdrop-blur-sm transition-colors"
                          title="Finder에서 보기"
                        >
                          <FolderOpen size={12} className="text-white" />
                        </button>
                      </div>
                    </div>

                    {/* Info */}
                    <div className="p-2.5">
                      <p
                        className={`text-[11px] font-medium truncate ${member.is_best ? "text-text-primary" : "text-text-secondary"}`}
                      >
                        {member.file_name}
                      </p>

                      {/* Score breakdown */}
                      <div className="mt-1.5 space-y-1">
                        <ScoreBar
                          label="선명도"
                          value={member.sharpness_score}
                          color="blue"
                        />
                        <ScoreBar
                          label="노출"
                          value={member.exposure_score}
                          color="amber"
                        />
                      </div>

                      <div className="flex gap-2 mt-1.5 text-[9px] text-text-secondary">
                        <span>{formatFileSize(member.file_size)}</span>
                        {member.width && member.height && (
                          <span>
                            {member.width}x{member.height}
                          </span>
                        )}
                        {member.date_taken && (
                          <span>{formatDate(member.date_taken)}</span>
                        )}
                      </div>

                      {/* Action button */}
                      {member.is_best ? (
                        <div className="mt-2 flex items-center justify-center gap-1 py-1.5 rounded-md text-[10px] font-bold text-success bg-success/10">
                          <Check size={11} />
                          베스트 컷
                        </div>
                      ) : (
                        <button
                          onClick={() =>
                            handleSetBest(
                              selectedGroup.id,
                              member.media_id,
                            )
                          }
                          className="mt-2 w-full py-1.5 rounded-md text-[10px] font-medium bg-accent text-white hover:bg-accent-hover transition-colors"
                        >
                          베스트로 선택
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {/* Group actions */}
              <div className="mt-4 flex gap-2">
                <button
                  onClick={() => handleDismissGroup(selectedGroup.id)}
                  className="flex items-center justify-center gap-1.5 flex-1 py-2 rounded-md text-xs font-medium bg-bg-secondary text-text-secondary hover:bg-bg-primary transition-colors"
                >
                  <SkipForward size={12} />
                  건너뛰기 (모두 유지)
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ScoreBar({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: "blue" | "amber";
}) {
  const bgClass = color === "blue" ? "bg-blue-500" : "bg-amber-500";
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[9px] text-text-secondary w-7 shrink-0">
        {label}
      </span>
      <div className="flex-1 h-1 bg-bg-secondary rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full ${bgClass}`}
          style={{ width: `${Math.min(value, 100)}%` }}
        />
      </div>
      <span className="text-[9px] text-text-secondary w-5 text-right shrink-0">
        {Math.round(value)}
      </span>
    </div>
  );
}
