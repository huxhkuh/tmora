import React, { useCallback, useEffect, useState } from "react";
import CompactClock from "./CompactClock.jsx";
import { read, change, subscribe } from "./store.js";
import { tr } from "./i18n.js";
import "./focus.css";

// History is still read/written atomically by the shared store, but is not kept
// in this window's React state. It only displays projects, clients and a timer.
const clockState = ({ revision, clients, projects, timer }) =>
  ({ revision, clients, projects, timer });

export default function FloatingApp() {
  const [state, setState] = useState(null);
  const [error, setError] = useState("");
  const accept = useCallback((next) => {
    const snapshot = clockState(next);
    setState(current => !current || snapshot.revision > current.revision ? snapshot : current);
    setError("");
  }, []);
  const refresh = useCallback(() => read().then(accept).catch(e => setError(e.message)), [accept]);
  useEffect(() => {
    refresh();
    const unsubscribe = subscribe(refresh);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      unsubscribe();
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [refresh]);
  const mutate = useCallback(async (fn) => {
    const next = await change(fn);
    accept(next);
    // CompactClock inspects the just-saved entry when a long timer is stopped.
    return next;
  }, [accept]);
  if (error) return <main className="fatal" role="alert">
    <p>{error}</p><button onClick={refresh}>{tr("ניסיון נוסף")}</button>
  </main>;
  if (!state) return <main className="fatal">{tr("פותחים את סביבת העבודה שלך…")}</main>;
  return <div className="desktop-floating">
    <CompactClock state={state} mutate={mutate}
      close={() => window.bouDesktop.closeFloating()}
      showEntry={entry => window.bouDesktop.showEntry(entry.id)} />
  </div>;
}
