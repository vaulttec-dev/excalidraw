import { DEFAULT_SIDEBAR } from "@excalidraw/common";
import { useExcalidrawAPI } from "@excalidraw/excalidraw";
import { MainMenu } from "@excalidraw/excalidraw/index";
import React, { useEffect, useState } from "react";

import { BOARDS_TAB, LOGOUT_URL, fetchAccount } from "./api";
import { boardsIcon, logoutIcon } from "./icons";

import type { Account } from "./api";

/**
 * Main menu entries for the self-hosted instance: the team's boards, the GitHub
 * account the session belongs to, and signing out. They take the place of the
 * Excalidraw+ sign-up links, which lead to a service this instance is not.
 */
export const AccountMenuItems = () => {
  const excalidrawAPI = useExcalidrawAPI();
  const [account, setAccount] = useState<Account | null>(null);

  useEffect(() => {
    fetchAccount().then(setAccount);
  }, []);

  return (
    <>
      <MainMenu.Item
        icon={boardsIcon}
        onSelect={() =>
          excalidrawAPI?.toggleSidebar({
            name: DEFAULT_SIDEBAR.name,
            tab: BOARDS_TAB,
            force: true,
          })
        }
      >
        Дошки команди
      </MainMenu.Item>
      {account && (
        <MainMenu.ItemCustom>
          <div className="selfhost-account">
            {account.avatarUrl && (
              <img src={account.avatarUrl} alt="" width={20} height={20} />
            )}
            <span>
              GitHub: <strong>{account.login}</strong>
            </span>
          </div>
        </MainMenu.ItemCustom>
      )}
      {/* Not an ItemLink: those always open in a new tab. */}
      <MainMenu.Item
        icon={logoutIcon}
        onSelect={() => window.location.assign(LOGOUT_URL)}
      >
        Вийти
      </MainMenu.Item>
    </>
  );
};
