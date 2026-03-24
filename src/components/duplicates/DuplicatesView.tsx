import { useState, useEffect, useCallback, useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";
import { formatFileSize, formatDate } from "@/utils/format";
import { useDuplicateProgress } from "@/hooks/useTauriEvents";
import {
  Copy,
  Search,
  Check,
  Trash2,
  Shield,
  Layers,
  TrendingDown,
  FileImage,
  Eye,
  FolderOpen,
  AlertTriangle,
  SkipForward,
} from "lucide-react";

interface DupMember {
  media_id: string;
  is_preferred: boolean;
  file_path: string;
  file_name: string;
  file_size: number;
  width: number | null;
  height: number | null;
  date_taken: string | null;
}

interface DupGroup {
  id: string;
  match_type: string;
  similarity_score: number | null;
  members: DupMember[];
}

interface DupSummary {
  groups: DupGroup[];
  total_groups: number;
  total_duplicates: number;
  total_savings: number;
  total_files_in_groups: number;
}

interface TrashResult {
  success: number;
  failed: number;
  errors: string[];
}

export function DuplicatesView() {
  const [summary, setSummary] = useState<DupSummary | null>(null);
  const [selectedGroup, setSelectedGroup] = useState<DupGroup | null>(null);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [scanning, setScanning] = useState(false);
  const [trashing, setTrashing] = useState(false);
  const [trashResult, setTrashResult] = useState<string | null>(null);
  const dupProgress = useDuplicateProgress();

  const loadGroups = async () => {
    try {
      const result = await invoke<DupSummary>("get_duplicate_groups");
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

  const handleScan = async () => {
    setScanning(true);
    setSummary(null);
    setSelectedGroup(null);
    setTrashResult(null);
    try {
      await invoke("detect_duplicates");
      await loadGroups();
    } catch {
      // Handle error
    }
    setScanning(false);
  };

  const handlePreview = async (path: string) => {
    await invoke("preview_file", { path });
  };

  const handleOpenFile = async (path: string) => {
    await invoke("open_file", { path });
  };

  // Change which file to keep in a group
  const handleSetPreferred = async (groupId: string, mediaId: string) => {
    try {
      await invoke("set_preferred_member", { groupId, mediaId });
      const result = await invoke<DupSummary>("get_duplicate_groups");
      setSummary(result);
      const updated = result.groups.find((g) => g.id === groupId);
      if (updated) {
        setSelectedGroup(updated);
      }
    } catch {
      // Handle error
    }
  };

  // Skip this group (keep all, remove from list)
  const handleDismissGroup = async (groupId: string) => {
    try {
      await invoke("dismiss_duplicate_group", { groupId });
      const result = await invoke<DupSummary>("get_duplicate_groups");
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

  // Trash non-preferred files in a single group
  const handleTrashGroup = async (group: DupGroup) => {
    const toDelete = group.members.filter((m) => !m.is_preferred);
    if (toDelete.length === 0) return;
    const confirmed = confirm(
      `이 그룹에서 ${toDelete.length}개 파일을 휴지통으로 이동합니다.\n` +
      `(${formatFileSize(toDelete.reduce((s, m) => s + m.file_size, 0))} 절약)\n\n계속하시겠습니까?`
    );
    if (!confirmed) return;

    setTrashing(true);
    try {
      const result = await invoke<TrashResult>("trash_group_duplicates", { groupId: group.id });
      setTrashResult(
        `${result.success}개 파일 휴지통 이동 완료` +
        (result.failed > 0 ? ` (${result.failed}개 실패)` : "")
      );
      await loadGroups();
    } catch {
      setTrashResult("휴지통 이동 실패");
    }
    setTrashing(false);
  };

  // Trash all non-preferred files across all groups
  const handleTrashAll = async () => {
    if (!summary || summary.groups.length === 0) return;
    const confirmed = confirm(
      `${summary.total_duplicates}개 중복 파일을 휴지통으로 이동합니다.\n` +
      `${formatFileSize(summary.total_savings)} 용량이 확보됩니다.\n\n` +
      `각 그룹에서 "유지" 표시된 파일만 남고,\n"삭제 예정" 파일이 휴지통으로 이동됩니다.\n\n계속하시겠습니까?`
    );
    if (!confirmed) return;

    setTrashing(true);
    setTrashResult(null);
    try {
      const result = await invoke<TrashResult>("trash_duplicate_files");
      setTrashResult(
        `${result.success}개 파일 휴지통으로 이동 완료` +
        (result.failed > 0 ? ` (${result.failed}개 실패)` : "")
      );
      await loadGroups();
    } catch {
      setTrashResult("휴지통 이동 실패");
    }
    setTrashing(false);
  };

  // Stats: files marked for deletion
  const deleteStats = useMemo(() => {
    if (!summary) return { count: 0, size: 0 };
    let count = 0;
    let size = 0;
    for (const group of summary.groups) {
      for (const member of group.members) {
        if (!member.is_preferred) {
          count++;
          size += member.file_size;
        }
      }
    }
    return { count, size };
  }, [summary]);

  // Keyboard shortcuts
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!summary || !selectedGroup) return;
      const groups = summary.groups;

      if (e.code === "Space") {
        e.preventDefault();
        if (selectedGroup.members.length > 0) {
          handlePreview(selectedGroup.members[0].file_path);
        }
      }
      if (e.code === "ArrowDown" || e.code === "KeyJ") {
        e.preventDefault();
        const next = Math.min(selectedIdx + 1, groups.length - 1);
        setSelectedIdx(next);
        setSelectedGroup(groups[next]);
      }
      if (e.code === "ArrowUp" || e.code === "KeyK") {
        e.preventDefault();
        const prev = Math.max(selectedIdx - 1, 0);
        setSelectedIdx(prev);
        setSelectedGroup(groups[prev]);
      }
    },
    [summary, selectedGroup, selectedIdx]
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
          <Copy size={20} className="text-accent" />
          <h2 className="text-sm font-semibold text-text-primary">중복 탐지</h2>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-text-secondary">
            Space: 미리보기 · ↑↓: 그룹 이동
          </span>
          {scanning && dupProgress && dupProgress.phase !== "complete" && dupProgress.total > 0 && (
            <div className="flex items-center gap-2 mr-2">
              <div className="w-32 h-1.5 bg-bg-primary rounded-full overflow-hidden">
                <div
                  className="h-full bg-accent rounded-full transition-all duration-300"
                  style={{ width: `${(dupProgress.current / dupProgress.total) * 100}%` }}
                />
              </div>
              <span className="text-[10px] text-text-secondary whitespace-nowrap">
                {dupProgress.phase} {dupProgress.current.toLocaleString()}/{dupProgress.total.toLocaleString()}
              </span>
            </div>
          )}
          <button
            onClick={handleScan}
            disabled={scanning}
            className="flex items-center gap-2 px-4 py-2 rounded-md text-xs font-medium bg-accent text-white hover:bg-accent-hover disabled:opacity-50 transition-colors"
          >
            {scanning ? (
              <>
                <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                스캔 중...
              </>
            ) : (
              <>
                <Search size={14} />
                중복 스캔
              </>
            )}
          </button>
        </div>
      </div>

      {/* Summary cards + action bar */}
      {summary && summary.total_groups > 0 && (
        <div className="p-3 border-b border-border bg-bg-secondary/50">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-4 flex-1 text-xs">
              <span className="text-text-secondary">
                <strong className="text-text-primary">{summary.total_groups}</strong> 그룹
              </span>
              <span className="text-text-secondary">
                <strong className="text-text-primary">{summary.total_files_in_groups}</strong> 파일
              </span>
              <span className="text-danger">
                <Trash2 size={11} className="inline mr-0.5 -mt-0.5" />
                <strong>{deleteStats.count}</strong>개 삭제 예정
              </span>
              <span className="text-success">
                <TrendingDown size={11} className="inline mr-0.5 -mt-0.5" />
                <strong>{formatFileSize(deleteStats.size)}</strong> 절약
              </span>
            </div>
            <button
              onClick={handleTrashAll}
              disabled={trashing || deleteStats.count === 0}
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
                  {deleteStats.count}개 휴지통으로 이동
                </>
              )}
            </button>
          </div>
          {trashResult && (
            <p className="text-xs text-success mt-2">{trashResult}</p>
          )}
        </div>
      )}

      {/* Scanning state */}
      {scanning ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center max-w-sm">
            <div className="w-10 h-10 mx-auto mb-4 border-3 border-accent border-t-transparent rounded-full animate-spin" />
            {dupProgress && dupProgress.total > 0 ? (
              <>
                <p className="text-sm font-medium text-text-primary mb-3">
                  {dupProgress.phase}
                </p>
                <div className="w-72 h-2.5 bg-bg-secondary rounded-full overflow-hidden mx-auto mb-2">
                  <div
                    className="h-full bg-accent rounded-full transition-all duration-300"
                    style={{ width: `${(dupProgress.current / dupProgress.total) * 100}%` }}
                  />
                </div>
                <p className="text-xs text-text-secondary mb-1">
                  {dupProgress.current.toLocaleString()} / {dupProgress.total.toLocaleString()}
                  <span className="ml-2 text-accent font-medium">
                    {Math.round((dupProgress.current / dupProgress.total) * 100)}%
                  </span>
                </p>
                {dupProgress.detail && (
                  <p className="text-[10px] text-text-secondary/70 mt-2">
                    {dupProgress.detail}
                  </p>
                )}
              </>
            ) : (
              <>
                <p className="text-sm font-medium text-text-primary mb-1">
                  중복 파일 탐색 준비 중...
                </p>
                <p className="text-xs text-text-secondary">
                  전체 파일 크기 분석 중
                </p>
              </>
            )}
          </div>
        </div>
      ) : groups.length === 0 ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center text-text-secondary">
            <Copy size={48} className="mx-auto mb-3 opacity-30" />
            <p className="text-sm">중복 파일이 없습니다</p>
            <p className="text-xs mt-1">"중복 스캔"을 눌러 중복 파일을 찾으세요</p>
            <p className="text-[10px] mt-1 text-text-secondary/50">100KB 이하 파일은 제외됩니다</p>
          </div>
        </div>
      ) : groups.length > 0 ? (
        <div className="flex-1 flex overflow-hidden">
          {/* Group list */}
          <div className="w-64 border-r border-border overflow-y-auto">
            {groups.map((group, idx) => {
              const toDelete = group.members.filter((m) => !m.is_preferred).length;
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
                    <span
                      className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                        group.match_type === "exact"
                          ? "bg-danger/10 text-danger"
                          : "bg-warning/10 text-warning"
                      }`}
                    >
                      {group.match_type === "exact" ? "완전 일치" : "유사"}
                    </span>
                  </div>
                  <p className="text-[10px] text-text-secondary mt-1 truncate">
                    {group.members[0]?.file_name}
                  </p>
                  <p className="text-[10px] mt-1">
                    <span className="text-success">유지 1개</span>
                    <span className="text-text-secondary"> · </span>
                    <span className="text-danger">삭제 {toDelete}개</span>
                  </p>
                </button>
              );
            })}
          </div>

          {/* Detail view */}
          {selectedGroup && (
            <div className="flex-1 p-4 overflow-y-auto">
              {/* Group header */}
              <div className="flex items-center gap-2 mb-2">
                <AlertTriangle size={16} className="text-warning" />
                <span className="text-sm font-medium text-text-primary">
                  {selectedGroup.match_type === "exact"
                    ? `완전 동일 파일 (${selectedGroup.members.length}개)`
                    : `유사 이미지 (${Math.round((selectedGroup.similarity_score ?? 0) * 100)}% 일치)`}
                </span>
              </div>

              {/* Explanation */}
              <p className="text-[10px] text-text-secondary mb-4 bg-bg-secondary/50 rounded-md px-3 py-2">
                <Shield size={10} className="inline text-success mr-1 -mt-0.5" />
                <strong className="text-success">유지</strong> 표시된 파일은 남기고,
                <Trash2 size={10} className="inline text-danger mx-1 -mt-0.5" />
                <strong className="text-danger">삭제 예정</strong> 파일은 상단
                &quot;휴지통으로 이동&quot; 시 삭제됩니다.
                다른 파일을 남기려면 해당 파일의 &quot;이것을 유지&quot;를 누르세요.
              </p>

              {/* Member list */}
              <div className="space-y-2">
                {selectedGroup.members.map((member, memberIdx) => (
                  <div
                    key={member.media_id}
                    className={`rounded-lg border p-3 transition-colors ${
                      member.is_preferred
                        ? "border-success bg-success/5"
                        : "border-danger/30 bg-danger/5"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      {/* Number + status badge */}
                      <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${
                        member.is_preferred ? "bg-success text-white" : "bg-danger/20 text-danger"
                      }`}>
                        {member.is_preferred ? (
                          <Check size={14} />
                        ) : (
                          <Trash2 size={12} />
                        )}
                      </div>

                      {/* File icon */}
                      <div className={`w-10 h-10 rounded-md flex items-center justify-center shrink-0 ${
                        member.is_preferred ? "bg-success/10" : "bg-danger/10"
                      }`}>
                        <FileImage size={20} className={member.is_preferred ? "text-success" : "text-danger/50"} />
                      </div>

                      {/* File info */}
                      <div className="flex-1 min-w-0">
                        <p className={`text-xs font-medium truncate ${
                          member.is_preferred ? "text-text-primary" : "text-text-secondary line-through decoration-danger/30"
                        }`}>
                          {member.file_name}
                        </p>
                        <p className="text-[10px] text-text-secondary truncate">
                          {member.file_path}
                        </p>
                        <div className="flex gap-3 mt-1 text-[10px] text-text-secondary">
                          <span>{formatFileSize(member.file_size)}</span>
                          {member.width && member.height && (
                            <span>{member.width}x{member.height}</span>
                          )}
                          {member.date_taken && (
                            <span>{formatDate(member.date_taken)}</span>
                          )}
                        </div>
                      </div>

                      {/* Status label */}
                      <div className="shrink-0">
                        {member.is_preferred ? (
                          <span className="flex items-center gap-1 text-[10px] text-success font-bold bg-success/10 px-2.5 py-1 rounded-full">
                            <Shield size={10} /> 유지
                          </span>
                        ) : (
                          <span className="flex items-center gap-1 text-[10px] text-danger font-bold bg-danger/10 px-2.5 py-1 rounded-full">
                            <Trash2 size={10} /> 삭제 예정
                          </span>
                        )}
                      </div>

                      {/* Actions */}
                      <div className="flex gap-1 shrink-0">
                        {!member.is_preferred && (
                          <button
                            onClick={() => handleSetPreferred(selectedGroup.id, member.media_id)}
                            className="px-2.5 py-1 rounded text-[10px] font-medium bg-accent text-white hover:bg-accent-hover transition-colors"
                          >
                            이것을 유지
                          </button>
                        )}
                        <button
                          onClick={() => handlePreview(member.file_path)}
                          className="p-1.5 rounded hover:bg-bg-secondary transition-colors"
                          title="미리보기"
                        >
                          <Eye size={14} className="text-text-secondary" />
                        </button>
                        <button
                          onClick={() => handleOpenFile(member.file_path)}
                          className="p-1.5 rounded hover:bg-bg-secondary transition-colors"
                          title="Finder에서 보기"
                        >
                          <FolderOpen size={14} className="text-text-secondary" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Group actions */}
              <div className="mt-4 flex gap-2">
                <button
                  onClick={() => handleTrashGroup(selectedGroup)}
                  disabled={trashing || selectedGroup.members.filter((m) => !m.is_preferred).length === 0}
                  className="flex items-center justify-center gap-1.5 flex-1 py-2 rounded-md text-xs font-medium bg-danger/10 text-danger hover:bg-danger/20 disabled:opacity-50 transition-colors"
                >
                  <Trash2 size={12} />
                  이 그룹 삭제 예정 파일 휴지통으로
                </button>
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
      ) : null}
    </div>
  );
}
