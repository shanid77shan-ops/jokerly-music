/** Push a history entry so the Android/TWA hardware back fires popstate instead of closing the app. */
export function pushHistoryEntry() {
  if (typeof window === "undefined") return;
  window.history.pushState({ jkmBack: true }, "", window.location.href);
}
