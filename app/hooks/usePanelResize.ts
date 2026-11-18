import { useRef } from "react";
import { parsePositiveInt, STORAGE_KEYS, usePersistentState } from "~/lib/use-persistent-state";

const MIN_WIDTH = 220;
const MAX_WIDTH = 600;

/** Persisted, drag-resizable panel width (desktop split pane). */
export function usePanelResize() {
  const [panelWidth, setPanelWidth] = usePersistentState<number>(
    STORAGE_KEYS.FILE_BROWSER_WIDTH,
    300,
    {
      parse: (raw) => {
        const val = parsePositiveInt(raw);
        return val !== undefined && val >= MIN_WIDTH && val <= MAX_WIDTH ? val : undefined;
      },
    },
  );
  const isResizingRef = useRef(false);

  const handleMouseDownResize = (e: React.MouseEvent) => {
    e.preventDefault();
    isResizingRef.current = true;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (!isResizingRef.current) return;
      setPanelWidth(Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, moveEvent.clientX)));
    };

    const handleMouseUp = () => {
      isResizingRef.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
      setPanelWidth((w) => w);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
  };

  return { panelWidth, handleMouseDownResize };
}
