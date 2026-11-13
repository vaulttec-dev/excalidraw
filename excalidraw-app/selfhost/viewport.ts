import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";

/**
 * Shows the whole board on opening: zoomed out as far as it takes to fit the
 * screen beside the toolbar and the pinned board list, but never past 100%,
 * so a small board is not blown up.
 */
export const fitBoard = (excalidrawAPI: ExcalidrawImperativeAPI) => {
  const elements = excalidrawAPI.getSceneElements();
  if (!elements.length) {
    return;
  }
  excalidrawAPI.setViewport({
    target: elements,
    fit: "scale-down",
    offsets: { ui: true },
  });
};
