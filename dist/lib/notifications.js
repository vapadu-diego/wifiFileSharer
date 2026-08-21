"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.requestNotificationPermission = requestNotificationPermission;
exports.showBrowserNotification = showBrowserNotification;
/**
 * Requests browser permission to show HTML5 desktop notifications.
 */
function requestNotificationPermission() {
    if (typeof window !== "undefined" && "Notification" in window) {
        if (Notification.permission === "default") {
            Notification.requestPermission().then((permission) => {
                console.log("Notification permission:", permission);
            });
        }
    }
}
/**
 * Displays a browser notification if the tab is hidden or lacks focus.
 */
function showBrowserNotification(title, body, iconUrl = "/icon.png") {
    if (typeof window !== "undefined" && "Notification" in window) {
        if (Notification.permission === "granted" && (document.hidden || !document.hasFocus())) {
            try {
                const notification = new Notification(title, {
                    body,
                    icon: iconUrl,
                });
                notification.onclick = () => {
                    window.focus();
                    notification.close();
                };
            }
            catch (err) {
                console.error("Error showing browser notification:", err);
            }
        }
    }
}
