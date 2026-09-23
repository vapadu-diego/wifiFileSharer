"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getDirectory = getDirectory;
const presence_1 = require("./presence");
const identity_1 = require("./identity");
/**
 * Contact directory: online users plus registered identities that opted in to
 * remain visible while offline. Offline entries carry no device information
 * (there is no active device to report).
 */
function getDirectory() {
    const online = (0, presence_1.getAllUsers)();
    const onlineIds = new Set(online.map((u) => u.persistentId));
    const offline = (0, identity_1.listIdentities)()
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
