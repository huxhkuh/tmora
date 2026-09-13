const {
  app,
  BrowserWindow,
  protocol,
  session,
  ipcMain,
  Menu,
  dialog,
} = require("electron");
const { readFile } = require("node:fs/promises");
const path = require("node:path");
const { guardRangeDownloads } = require("./range-download.cjs");
const { createUpdates } = require("./updates.cjs");
const { appURL, updateIdentity, verifyInstaller } = require("./security.cjs");
const ORIGIN = "bou://app";
const root = path.join(__dirname, "..", "dist");
app.setName("תמורה");
app.setPath(
  "userData",
  process.env.BOU_DESKTOP_TEST === "1" && process.env.BOU_TEST_PROFILE
    ? process.env.BOU_TEST_PROFILE
    : path.join(app.getPath("appData"), "BouTime"),
);
protocol.registerSchemesAsPrivileged([
  {
    scheme: "bou",
    privileges: { standard: true, secure: true, supportFetchAPI: true },
  },
]);
const csp =
  "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; worker-src 'none'; object-src 'none'; frame-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'";
const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".woff2": "font/woff2",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webmanifest": "application/manifest+json",
};
let mainWindow, floatingWindow;
let language = "he";
const copy = (he, en) => language === "en" ? en : he;
function trusted(event) {
  return (
    [mainWindow, floatingWindow].some(
      (w) => w && !w.isDestroyed() && w.webContents === event.sender,
    ) &&
    event.senderFrame && event.senderFrame === event.sender.mainFrame &&
    appURL(event.senderFrame.url)
  );
}
function secureWindow(options) {
  const win = new BrowserWindow({
    backgroundColor: "#f5f2eb",
    icon: path.join(__dirname, "icon.ico"),
    show: false,
    ...options,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      backgroundThrottling: true,
    },
  });
  win.removeMenu();
  win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  win.webContents.on("will-navigate", (event, url) => {
    if (!appURL(url)) event.preventDefault();
  });
  win.webContents.on("will-frame-navigate", (event) => {
    if (!event.isMainFrame || !appURL(event.url)) event.preventDefault();
  });
  win.webContents.on("will-redirect", (event, url) => {
    if (!appURL(url)) event.preventDefault();
  });
  win.webContents.on("will-attach-webview", (event) => event.preventDefault());
  win.once("ready-to-show", () => win.show());
  return win;
}
function showMain() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}
function openFloating() {
  if (floatingWindow && !floatingWindow.isDestroyed()) {
    floatingWindow.show();
    floatingWindow.focus();
    return;
  }
  floatingWindow = secureWindow({
    width: 240,
    height: 158,
    minWidth: 220,
    minHeight: 116,
    useContentSize: true,
    frame: false,
    alwaysOnTop: true,
    title: "תמורה · צג צף",
    backgroundColor: "#272923",
  });
  floatingWindow.on("closed", () => {
    floatingWindow = null;
  });
  floatingWindow.loadURL(ORIGIN + "/?floating=1");
}
if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on("second-instance", showMain);
  app.whenReady().then(() => {
    app.setAppUserModelId("il.bou.time");
    Menu.setApplicationMenu(null);
    protocol.handle("bou", async (request) => {
      try {
        const url = new URL(request.url);
        if (url.host !== "app" || !["GET", "HEAD"].includes(request.method))
          return new Response("Forbidden", { status: 403 });
        const pathname = decodeURIComponent(url.pathname);
        const file = path.resolve(
          root,
          "." + (pathname === "/" ? "/index.html" : pathname),
        );
        if (!file.startsWith(root + path.sep) || !types[path.extname(file)])
          return new Response("Forbidden", { status: 403 });
        const body = await readFile(file);
        return new Response(request.method === "HEAD" ? null : body, {
          headers: {
            "Content-Type": types[path.extname(file)],
            "Content-Security-Policy": csp,
            "X-Content-Type-Options": "nosniff",
            "Cache-Control": "no-store",
          },
        });
      } catch {
        return new Response("Not found", { status: 404 });
      }
    });
    session.defaultSession.setPermissionRequestHandler(
      (_wc, _permission, callback) => callback(false),
    );
    session.defaultSession.setPermissionCheckHandler(() => false);
    session.defaultSession.on("will-download", (_event, item) => {
      item.setSaveDialogOptions({
        title: copy("שמירת קובץ מתמורה", "Save a file from Temura"),
        defaultPath: path.join(
          app.getPath("downloads"),
          path.basename(item.getFilename()),
        ),
      });
    });
    ipcMain.handle("bou:set-language", (event, next) => {
      if (!trusted(event) || event.sender !== mainWindow?.webContents || !["he", "en"].includes(next)) throw new Error("Unauthorized language preference");
      language = next;
    });
    ipcMain.handle("bou:open-floating", (event) => {
      if (trusted(event)) openFloating();
    });
    ipcMain.handle("bou:close-floating", (event) => {
      if (trusted(event)) floatingWindow?.close();
    });
    ipcMain.handle("bou:resize-floating", (event, width, height) => {
      if (
        !trusted(event) ||
        event.sender !== floatingWindow?.webContents ||
        !Number.isInteger(width) ||
        !Number.isInteger(height)
      )
        return;
      floatingWindow.setContentSize(
        Math.max(220, Math.min(440, width)),
        Math.max(116, Math.min(450, height)),
      );
    });
    ipcMain.handle("bou:show-entry", (event, id) => {
      if (!trusted(event) || typeof id !== "string" || id.length > 200) return;
      showMain();
      mainWindow.webContents.send("bou:edit-entry", id);
    });
    mainWindow = secureWindow({
      width: 1400,
      height: 960,
      minWidth: 760,
      minHeight: 620,
      title: "תמורה · מעקב זמן עבודה",
    });
    mainWindow.on("closed", () => {
      mainWindow = null;
      app.quit();
    });
    mainWindow.loadURL(ORIGIN + "/");
    const unavailable = !app.isPackaged
      ? "עדכונים פנימיים זמינים בגרסה המותקנת של Windows."
      : process.env.PORTABLE_EXECUTABLE_FILE
        ? "זוהי גרסה ניידת. כדי לקבל עדכונים פנימיים, התקן את תמורה באמצעות המתקין מ־GitHub."
        : null;
    // This library is only needed after an explicit update check. Ordinary time
    // tracking, including the settings screen, need not load it into RAM.
    let updater;
    const updates = createUpdates({
      loadUpdater: () => {
        updater = require("electron-updater").autoUpdater;
        updater.logger = null;
        guardRangeDownloads(updater.httpExecutor);
        return updater;
      },
      version: app.getVersion(), unavailable,
      validateUpdate: updateIdentity,
      verifyDownloaded: (identity) => verifyInstaller(updater.installerPath, identity),
      publish: (status) => {
        if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send("bou:update-status", status);
      },
      confirmInstall: async () => {
        const { response } = await dialog.showMessageBox(mainWindow, {
          type: "question", title: copy("עדכון תמורה", "Temura update"), message: copy("להתקין את העדכון ולהפעיל מחדש?", "Install the update and restart?"),
          detail: copy("חלונות תמורה ייסגרו וייפתחו מחדש אחרי ההתקנה. הנתונים השמורים נשמרים. טיימר פעיל ימשיך למדוד גם בזמן ההתקנה. סיים עריכת טקסט לפני ההמשך.", "Temura will close and reopen after installation. Saved data is preserved. A running timer continues during installation. Finish editing text before proceeding."),
          buttons: [copy("מאוחר יותר", "Later"), copy("התקנה והפעלה מחדש", "Install & restart")], defaultId: 0, cancelId: 0, noLink: true,
        });
        if (response !== 1) return false;
        session.defaultSession.flushStorageData();
        return true;
      },
    });
    ipcMain.handle("bou:update-status", (event) => {
      if (trusted(event) && event.sender === mainWindow?.webContents) return updates.snapshot();
      throw new Error("Unauthorized update request");
    });
    ipcMain.handle("bou:update-action", (event, action) => {
      if (trusted(event) && event.sender === mainWindow?.webContents && ["check", "download", "cancel", "install"].includes(action)) return updates.action(action);
      throw new Error("Unauthorized update request");
    });
  });
  app.on("window-all-closed", () => app.quit());
}
