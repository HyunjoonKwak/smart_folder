import { useState } from "react";
import { Columns2, Maximize2 } from "lucide-react";
import { TreePanel } from "./TreePanel";

export function FolderTreeView() {
  const [isSplit, setIsSplit] = useState(false);

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Split toggle bar */}
      <div className="flex items-center justify-end px-3 py-1 border-b border-border bg-bg-secondary/30">
        <button
          onClick={() => setIsSplit(!isSplit)}
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-[11px] font-medium transition-colors ${
            isSplit
              ? "bg-accent text-white"
              : "text-text-secondary hover:bg-bg-primary hover:text-text-primary"
          }`}
          title={isSplit ? "단일 뷰" : "분할 뷰"}
        >
          {isSplit ? <Maximize2 size={12} /> : <Columns2 size={12} />}
          {isSplit ? "단일 뷰" : "분할 뷰"}
        </button>
      </div>

      {/* Panels */}
      <div className="flex-1 flex overflow-hidden">
        <TreePanel />
        {isSplit && (
          <>
            <div className="w-px bg-border shrink-0" />
            <TreePanel />
          </>
        )}
      </div>
    </div>
  );
}
