// Only the main process owns the updater. Renderer messages cannot set a feed,
// executable path or installation arguments.
function createUpdates({ updater, loadUpdater, version, unavailable = null, publish, confirmInstall, validateUpdate, verifyDownloaded }) {
  let status = { phase: unavailable ? "unavailable" : "idle", currentVersion: version, reason: unavailable, revision: 0 };
  let busy = false;
  let token;
  let identity;
  const set = (next) => {
    status = { currentVersion: version, revision: status.revision + 1, ...next };
    publish({ ...status });
  };
  const fail = () => set({ phase: "error", message: "העדכון לא הושלם. בדוק את החיבור לאינטרנט ואת המקום הפנוי ונסה שוב. הגרסה הנוכחית זמינה לעבודה." });
  function configureUpdater() {
    updater.autoDownload = false;
    updater.autoInstallOnAppQuit = false;
    updater.allowDowngrade = false;
    updater.allowPrerelease = false;
    updater.disableWebInstaller = true;
    updater.disableDifferentialDownload = false;
    updater.on("error", fail);
    updater.on("download-progress", (p) => {
      if (!["downloading", "cancelling"].includes(status.phase)) return;
      if (status.phase === "cancelling") return;
      const finite = (n) => Number.isFinite(n) && n >= 0 ? n : 0;
      set({ ...status, phase: "downloading", percent: Math.min(100, finite(p.percent)), transferred: finite(p.transferred), total: finite(p.total), revision: status.revision + 1 });
    });
  }
  if (updater) configureUpdater();
  return {
    snapshot: () => ({ ...status }),
    async action(action) {
      if (unavailable || (!updater && !loadUpdater)) return { ...status };
      if (action === "cancel") {
        if (status.phase === "downloading" && token) {
          set({ phase: "cancelling", version: status.version });
          token.cancel();
        }
        return { ...status };
      }
      if (busy) return { ...status };
      const allowed = action === "check" && ["idle", "current", "available", "cancelled", "error"].includes(status.phase)
        || action === "download" && status.phase === "available"
        || action === "install" && status.phase === "ready";
      if (!allowed) return { ...status };
      busy = true;
      try {
        if (action === "check") {
          set({ phase: "checking" });
          if (!updater) {
            updater = loadUpdater();
            configureUpdater();
          }
          const result = await updater.checkForUpdates();
          token = result?.cancellationToken;
          if (result?.isUpdateAvailable) {
            identity = validateUpdate(result.updateInfo);
            set({ phase: "available", version: result.updateInfo.version });
          } else set({ phase: "current" });
        } else if (action === "download") {
          const nextVersion = status.version;
          set({ phase: "downloading", version: nextVersion, percent: 0 });
          await updater.downloadUpdate(token);
          if (token?.cancelled) set({ phase: "cancelled" });
          else set({ phase: "ready", version: nextVersion });
        } else if (await confirmInstall()) {
          set({ phase: "verifying", version: status.version });
          await verifyDownloaded(identity);
          set({ phase: "installing", version: status.version });
          // electron-updater 6: install silently, then reopen the application.
          updater.quitAndInstall(true, true);
        }
      } catch {
        if (action === "download" && token?.cancelled) set({ phase: "cancelled" });
        else fail();
      } finally { busy = false; }
      return { ...status };
    },
  };
}
module.exports = { createUpdates };
