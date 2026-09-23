import {
  LinkIcon,
  PlusIcon,
  TrashIcon,
  pencilIcon,
} from "@excalidraw/excalidraw/components/icons";
import { useExcalidrawAPI } from "@excalidraw/excalidraw";
import clsx from "clsx";
import React, { useCallback, useEffect, useMemo, useState } from "react";

import {
  boardLink,
  createFolder,
  currentRoom,
  deleteBoard,
  deleteFolder,
  fetchBoards,
  fetchFolders,
  fetchTrash,
  purgeFromTrash,
  fetchVersions,
  generateRoom,
  moveBoard,
  openBoard,
  renameFolder,
  restoreFromTrash,
  restoreVersion,
  saveBoard,
} from "./api";
import {
  folderIcon,
  folderMoveIcon,
  folderPlusIcon,
  historyIcon,
} from "./icons";

import "./BoardsPanel.scss";

import type { Board, Folder, TrashedBoard, Version } from "./api";

// Which folders this viewer has collapsed; a convenience kept per browser.
const COLLAPSED_KEY = "excalidraw-self-host-collapsed-folders";

const readCollapsed = (): Set<string> => {
  try {
    const stored = JSON.parse(localStorage.getItem(COLLAPSED_KEY) || "[]");
    return new Set(Array.isArray(stored) ? stored : []);
  } catch {
    return new Set();
  }
};

const writeCollapsed = (collapsed: Set<string>) => {
  try {
    localStorage.setItem(COLLAPSED_KEY, JSON.stringify([...collapsed]));
  } catch {}
};

const dateTime = new Intl.DateTimeFormat("uk", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

const relativeTime = new Intl.RelativeTimeFormat("uk", { numeric: "auto" });

const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["year", 31536000],
  ["month", 2592000],
  ["week", 604800],
  ["day", 86400],
  ["hour", 3600],
  ["minute", 60],
];

const ago = (iso: string) => {
  const seconds = (new Date(iso).getTime() - Date.now()) / 1000;
  for (const [unit, size] of UNITS) {
    if (Math.abs(seconds) >= size) {
      return relativeTime.format(Math.round(seconds / size), unit);
    }
  }
  return "щойно";
};

const NameForm = ({
  initial,
  submitLabel,
  placeholder = "Назва дошки",
  onSubmit,
  onCancel,
}: {
  initial: string;
  submitLabel: string;
  placeholder?: string;
  onSubmit: (name: string) => void;
  onCancel: () => void;
}) => {
  const [name, setName] = useState(initial);
  return (
    <form
      className="selfhost-boards__form"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit(name.trim());
      }}
    >
      <input
        autoFocus
        type="text"
        maxLength={120}
        placeholder={placeholder}
        value={name}
        onChange={(event) => setName(event.target.value)}
        onKeyDown={(event) => {
          // The editor listens for shortcuts on the whole document.
          event.stopPropagation();
          if (event.key === "Escape") {
            onCancel();
          }
        }}
      />
      <div className="selfhost-boards__form-actions">
        <button type="button" onClick={onCancel}>
          Скасувати
        </button>
        <button type="submit" className="selfhost-boards__primary">
          {submitLabel}
        </button>
      </div>
    </form>
  );
};

/**
 * A board's stored versions. The server keeps one at most every ten minutes
 * while the board is edited, and before anything that throws content away.
 */
const Versions = ({
  board,
  onError,
}: {
  board: Board;
  onError: (message: string) => void;
}) => {
  const [versions, setVersions] = useState<Version[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(
    () =>
      fetchVersions(board.id).then(setVersions, (err) => onError(err.message)),
    [board.id, onError],
  );

  useEffect(() => {
    load();
  }, [load]);

  const restore = async (version: Version) => {
    const label = board.name || "Без назви";
    const when = dateTime.format(new Date(version.at));
    if (
      !window.confirm(
        `Повернути дошку «${label}» до стану на ${when}? Поточний стан теж збережеться як версія, тож це можна буде скасувати.`,
      )
    ) {
      return;
    }
    setBusy(version.id);
    try {
      await restoreVersion(board.id, version.id);
      await load();
    } catch (err: any) {
      onError(err.message);
    } finally {
      setBusy(null);
    }
  };

  if (versions === null) {
    return <div className="selfhost-boards__versions-empty">Завантаження…</div>;
  }
  if (versions.length === 0) {
    return (
      <div className="selfhost-boards__versions-empty">
        Версій ще немає — вони з'являються, коли дошку редагують.
      </div>
    );
  }
  return (
    <ul className="selfhost-boards__versions">
      {versions.map((version) => (
        <li key={version.id}>
          <span>
            {dateTime.format(new Date(version.at))}
            <span className="selfhost-boards__meta"> · {ago(version.at)}</span>
          </span>
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => restore(version)}
          >
            {busy === version.id ? "…" : "Відновити"}
          </button>
        </li>
      ))}
    </ul>
  );
};

/** Deleted boards, which can be brought back with their last content. */
const Trash = ({
  onRestored,
  onError,
}: {
  onRestored: () => void;
  onError: (message: string) => void;
}) => {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<TrashedBoard[] | null>(null);

  const load = useCallback(
    () => fetchTrash().then(setItems, (err) => onError(err.message)),
    [onError],
  );

  useEffect(() => {
    if (open) {
      load();
    }
  }, [open, load]);

  const restore = async (item: TrashedBoard) => {
    try {
      await restoreFromTrash(item.id);
      await load();
      onRestored();
    } catch (err: any) {
      onError(err.message);
    }
  };

  const purge = async (item: TrashedBoard) => {
    if (
      !window.confirm(
        `Видалити «${
          item.name || "Без назви"
        }» назавжди? Разом з усіма версіями — відновити вже не вийде.`,
      )
    ) {
      return;
    }
    try {
      await purgeFromTrash(item.id);
      await load();
    } catch (err: any) {
      onError(err.message);
    }
  };

  return (
    <div className="selfhost-boards__trash">
      <button
        type="button"
        className="selfhost-boards__trash-toggle"
        onClick={() => setOpen(!open)}
      >
        {open ? "▾" : "▸"} Кошик
      </button>
      {open && items !== null && items.length === 0 && (
        <div className="selfhost-boards__versions-empty">Кошик порожній.</div>
      )}
      {open && items !== null && items.length > 0 && (
        <ul className="selfhost-boards__versions">
          {items.map((item) => (
            <li key={item.id}>
              <span>
                {item.name || "Без назви"}
                <span className="selfhost-boards__meta">
                  {" "}
                  · видалив(ла) {item.deletedBy || "—"} {ago(item.deletedAt)}
                </span>
              </span>
              <span className="selfhost-boards__trash-actions">
                <button type="button" onClick={() => restore(item)}>
                  Відновити
                </button>
                <button
                  type="button"
                  className="selfhost-boards__danger"
                  title="Видалити назавжди"
                  aria-label="Видалити назавжди"
                  onClick={() => purge(item)}
                >
                  {TrashIcon}
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

/**
 * The team's boards, shown as a tab of the editor's sidebar. Every board is a
 * collaboration room kept by the backend, so anyone signed in sees the same list
 * and edits the same boards.
 */
export const BoardsPanel = () => {
  const [boards, setBoards] = useState<Board[] | null>(null);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  // Where a new board is being named: "" for the top level, or a folder id.
  const [creating, setCreating] = useState<string | null>(null);
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renamingFolder, setRenamingFolder] = useState<string | null>(null);
  const [moving, setMoving] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [historyOf, setHistoryOf] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const [dragging, setDragging] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const excalidrawAPI = useExcalidrawAPI();
  const showError = useCallback((message: string) => setError(message), []);

  // Boards switch without a reload, so the open board follows the hash.
  const [current, setCurrent] = useState(currentRoom);
  useEffect(() => {
    const update = () => setCurrent(currentRoom());
    window.addEventListener("hashchange", update);
    return () => window.removeEventListener("hashchange", update);
  }, []);

  const load = useCallback(async () => {
    try {
      const [nextBoards, nextFolders] = await Promise.all([
        fetchBoards(),
        fetchFolders(),
      ]);
      setBoards(nextBoards);
      setFolders(nextFolders);
      setError(null);
    } catch (err: any) {
      setError(err.message);
    }
  }, []);

  useEffect(() => {
    load();
    // Teammates add boards too; pick them up when the tab gets focus back.
    window.addEventListener("focus", load);
    return () => window.removeEventListener("focus", load);
  }, [load]);

  const needle = query.trim().toLowerCase();

  const shown = useMemo(
    () =>
      (boards ?? []).filter(
        (board) =>
          !needle ||
          board.name.toLowerCase().includes(needle) ||
          board.createdBy.toLowerCase().includes(needle),
      ),
    [boards, needle],
  );

  // Boards by folder id; "" holds the ones outside any folder, including any
  // whose folder is gone.
  const byFolder = useMemo(() => {
    const known = new Set(folders.map((folder) => folder.id));
    const groups = new Map<string, Board[]>();
    for (const board of shown) {
      const key = board.folder && known.has(board.folder) ? board.folder : "";
      groups.set(key, [...(groups.get(key) ?? []), board]);
    }
    return groups;
  }, [shown, folders]);

  // While searching, only folders with matches — or a matching name — show.
  const shownFolders = folders.filter(
    (folder) =>
      !needle ||
      byFolder.has(folder.id) ||
      folder.name.toLowerCase().includes(needle),
  );
  const loose = byFolder.get("") ?? [];

  const toggleFolder = (id: string) => {
    const next = new Set(collapsed);
    if (!next.delete(id)) {
      next.add(id);
    }
    setCollapsed(next);
    writeCollapsed(next);
  };

  const expand = (id: string) => {
    if (collapsed.has(id)) {
      toggleFolder(id);
    }
  };

  const run = async (action: () => Promise<unknown>) => {
    try {
      await action();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const [creatingBusy, setCreatingBusy] = useState(false);

  const create = (name: string, folder: string) => {
    // A second submit while the first is under way would make a second board.
    if (creatingBusy) {
      return;
    }
    setCreatingBusy(true);
    run(async () => {
      const room = generateRoom();
      await saveBoard(room.id, room.key, name);
      if (folder) {
        await moveBoard(room.id, folder);
        expand(folder);
      }
      await openBoard(room, excalidrawAPI);
      setCreating(null);
      await load();
    }).finally(() => setCreatingBusy(false));
  };

  const addFolder = (name: string) => {
    if (!name) {
      return;
    }
    run(async () => {
      await createFolder(name);
      setCreatingFolder(false);
      await load();
    });
  };

  const renameFolderTo = (folder: Folder, name: string) => {
    if (!name) {
      return;
    }
    run(async () => {
      await renameFolder(folder.id, name);
      setRenamingFolder(null);
      await load();
    });
  };

  const removeFolder = (folder: Folder) => {
    const count = (boards ?? []).filter((b) => b.folder === folder.id).length;
    if (
      !window.confirm(
        count
          ? `Видалити папку «${folder.name}»? Її дошки (${count}) не видаляться — вони опиняться поза папками.`
          : `Видалити порожню папку «${folder.name}»?`,
      )
    ) {
      return;
    }
    run(async () => {
      await deleteFolder(folder.id);
      await load();
    });
  };

  const move = (board: Board, folder: string) => {
    setMoving(null);
    if ((board.folder ?? "") === folder) {
      return;
    }
    // Shown at once; the list is read back after the server has it.
    setBoards((current) =>
      (current ?? []).map((b) =>
        b.id === board.id ? { ...b, folder: folder || undefined } : b,
      ),
    );
    if (folder) {
      expand(folder);
    }
    run(async () => {
      await moveBoard(board.id, folder);
      await load();
    });
  };

  // Boards can be dragged onto a folder, or onto the top level to take them
  // out of one.
  const dropZone = (target: string) => ({
    onDragOver: (event: React.DragEvent) => {
      if (dragging) {
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
        setDropTarget(target);
      }
    },
    onDragLeave: (event: React.DragEvent) => {
      if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
        setDropTarget((current) => (current === target ? null : current));
      }
    },
    onDrop: (event: React.DragEvent) => {
      event.preventDefault();
      const board = (boards ?? []).find((b) => b.id === dragging);
      setDragging(null);
      setDropTarget(null);
      if (board) {
        move(board, target);
      }
    },
  });

  const rename = (board: Board, name: string) =>
    run(async () => {
      await saveBoard(board.id, board.key, name);
      setRenaming(null);
      await load();
    });

  const remove = (board: Board) => {
    const label = board.name || "Без назви";
    if (
      !window.confirm(
        `Перемістити дошку «${label}» у кошик? Для команди вона зникне зі списку, але її можна буде відновити з кошика.`,
      )
    ) {
      return;
    }
    run(async () => {
      await deleteBoard(board.id);
      await load();
    });
  };

  const copy = (board: Board) =>
    run(async () => {
      await navigator.clipboard.writeText(boardLink(board));
      setCopied(board.id);
      window.setTimeout(() => setCopied(null), 1500);
    });

  const renderBoard = (board: Board) =>
    renaming === board.id ? (
      <li key={board.id} className="selfhost-boards__item">
        <NameForm
          initial={board.name}
          submitLabel="Зберегти"
          onSubmit={(name) => rename(board, name)}
          onCancel={() => setRenaming(null)}
        />
      </li>
    ) : (
      <li
        key={board.id}
        className={clsx("selfhost-boards__item", {
          "selfhost-boards__item--current": current?.id === board.id,
          "selfhost-boards__item--dragging": dragging === board.id,
        })}
        draggable
        onDragStart={(event) => {
          event.dataTransfer.effectAllowed = "move";
          event.dataTransfer.setData("text/plain", board.name || board.id);
          setDragging(board.id);
        }}
        onDragEnd={() => {
          setDragging(null);
          setDropTarget(null);
        }}
      >
        <button
          type="button"
          className="selfhost-boards__open"
          onClick={() =>
            current?.id !== board.id && openBoard(board, excalidrawAPI)
          }
          title={current?.id === board.id ? "Відкрита зараз" : "Відкрити"}
        >
          <span
            className={clsx("selfhost-boards__name", {
              "selfhost-boards__name--untitled": !board.name,
            })}
          >
            {board.name || "Без назви"}
          </span>
          <span className="selfhost-boards__meta">
            {current?.id === board.id ? "відкрита зараз · " : ""}
            {ago(board.editedAt)} · {board.createdBy || "—"}
          </span>
        </button>
        <div className="selfhost-boards__actions">
          <button
            type="button"
            title={copied === board.id ? "Скопійовано" : "Копіювати посилання"}
            onClick={() => copy(board)}
          >
            {LinkIcon}
          </button>
          <button
            type="button"
            title="Перейменувати"
            onClick={() => setRenaming(board.id)}
          >
            {pencilIcon}
          </button>
          {folders.length > 0 && (
            <button
              type="button"
              title="Перемістити в папку"
              className={clsx({
                "selfhost-boards__active": moving === board.id,
              })}
              onClick={() => setMoving(moving === board.id ? null : board.id)}
            >
              {folderMoveIcon}
            </button>
          )}
          <button
            type="button"
            title="Історія версій"
            className={clsx({
              "selfhost-boards__active": historyOf === board.id,
            })}
            onClick={() =>
              setHistoryOf(historyOf === board.id ? null : board.id)
            }
          >
            {historyIcon}
          </button>
          <button
            type="button"
            title="У кошик"
            className="selfhost-boards__danger"
            onClick={() => remove(board)}
          >
            {TrashIcon}
          </button>
        </div>
        {moving === board.id && (
          <select
            autoFocus
            className="selfhost-boards__move"
            value={board.folder ?? ""}
            onChange={(event) => move(board, event.target.value)}
            onKeyDown={(event) => {
              event.stopPropagation();
              if (event.key === "Escape") {
                setMoving(null);
              }
            }}
          >
            <option value="">Без папки</option>
            {folders.map((folder) => (
              <option key={folder.id} value={folder.id}>
                {folder.name}
              </option>
            ))}
          </select>
        )}
        {historyOf === board.id && (
          <Versions board={board} onError={showError} />
        )}
      </li>
    );

  const renderFolder = (folder: Folder) => {
    const items = byFolder.get(folder.id) ?? [];
    // A search shows what matched without having to open folders.
    const open = !!needle || !collapsed.has(folder.id);
    return (
      <li
        key={folder.id}
        className={clsx("selfhost-boards__folder", {
          "selfhost-boards__drop": dropTarget === folder.id,
        })}
        {...dropZone(folder.id)}
      >
        {renamingFolder === folder.id ? (
          <NameForm
            initial={folder.name}
            submitLabel="Зберегти"
            placeholder="Назва папки"
            onSubmit={(name) => renameFolderTo(folder, name)}
            onCancel={() => setRenamingFolder(null)}
          />
        ) : (
          <div className="selfhost-boards__folder-head">
            <button
              type="button"
              className="selfhost-boards__folder-toggle"
              onClick={() => toggleFolder(folder.id)}
              aria-expanded={open}
            >
              <span className="selfhost-boards__chevron">
                {open ? "▾" : "▸"}
              </span>
              {folderIcon}
              <span className="selfhost-boards__folder-name">
                {folder.name}
              </span>
              <span className="selfhost-boards__meta">
                {(boards ?? []).filter((b) => b.folder === folder.id).length}
              </span>
            </button>
            <div className="selfhost-boards__actions">
              <button
                type="button"
                title="Нова дошка в цій папці"
                onClick={() => {
                  expand(folder.id);
                  setCreating(folder.id);
                }}
              >
                {PlusIcon}
              </button>
              <button
                type="button"
                title="Перейменувати папку"
                onClick={() => setRenamingFolder(folder.id)}
              >
                {pencilIcon}
              </button>
              <button
                type="button"
                title="Видалити папку"
                className="selfhost-boards__danger"
                onClick={() => removeFolder(folder)}
              >
                {TrashIcon}
              </button>
            </div>
          </div>
        )}
        {creating === folder.id && (
          <NameForm
            initial=""
            submitLabel="Створити"
            onSubmit={(name) => create(name, folder.id)}
            onCancel={() => setCreating(null)}
          />
        )}
        {open && (
          <ul className="selfhost-boards__list selfhost-boards__folder-boards">
            {items.map(renderBoard)}
            {items.length === 0 && !needle && (
              <li className="selfhost-boards__folder-empty">
                Порожньо — перетягніть сюди дошку.
              </li>
            )}
          </ul>
        )}
      </li>
    );
  };

  return (
    <div className="selfhost-boards">
      {creating === "" ? (
        <NameForm
          initial=""
          submitLabel="Створити"
          onSubmit={(name) => create(name, "")}
          onCancel={() => setCreating(null)}
        />
      ) : creatingFolder ? (
        <NameForm
          initial=""
          submitLabel="Створити"
          placeholder="Назва папки"
          onSubmit={addFolder}
          onCancel={() => setCreatingFolder(false)}
        />
      ) : (
        <div className="selfhost-boards__toolbar">
          <button
            type="button"
            className="selfhost-boards__primary selfhost-boards__new"
            onClick={() => setCreating("")}
          >
            {PlusIcon}
            Нова дошка
          </button>
          <button
            type="button"
            className="selfhost-boards__new-folder"
            title="Нова папка"
            aria-label="Нова папка"
            onClick={() => setCreatingFolder(true)}
          >
            {folderPlusIcon}
          </button>
        </div>
      )}

      <input
        type="search"
        className="selfhost-boards__search"
        placeholder="Пошук за назвою або автором"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        onKeyDown={(event) => event.stopPropagation()}
      />

      {error && <div className="selfhost-boards__error">Помилка: {error}</div>}

      {boards === null && !error && (
        <div className="selfhost-boards__empty">Завантаження…</div>
      )}

      {boards !== null &&
        shown.length === 0 &&
        (folders.length === 0 || needle) && (
          <div className="selfhost-boards__empty">
            {boards.length ? "Нічого не знайдено." : "Дошок ще немає."}
          </div>
        )}

      {shownFolders.length > 0 && (
        <ul className="selfhost-boards__list">
          {shownFolders.map(renderFolder)}
        </ul>
      )}

      <ul
        className={clsx("selfhost-boards__list selfhost-boards__loose", {
          "selfhost-boards__drop": dropTarget === "",
          // Room to drop a board out of its folder when nothing is loose.
          "selfhost-boards__loose--target": !!dragging && loose.length === 0,
        })}
        {...dropZone("")}
      >
        {loose.map(renderBoard)}
        {!!dragging && loose.length === 0 && (
          <li className="selfhost-boards__folder-empty">
            Перетягніть сюди, щоб винести з папки.
          </li>
        )}
      </ul>

      <Trash onRestored={load} onError={showError} />
    </div>
  );
};
