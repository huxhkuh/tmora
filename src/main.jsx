import { applyPreferences, subscribePreferences } from "./preferences.js";
import React from "react";
import { createRoot } from "react-dom/client";
import "@fontsource-variable/heebo";
import "./style.css";
import "./polish.css";
import "./appearance.css";
applyPreferences();
subscribePreferences(applyPreferences);
// The desktop clock does not need the dashboard, reports, forms or settings.
// Dynamic entry points keep that code out of its renderer entirely.
const { default: App } = await (
  window.bouDesktop && new URLSearchParams(location.search).get("floating") === "1"
    ? import("./FloatingApp.jsx")
    : import("./App.jsx")
);
createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

if (
  import.meta.env.PROD &&
  !window.bouDesktop &&
  "serviceWorker" in navigator
) {
  navigator.serviceWorker
    .register("/sw.js")
    .catch((error) =>
      console.warn("Offline registration failed:", error.message),
    );
}
