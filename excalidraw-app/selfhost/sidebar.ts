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
 * left the list unpinned in a window on half of a 1920px screen; at this
 * width the board keeps about 600px beside it.
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
 * The sidebar state a board opens with. The board list is pinned by default,
 * and while pinned it stays open across reloads and board switches, which
 * upstream does not do for collaboration rooms.
 */
export const boardsSidebarState = (
  current: AppState["openSidebar"],
): Pick<AppState, "defaultSidebarDockedPreference" | "openSidebar"> => {
  const docked = isDocked();
  // Too narrow to dock: the sidebar would cover the board.
  if (!docked || window.innerWidth <= SIDEBAR_DOCK_MIN_WIDTH) {
    return { defaultSidebarDockedPreference: docked, openSidebar: current };
  }
  return {
    defaultSidebarDockedPreference: true,
    openSidebar: current ?? { name: DEFAULT_SIDEBAR.name, tab: BOARDS_TAB },
  };
};
