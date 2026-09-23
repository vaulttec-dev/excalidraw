import { appJotaiStore } from "../app-jotai";
import { collabAPIAtom } from "../collab/Collab";

// Client for the self-hosted backend this build is deployed with: the signed-in
// account and the team's shared board list. Upstream has no accounts and no
// board list, so none of this exists in the editor itself; every board here is a
// collaboration room, addressed by the room id and key in the URL fragment.

export type Board = {
  id: string;
  key: string;
  name: string;
  createdBy: string;
  createdAt: string;
  editedAt: string;
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
 * Switches the tab to another board. The editor joins a room once, when it
 * starts, and ignores later changes of the hash, so a reload is required.
 */
export const openBoard = async (board: Pick<Board, "id" | "key">) => {
  // The editor saves the room on a timer; reloading before it fires would lose
  // whatever was drawn since the last save.
  try {
    await appJotaiStore.get(collabAPIAtom)?.flushSave();
  } catch {}

  const hash = `#room=${board.id},${board.key}`;
  try {
    localStorage.setItem(LAST_ROOM_KEY, hash);
  } catch {}
  window.location.hash = hash;
  window.location.reload();
};
