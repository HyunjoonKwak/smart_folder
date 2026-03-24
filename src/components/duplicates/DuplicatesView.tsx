import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { formatFileSize, formatDate } from "@/utils/format";
import { useDuplicateProgress } from "@/hooks/useTauriEvents";
import {
  Copy,
  Search,
  Check,
  Trash2,
  AlertTriangle,
  Layers,
  TrendingDown,
  FileImage,
  Eye,
  FolderOpen,
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

export function DuplicatesView() {
  const [summary, setSummary] = useState<DupSummary | null>(null);
  const [selectedGroup, setSelectedGroup] = useState<DupGroup | null>(null);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [scanning, setScanning] = useState(false);
  const dupProgress = useDuplicateProgress();

  const loadGroups = async () => {
    try {
      const result = await invoke<DupSummary>("get_duplicate_groups");
      setSummary(result);
      if (result.groups.length > 0) {
        setSelectedGroup(result.groups[0]);
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

  // Keyboard shortcuts
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!summary || !selectedGroup) return;
      const groups = summary.groups;

      if (e.code === "Space") {
        e.preventDefault();
        // Preview the first member of selected group
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
      <div className="p-4 border-b border-border flex items-center justify-between">
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

      {/* Summary */}
      {summary && summary.total_groups > 0 && (
        <div className="p-4 border-b border-border bg-bg-secondary/50">
          <div className="grid grid-cols-4 gap-3">
            <div className="rounded-lg border border-border bg-bg-primary p-3 text-center">
              <p className="text-xl font-bold text-text-primary">{summary.total_groups}</p>
              <p className="text-[10px] text-text-secondary">중복 그룹</p>
            </div>
            <div className="rounded-lg border border-border bg-bg-primary p-3 text-center">
              <p className="text-xl font-bold text-text-primary">{summary.total_files_in_groups}</p>
              <p className="text-[10px] text-text-secondary">관련 파일</p>
            </div>
            <div className="rounded-lg border border-border bg-bg-primary p-3 text-center">
              <Layers size={16} className="mx-auto mb-0.5 text-danger" />
              <p className="text-xl font-bold text-danger">{summary.total_duplicates}</p>
              <p className="text-[10px] text-text-secondary">삭제 가능</p>
            </div>
            <div className="rounded-lg border border-border bg-bg-primary p-3 text-center">
              <TrendingDown size={16} className="mx-auto mb-0.5 text-success" />
              <p className="text-xl font-bold text-success">{formatFileSize(summary.total_savings)}</p>
              <p className="text-[10px] text-text-secondary">절약 가능</p>
            </div>
          </div>
        </div>
      )}

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
            {groups.map((group, idx) => (
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
                <p className="text-[10px] text-text-secondary mt-1">
                  {group.members.length}개 ·{" "}
                  {formatFileSize(group.members.reduce((s, m) => s + m.file_size, 0))}
                </p>
                <p className="text-[10px] text-text-secondary truncate mt-0.5">
                  {group.members[0]?.file_name}
                </p>
              </button>
            ))}
          </div>

          {/* Comparison view */}
          {selectedGroup && (
            <div className="flex-1 p-4 overflow-y-auto">
              <div className="flex items-center gap-2 mb-4">
                <AlertTriangle size={16} className="text-warning" />
                <span className="text-sm font-medium text-text-primary">
                  {selectedGroup.match_type === "exact"
                    ? `완전 동일 파일 (${selectedGroup.members.length}개)`
                    : `유사 이미지 (${Math.round((selectedGroup.similarity_score ?? 0) * 100)}% 일치)`}
                </span>
                <span className="text-xs text-text-secondary ml-auto">
                  절약: {formatFileSize(
                    selectedGroup.members.filter((m) => !m.is_preferred).reduce((s, m) => s + m.file_size, 0)
                  )}
                </span>
              </div>

              <div className="space-y-2">
                {selectedGroup.members.map((member) => (
                  <div
                    key={member.media_id}
                    className={`rounded-lg border p-3 flex items-center gap-3 ${
                      member.is_preferred
                        ? "border-success bg-success/5"
                        : "border-danger/30 bg-danger/5"
                    }`}
                  >
                    {/* File icon + status */}
                    <div className={`w-10 h-10 rounded-md flex items-center justify-center shrink-0 ${
                      member.is_preferred ? "bg-success/10" : "bg-danger/10"
                    }`}>
                      <FileImage size={20} className={member.is_preferred ? "text-success" : "text-danger"} />
                    </div>

                    {/* File info */}
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-text-primary truncate">
                        {member.file_name}
                      </p>
                      <p className="text-[10px] text-text-secondary truncate">
                        {member.file_path}
                      </p>
                      <div className="flex gap-3 mt-1 text-[10px] text-text-secondary">
                        <span>{formatFileSize(member.file_size)}</span>
                        {member.width && member.height && (
                          <span>{member.width}×{member.height}</span>
                        )}
                        {member.date_taken && (
                          <span>{formatDate(member.date_taken)}</span>
                        )}
                      </div>
                    </div>

                    {/* Status */}
                    <div className="shrink-0">
                      {member.is_preferred ? (
                        <span className="flex items-center gap-1 text-[10px] text-success font-medium bg-success/10 px-2 py-1 rounded">
                          <Check size={10} /> 원본
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 text-[10px] text-danger font-medium bg-danger/10 px-2 py-1 rounded">
                          <Trash2 size={10} /> 중복
                        </span>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="flex gap-1 shrink-0">
                      <button
                        onClick={() => handlePreview(member.file_path)}
                        className="p-1.5 rounded hover:bg-bg-secondary transition-colors"
                        title="미리보기 (Quick Look)"
                      >
                        <Eye size={14} className="text-text-secondary" />
                      </button>
                      <button
                        onClick={() => handleOpenFile(member.file_path)}
                        className="p-1.5 rounded hover:bg-bg-secondary transition-colors"
                        title="폴더에서 열기"
                      >
                        <FolderOpen size={14} className="text-text-secondary" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-4 flex gap-2">
                <button className="flex-1 py-2 rounded-md text-xs font-medium bg-success/10 text-success hover:bg-success/20 transition-colors">
                  왼쪽 유지
                </button>
                <button className="flex-1 py-2 rounded-md text-xs font-medium bg-success/10 text-success hover:bg-success/20 transition-colors">
                  오른쪽 유지
                </button>
                <button className="flex-1 py-2 rounded-md text-xs font-medium bg-bg-secondary text-text-secondary hover:bg-bg-primary transition-colors">
                  둘 다 유지
                </button>
              </div>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
