import { useState, useEffect } from "react";
import { X, Download, Copy, Check, FileText, AlertCircle, Loader2 } from "lucide-react";
import type { FsItem } from "./types";

interface FilePreviewModalProps {
  isOpen: boolean;
  item: FsItem | null;
  onClose: () => void;
  onDownload: (item: FsItem) => void;
}

const MAX_PREVIEW_SIZE = 2 * 1024 * 1024; // 2MB

export function FilePreviewModal({ isOpen, item, onClose, onDownload }: FilePreviewModalProps) {
  const [content, setContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const ext = item?.name.includes(".") ? item.name.split(".").pop()?.toLowerCase() : "";
  const isImage = ext && ["png", "jpg", "jpeg", "gif", "svg", "webp", "ico"].includes(ext);

  useEffect(() => {
    if (!isOpen || !item || isImage || item.size > MAX_PREVIEW_SIZE) {
      setContent(null);
      return;
    }

    let active = true;
    setLoading(true);
    setError(null);

    fetch(`/api/fs/download?path=${encodeURIComponent(item.path)}&inline=1`)
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.text();
      })
      .then((text) => {
        if (active) {
          setContent(text);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (active) {
          setError(err.message || "Failed to load file preview");
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [isOpen, item, isImage]);

  if (!isOpen || !item) return null;

  const handleCopy = () => {
    if (content) {
      navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
      <div className="w-full max-w-4xl h-[80vh] flex flex-col rounded-lg shadow-2xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] text-[var(--fg-base)] overflow-hidden">
        {/* Header */}
        <div className="px-4 py-3 border-b border-[var(--border-subtle)] flex items-center justify-between bg-[var(--bg-base)]">
          <div className="flex items-center gap-2 min-w-0">
            <FileText className="w-4 h-4 text-[var(--accent)] shrink-0" />
            <span className="font-semibold text-sm truncate font-mono">{item.name}</span>
            <span className="text-xs text-[var(--fg-muted)] shrink-0">
              ({(item.size / 1024).toFixed(1)} KB)
            </span>
          </div>

          <div className="flex items-center gap-2">
            {content !== null && (
              <button
                type="button"
                onClick={handleCopy}
                className="p-1.5 rounded hover:bg-[var(--bg-hover)] text-[var(--fg-muted)] hover:text-[var(--fg-base)] transition-colors"
                title="Copy Content"
              >
                {copied ? (
                  <Check className="w-4 h-4 text-[var(--success)]" />
                ) : (
                  <Copy className="w-4 h-4" />
                )}
              </button>
            )}
            <button
              type="button"
              onClick={() => onDownload(item)}
              className="p-1.5 rounded hover:bg-[var(--bg-hover)] text-[var(--fg-muted)] hover:text-[var(--fg-base)] transition-colors"
              title="Download File"
            >
              <Download className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded hover:bg-[var(--bg-hover)] text-[var(--fg-muted)] hover:text-[var(--fg-base)] transition-colors"
              title="Close"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-auto p-4 bg-[var(--bg-base)]">
          {item.size > MAX_PREVIEW_SIZE ? (
            <div className="flex flex-col items-center justify-center h-full text-center p-6 gap-3">
              <AlertCircle className="w-10 h-10 text-[var(--warning)]" />
              <p className="text-sm font-medium">File too large to preview inline</p>
              <p className="text-xs text-[var(--fg-muted)] max-w-sm">
                This file exceeds the 2MB preview limit. You can download it directly to view its
                contents.
              </p>
              <button
                type="button"
                onClick={() => onDownload(item)}
                className="mt-2 px-3 py-1.5 rounded text-xs font-medium bg-[var(--accent)] text-white hover:brightness-110 flex items-center gap-1.5"
              >
                <Download className="w-3.5 h-3.5" />
                Download File
              </button>
            </div>
          ) : isImage ? (
            <div className="flex items-center justify-center h-full">
              <img
                src={`/api/fs/download?path=${encodeURIComponent(item.path)}&inline=1`}
                alt={item.name}
                className="max-h-full max-w-full object-contain rounded border border-[var(--border-subtle)]"
              />
            </div>
          ) : loading ? (
            <div className="flex items-center justify-center h-full gap-2 text-xs text-[var(--fg-muted)]">
              <Loader2 className="w-5 h-5 animate-spin text-[var(--accent)]" />
              Loading preview...
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center h-full text-center text-xs text-[var(--fg-muted)] gap-2">
              <AlertCircle className="w-6 h-6 text-[var(--error)]" />
              <span>{error}</span>
            </div>
          ) : (
            <pre className="font-mono text-xs leading-relaxed overflow-x-auto whitespace-pre selection:bg-[var(--accent)]/30">
              <code>{content}</code>
            </pre>
          )}
        </div>
      </div>
    </div>
  );
}
