import { DEFAULT_SIDEBAR } from "@excalidraw/common";

import type { AppState } from "@excalidraw/excalidraw/types";

import { BOARDS_TAB } from "./api";

// Whether the board list is pinned, "0" once unpinned. Kept apart from the
// editor's saved state, which is not written while collaborating — and here
// every board is a collaboration room — and which upstream filled with "not
// docked" for everyone, a choice nobody made.
const DOCKED_KEY = "excalidraw-self-host-sidebar-docked";

/**
 * The narrowest editor the board list stays pinned in. Upstream's 1229px
 * left the list unpinned in a window on half of a 1920px screen. Below this
 * width the pinned list would cover the end of the toolbar, which reaches
 * about 600px from the left edge.
 */
export const SIDEBAR_DOCK_MIN_WIDTH = 900;

export const rememberDocked = (docked: boolean) => {
  try {
    localStorage.setItem(DOCKED_KEY, docked ? "1" : "0");
  } catch {}
};

const isDocked = () => {
  try {
    return localStorage.getItem(DOCKED_KEY) !== "0";
  } catch {
    return true;
  }
};

/**
 * The sidebar state a board opens with. The board list opens with the page
 * and is pinned by default. While pinned, in a window wide enough for it, it
 * stays open across reloads and board switches, which upstream does not do
 * for collaboration rooms. Unpinned, or in a narrower window, it opens over
 * the board until a click on the board closes it.
 */
export const boardsSidebarState = (
  current: AppState["openSidebar"],
  pageLoad: boolean,
): Pick<AppState, "defaultSidebarDockedPreference" | "openSidebar"> => {
  const docked = isDocked();
  const pinned = docked && window.innerWidth > SIDEBAR_DOCK_MIN_WIDTH;
  return {
    defaultSidebarDockedPreference: docked,
    openSidebar:
      current ??
      (pinned || pageLoad
        ? { name: DEFAULT_SIDEBAR.name, tab: BOARDS_TAB }
        : null),
  };
};
