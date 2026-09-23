import { OnlineUser } from "./types";
import { getAllUsers } from "./presence";
import { listIdentities } from "./identity";

/**
 * Contact directory: online users plus registered identities that opted in to
 * remain visible while offline. Offline entries carry no device information
 * (there is no active device to report).
 */
export function getDirectory(): OnlineUser[] {
  const online = getAllUsers();
  const onlineIds = new Set(online.map((u) => u.persistentId));

  const offline: OnlineUser[] = listIdentities()
    .filter((identity) => identity.discoverable && !onlineIds.has(identity.persistentId))
    .map((identity) => ({
      id: identity.persistentId,
      persistentId: identity.persistentId,
      nickname: identity.nickname,
      os: "",
      browser: "",
      joinedAt: 0,
      isOnline: false,
    }));

  return [...online, ...offline];
}
