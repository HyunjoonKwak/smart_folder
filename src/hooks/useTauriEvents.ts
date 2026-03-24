import { useEffect } from "react";
import { listen } from "@tauri-apps/api/event";
import { useAppStore } from "@/stores/appStore";
import type { ScanProgress } from "@/types";

export function useScanProgress() {
  const setScanProgress = useAppStore((s) => s.setScanProgress);
  const setIsScanning = useAppStore((s) => s.setIsScanning);

  useEffect(() => {
    const unlisten = listen<ScanProgress>("scan-progress", (event) => {
      setScanProgress(event.payload);
      const phase = event.payload.phase;
      if (phase === "complete" || phase === "cancelled") {
        setIsScanning(false);
      }
      // Phase 0 complete: file list is ready, background processing continues
      if (phase === "phase0_complete") {
        setIsScanning(false);
      }
    });

    return () => {
      unlisten.then((fn) => fn());
    };
  }, [setScanProgress, setIsScanning]);
}

export function useDuplicateProgress() {
  const [progress, setProgress] = React.useState<{
    phase: string;
    total: number;
    current: number;
  } | null>(null);

  useEffect(() => {
    const unlisten = listen("duplicate-progress", (event) => {
      setProgress(event.payload as any);
    });

    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  return progress;
}

export function useOrganizeProgress() {
  const [progress, setProgress] = React.useState<{
    phase: string;
    total: number;
    current: number;
    current_file: string;
  } | null>(null);

  useEffect(() => {
    const unlisten = listen("organize-progress", (event) => {
      setProgress(event.payload as any);
    });

    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  return progress;
}

import React from "react";
