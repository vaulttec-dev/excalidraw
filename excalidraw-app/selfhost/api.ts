import { CaptureUpdateAction } from "@excalidraw/excalidraw";

import { appJotaiStore } from "../app-jotai";
import { collabAPIAtom } from "../collab/Collab";

import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";

// Client for the self-hosted backend this build is deployed with: the signed-in
// account and the team's shared board list. Upstream has no accounts and no
// board list, so none of this exists in the editor itself; every board here is a
// collaboration room, addressed by the room id and key in the URL fragment.

export type Board = {
  id: string;
  key: string;
  name: string;
  createdBy: string;
  /** Id of the folder the board is in; absent for none. */
  folder?: string;
  createdAt: string;
  editedAt: string;
};

export type Folder = {
  id: string;
  name: string;
  createdBy: string;
  createdAt: string;
};

export type Account = {
  login: string;
  name: string;
  avatarUrl: string;
};

export const BOARDS_TAB = "boards";

export const LOGOUT_URL = "/auth/logout";

// Shared with the script the backend adds to index.html, which reopens the last
// board when the instance is opened without a room in the URL.
const LAST_ROOM_KEY = "excalidraw-self-host-room";

const ROOM_HASH = /^#room=([0-9a-f]{20}),([A-Za-z0-9_-]{22})$/;

const request = async (method: string, path: string, body?: unknown) => {
  const response = await fetch(path, {
    method,
    credentials: "same-origin",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}`);
  }
  return response;
};

export const fetchAccount = async (): Promise<Account | null> => {
  try {
    const response = await request("GET", "/api/me");
    return await response.json();
  } catch {
    return null;
  }
};

export const fetchBoards = async (): Promise<Board[]> => {
  const response = await request("GET", "/api/boards");
  return (await response.json()) ?? [];
};

/** Registers a board, or renames it when a name is given. */
export const saveBoard = async (id: string, key: string, name?: string) => {
  await request("PUT", `/api/boards/${id}`, {
    key,
    ...(name !== undefined ? { name } : {}),
  });
};

/** Folders, by name. There is one level of them. */
export const fetchFolders = async (): Promise<Folder[]> => {
  const response = await request("GET", "/api/folders");
  return (await response.json()) ?? [];
};

export const createFolder = async (name: string): Promise<Folder> => {
  const response = await request("POST", "/api/folders", { name });
  return response.json();
};

export const renameFolder = async (id: string, name: string) => {
  await request("PUT", `/api/folders/${id}`, { name });
};

/** Deletes a folder; its boards stay, outside any folder. */
export const deleteFolder = async (id: string) => {
  await request("DELETE", `/api/folders/${id}`);
};

/** Puts a board in a folder, or in none when `folder` is empty. */
export const moveBoard = async (id: string, folder: string) => {
  await request("PUT", `/api/boards/${id}/folder`, { folder });
};

export type Version = { id: string; at: string };

export type TrashedBoard = {
  id: string;
  name: string;
  createdBy: string;
  deletedBy: string;
  deletedAt: string;
};

/** Stored versions of a board, newest first. */
export const fetchVersions = async (id: string): Promise<Version[]> => {
  const response = await request("GET", `/api/boards/${id}/versions`);
  return (await response.json()) ?? [];
};

/**
 * Makes a stored version the board's content. The server keeps the content it
 * replaces as a version too, and sends the change to open tabs live.
 */
export const restoreVersion = async (id: string, version: string) => {
  await request("POST", `/api/boards/${id}/versions/${version}/restore`);
};

export const fetchTrash = async (): Promise<TrashedBoard[]> => {
  const response = await request("GET", "/api/boards/trash");
  return (await response.json()) ?? [];
};

export const restoreFromTrash = async (id: string): Promise<Board> => {
  const response = await request("POST", `/api/boards/trash/${id}/restore`);
  return response.json();
};

/** Deletes a board in the trash for good, versions included. */
export const purgeFromTrash = async (id: string) => {
  await request("DELETE", `/api/boards/trash/${id}`);
};

/** Moves a board to the trash, from where it can be restored. */
export const deleteBoard = async (id: string) => {
  await request("DELETE", `/api/boards/${id}`);
  if (currentRoom()?.id === id || rememberedRoom()?.id === id) {
    // Otherwise opening the instance would bring the deleted board back, empty.
    try {
      localStorage.removeItem(LAST_ROOM_KEY);
    } catch {}
  }
};

const toHex = (bytes: Uint8Array) =>
  Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");

// The room key is a JWK "k" value: base64url of the raw 128 bit AES key.
const toBase64Url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

export const generateRoom = () => ({
  id: toHex(crypto.getRandomValues(new Uint8Array(10))),
  key: toBase64Url(crypto.getRandomValues(new Uint8Array(16))),
});

const parseRoom = (hash: string | null) => {
  const match = hash ? ROOM_HASH.exec(hash) : null;
  return match ? { id: match[1], key: match[2] } : null;
};

export const currentRoom = () => parseRoom(window.location.hash);

const rememberedRoom = () => {
  try {
    return parseRoom(localStorage.getItem(LAST_ROOM_KEY));
  } catch {
    return null;
  }
};

export const boardLink = (board: Pick<Board, "id" | "key">) =>
  `${window.location.origin}/#room=${board.id},${board.key}`;

/**
 * Switches the tab to another board without reloading the page.
 *
 * While a room is open the app ignores a new room in the hash, so the current
 * room is left first; the app's own hashchange handler then joins the next one
 * and loads its scene. If that path is not available the page is reloaded.
 */
export const openBoard = async (
  board: Pick<Board, "id" | "key">,
  excalidrawAPI?: ExcalidrawImperativeAPI | null,
) => {
  const hash = `#room=${board.id},${board.key}`;
  try {
    localStorage.setItem(LAST_ROOM_KEY, hash);
  } catch {}

  const collabAPI = appJotaiStore.get(collabAPIAtom);

  // The room is saved on a timer; leaving before it fires would lose whatever
  // was drawn since the last save. Saving first also leaves nothing new for the
  // save stopCollaboration makes on its way out, which could otherwise finish
  // after the next room is open and bring this board's elements into it.
  try {
    await collabAPI?.flushSave();
  } catch {}

  if (collabAPI?.isCollaborating() && excalidrawAPI) {
    collabAPI.stopCollaboration(false);
    // The next room is reconciled against whatever is on the canvas, so the
    // canvas is emptied first, along with an undo history that would bring
    // this board's elements back into the next one.
    excalidrawAPI.updateScene({
      elements: [],
      captureUpdate: CaptureUpdateAction.NEVER,
    });
    excalidrawAPI.history.clear();
    window.location.hash = hash;

    // The app records loading the next room as an undoable step, so an undo
    // right after switching would wipe the board for everyone. The history is
    // cleared again once the room has loaded.
    const deadline = Date.now() + 15000;
    while (Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 100));
      if (collabAPI.isCollaborating() && !excalidrawAPI.getAppState().isLoading) {
        // The history entry is committed after the render that shows the
        // scene, so give it a moment before clearing.
        await new Promise((resolve) => setTimeout(resolve, 300));
        excalidrawAPI.history.clear();
        break;
      }
    }
    return;
  }

  window.location.hash = hash;
  window.location.reload();
};
