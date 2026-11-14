import { DEFAULT_SIDEBAR } from "@excalidraw/common";
import { useExcalidrawAPI } from "@excalidraw/excalidraw";
import { eyeIcon } from "@excalidraw/excalidraw/components/icons";
import React from "react";

import { appJotaiStore, atom, useAtomValue } from "../app-jotai";

import { BOARDS_TAB, currentRoom, fetchBoard } from "./api";

import type { Board } from "./api";

/**
 * Whether the open board may only be looked at: it is in a folder that is
 * view-only for this account. The server refuses changes to such a board
 * anyway; showing it in view mode keeps anybody from drawing what would not be
 * kept.
 */
export const boardReadOnlyAtom = atom(false);

export const isBoardReadOnly = () => appJotaiStore.get(boardReadOnlyAtom);

const setReadOnly = (readOnly: boolean) =>
  appJotaiStore.set(boardReadOnlyAtom, readOnly);

/** Takes the open board's access from a list just read. */
export const takeBoardAccess = (boards: readonly Board[]) => {
  const room = currentRoom();
  const board = room && boards.find((b) => b.id === room.id);
  if (board) {
    setReadOnly(!board.canEdit);
  }
};

let checking: Promise<void> | null = null;

/** Asks the server whether the open board may be changed. */
export const refreshBoardAccess = () => {
  checking ??= (async () => {
    const room = currentRoom();
    try {
      if (!room) {
        setReadOnly(false);
        return;
      }
      const board = await fetchBoard(room.id);
      // The answer is for the board that was open when asked.
      if (currentRoom()?.id === room.id) {
        // A board that is not listed yet is outside any folder.
        setReadOnly(board ? !board.canEdit : false);
      }
    } catch {
      // Unknown: keep what was known. The server checks every change anyway.
    } finally {
      checking = null;
    }
  })();
  return checking;
};

/** Shown on a view-only board, where the editor's own toolbar is gone. */
export const ReadOnlyBadge = () => {
  const readOnly = useAtomValue(boardReadOnlyAtom);
  const excalidrawAPI = useExcalidrawAPI();
  if (!readOnly) {
    return null;
  }
  return (
    <button
      type="button"
      className="selfhost-read-only"
      title="Ця дошка в папці, де вам дозволено лише перегляд. Змінювати її можуть автор папки та адміністратори; автор може відкрити редагування для всіх."
      onClick={() =>
        excalidrawAPI?.toggleSidebar({
          name: DEFAULT_SIDEBAR.name,
          tab: BOARDS_TAB,
          force: true,
        })
      }
    >
      {eyeIcon}
      Лише перегляд
    </button>
  );
};
