// Everyone on this deployment signs in with GitHub, so collaborators are named
// by their GitHub login instead of upstream's random "Adolescent Lemur", and
// shown with their GitHub avatar.
//
// The avatar is not sent over the wire: the login already travels with every
// cursor and idle update, and each client derives the avatar URL from it. That
// keeps the collaboration protocol exactly as upstream has it.

import { fetchAccount } from "./api";

import type { Collaborator, SocketId } from "@excalidraw/excalidraw/types";

import type { CollabAPI } from "../collab/Collab";

/**
 * Shows each person once. Every open tab is a connection of its own, and a new
 * tab opens the last board, so one person with a few tabs showed up as a few
 * collaborators. Your own other tabs are left out; for anyone else the tab they
 * used last stands for them, which keeps their live cursor. Connections that
 * have not told their name yet are left as they are.
 */
export const onePerPerson = (
  collaborators: Map<SocketId, Collaborator>,
  lastActive: Map<SocketId, number>,
): Map<SocketId, Collaborator> => {
  const me = [...collaborators.values()].find((c) => c.isCurrentUser)?.username;
  const chosen = new Map<string, SocketId>();
  for (const [socketId, collaborator] of collaborators) {
    const name = collaborator.username;
    if (!name || collaborator.isCurrentUser) {
      continue;
    }
    const current = chosen.get(name);
    if (
      current === undefined ||
      (lastActive.get(socketId) ?? 0) > (lastActive.get(current) ?? 0)
    ) {
      chosen.set(name, socketId);
    }
  }

  const shown = new Map<SocketId, Collaborator>();
  for (const [socketId, collaborator] of collaborators) {
    const name = collaborator.username;
    if (
      !name ||
      collaborator.isCurrentUser ||
      (name !== me && chosen.get(name) === socketId)
    ) {
      shown.set(socketId, collaborator);
    }
  }
  return shown;
};

const GITHUB_LOGIN = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/;

/** The GitHub avatar for a collaborator named by a GitHub login. */
export const githubAvatarUrl = (username?: string | null) =>
  username && GITHUB_LOGIN.test(username)
    ? `https://github.com/${username}.png?size=64`
    : undefined;

/**
 * Names the session after the signed-in GitHub account. Applied again shortly
 * after: on a first visit the app picks a random name asynchronously when it
 * joins a room, and that can land after this one.
 */
export const applyGithubIdentity = async (collabAPI: CollabAPI) => {
  const account = await fetchAccount();
  if (!account?.login) {
    return;
  }
  const apply = () => {
    if (collabAPI.getUsername() !== account.login) {
      collabAPI.setUsername(account.login);
    }
  };
  apply();
  window.setTimeout(apply, 3000);
};
