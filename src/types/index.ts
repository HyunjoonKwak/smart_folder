export interface MediaFile {
  id: string;
  file_path: string;
  original_path: string;
  file_name: string;
  file_size: number;
  mime_type: string | null;
  sha256_hash: string | null;
  quick_hash: string | null;
  width: number | null;
  height: number | null;
  media_type: "image" | "video";
  created_at: string;
  modified_at: string;
  scanned_at: string;
  source_type: "local" | "external" | "cloud";
  thumbnail: string | null;
  scan_phase: number;
  date_taken: string | null;
}

export interface MediaListResponse {
  files: MediaFile[];
  total: number;
  total_size: number;
}

export interface MediaStats {
  total_count: number;
  total_size: number;
  image_count: number;
  video_count: number;
}

export interface ScanProgress {
  total: number;
  current: number;
  current_file: string;
  phase: "scanning" | "processing" | "phase0_complete" | "complete" | "cancelled";
}

export interface ScanResult {
  total_files: number;
  images: number;
  videos: number;
  total_size: number;
}

export interface DuplicateGroup {
  id: string;
  match_type: "exact" | "similar" | "ai_confirmed";
  similarity_score: number | null;
  status: string;
  members: DuplicateMember[];
}

export interface DuplicateMember {
  media_id: string;
  is_preferred: boolean;
  file_path: string;
  file_name: string;
  file_size: number;
}

export interface PlannedMove {
  source: string;
  target: string;
  file_name: string;
  file_size: number;
  reason: string;
}

export interface OrganizePlan {
  moves: PlannedMove[];
  total_files: number;
  total_size: number;
  new_folders: number;
}

export interface OrganizeProgress {
  phase: string;
  total: number;
  current: number;
  current_file: string;
}

export interface UndoBatch {
  batch_id: string;
  batch_name: string | null;
  entries: UndoEntry[];
}

export interface UndoEntry {
  id: string;
  sequence: number;
  operation: string;
  source_path: string | null;
  target_path: string | null;
  status: string;
  executed_at: string | null;
}

export type ViewMode = "grid" | "list";
export type AppView =
  | "gallery"
  | "duplicates"
  | "organize"
  | "before-after"
  | "history"
  | "foldertree";
