import { DefaultSidebar, Sidebar } from "@excalidraw/excalidraw";
import { sidebarRightIcon } from "@excalidraw/excalidraw/components/icons";
import { useUIAppState } from "@excalidraw/excalidraw/context/ui-appState";

import { BOARDS_TAB } from "../selfhost/api";
import { BoardsPanel } from "../selfhost/BoardsPanel";
import { boardsIcon } from "../selfhost/icons";
import { rememberDocked } from "../selfhost/sidebar";

// Upstream fills this sidebar with Excalidraw+ promotions (comments,
// presentations), which lead to a service this instance is not. The team's
// board list takes their place, and the sidebar button opens it rather than
// the library.
export const AppSidebar = () => {
  const { openSidebar } = useUIAppState();

  return (
    <>
      <DefaultSidebar.Trigger
        icon={sidebarRightIcon}
        title="Дошки команди"
        tab={BOARDS_TAB}
      />
      <DefaultSidebar onDock={rememberDocked}>
        <DefaultSidebar.TabTriggers>
          <Sidebar.TabTrigger
            tab={BOARDS_TAB}
            title="Дошки команди"
            style={{ opacity: openSidebar?.tab === BOARDS_TAB ? 1 : 0.4 }}
          >
            {boardsIcon}
          </Sidebar.TabTrigger>
        </DefaultSidebar.TabTriggers>
        <Sidebar.Tab tab={BOARDS_TAB} className="selfhost-boards-tab">
          <BoardsPanel />
        </Sidebar.Tab>
      </DefaultSidebar>
    </>
  );
};
