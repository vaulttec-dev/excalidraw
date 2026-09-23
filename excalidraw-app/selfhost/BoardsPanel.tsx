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
  currentRoom,
  deleteBoard,
  fetchBoards,
  fetchTrash,
  fetchVersions,
  generateRoom,
  openBoard,
  restoreFromTrash,
  restoreVersion,
  saveBoard,
} from "./api";
import { historyIcon } from "./icons";

import "./BoardsPanel.scss";

import type { Board, TrashedBoard, Version } from "./api";

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
  onSubmit,
  onCancel,
}: {
  initial: string;
  submitLabel: string;
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
        placeholder="Назва дошки"
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
              <button type="button" onClick={() => restore(item)}>
                Відновити
              </button>
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
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [historyOf, setHistoryOf] = useState<string | null>(null);
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
      setBoards(await fetchBoards());
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

  const shown = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return (boards ?? []).filter(
      (board) =>
        !needle ||
        board.name.toLowerCase().includes(needle) ||
        board.createdBy.toLowerCase().includes(needle),
    );
  }, [boards, query]);

  const run = async (action: () => Promise<unknown>) => {
    try {
      await action();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const [creatingBusy, setCreatingBusy] = useState(false);

  const create = (name: string) => {
    // A second submit while the first is under way would make a second board.
    if (creatingBusy) {
      return;
    }
    setCreatingBusy(true);
    run(async () => {
      const room = generateRoom();
      await saveBoard(room.id, room.key, name);
      await openBoard(room, excalidrawAPI);
      setCreating(false);
      await load();
    }).finally(() => setCreatingBusy(false));
  };

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

  return (
    <div className="selfhost-boards">
      {creating ? (
        <NameForm
          initial=""
          submitLabel="Створити"
          onSubmit={create}
          onCancel={() => setCreating(false)}
        />
      ) : (
        <button
          type="button"
          className="selfhost-boards__primary selfhost-boards__new"
          onClick={() => setCreating(true)}
        >
          {PlusIcon}
          Нова дошка
        </button>
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

      {boards !== null && shown.length === 0 && (
        <div className="selfhost-boards__empty">
          {boards.length ? "Нічого не знайдено." : "Дошок ще немає."}
        </div>
      )}

      <ul className="selfhost-boards__list">
        {shown.map((board) =>
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
              })}
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
              {historyOf === board.id && (
                <Versions board={board} onError={showError} />
              )}
            </li>
          ),
        )}
      </ul>

      <Trash onRestored={load} onError={showError} />
    </div>
  );
};
