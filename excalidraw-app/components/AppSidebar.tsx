import { DefaultSidebar, Sidebar } from "@excalidraw/excalidraw";
import { useUIAppState } from "@excalidraw/excalidraw/context/ui-appState";

import { BOARDS_TAB } from "../selfhost/api";
import { BoardsPanel } from "../selfhost/BoardsPanel";
import { boardsIcon } from "../selfhost/icons";

// Upstream fills this sidebar with Excalidraw+ promotions (comments,
// presentations), which lead to a service this instance is not. The team's
// board list takes their place.
export const AppSidebar = () => {
  const { openSidebar } = useUIAppState();

  return (
    <DefaultSidebar>
      <DefaultSidebar.TabTriggers>
        <Sidebar.TabTrigger
          tab={BOARDS_TAB}
          title="Дошки команди"
          style={{ opacity: openSidebar?.tab === BOARDS_TAB ? 1 : 0.4 }}
        >
          {boardsIcon}
        </Sidebar.TabTrigger>
      </DefaultSidebar.TabTriggers>
      <Sidebar.Tab tab={BOARDS_TAB}>
        <BoardsPanel />
      </Sidebar.Tab>
    </DefaultSidebar>
  );
};
