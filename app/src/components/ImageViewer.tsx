import { useEffect, useState } from "react";
import { invoke } from "../platform/runtime";

function fileName(path: string) {
  const parts = path.split(/[\\/]/);
  return parts[parts.length - 1] || path;
}

export function ImageViewer({
  path,
  folder,
  onClose,
}: {
  path: string;
  folder: string | null;
  onClose: () => void;
}) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setDataUrl(null);
    setError(null);
    invoke<string>("read_image_data_url", { path, folder })
      .then((url) => {
        if (!cancelled) setDataUrl(url);
      })
      .catch((err) => {
        if (!cancelled) setError(String(err));
      });
    return () => {
      cancelled = true;
    };
  }, [path, folder]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="image-viewer-backdrop" onMouseDown={onClose}>
      <div
        className="image-viewer"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="image-viewer-header">
          <span className="image-viewer-name" title={path}>
            {fileName(path)}
          </span>
          <button className="app-icon-btn" onClick={onClose} title="Close">
            ×
          </button>
        </div>
        <div className="image-viewer-body">
          {error && <div className="image-viewer-error">{error}</div>}
          {!error && !dataUrl && (
            <div className="image-viewer-loading">Loading...</div>
          )}
          {dataUrl && <img src={dataUrl} alt={fileName(path)} />}
        </div>
      </div>
    </div>
  );
}
