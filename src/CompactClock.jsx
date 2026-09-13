import { getPreferences, subscribePreferences, setPreference } from "./preferences.js";
import { tr } from "./i18n.js";
import { useDisplayNow } from "./useDisplayNow.js";
import React, { useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  Minimize2,
  Maximize2,
  Sun,
  Moon,
  X,
  Play,
  Pause,
  Square,
} from "lucide-react";
import { elapsed, hms, HOUR, timerAction } from "./domain.js";

export default function CompactClock({
  state,
  mutate,
  owner = window,
  close,
  showEntry,
}) {
  const [tiny, setTiny] = useState(() => {
    try {
      return localStorage.getItem("bou-float-tiny") !== "false";
    } catch {
      return true;
    }
  });
  const prefs = useSyncExternalStore(subscribePreferences, getPreferences);
  const light = prefs.mode === "light";
  const now = useDisplayNow(state.timer?.runningSince != null, owner);
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const timer = state.timer;
  useEffect(() => {
    if (window.bouDesktop) document.title = timer
      ? tr("{0} · תמורה", [hms(elapsed(timer, now))])
      : tr("תמורה · מעקב זמן עבודה");
  }, [timer, now, prefs.language]);
  const projects = state.projects.filter(
    (p) => !p.archived || p.id === timer?.projectId,
  );
  const long = timer && now - timer.createdAt > 12 * HOUR;
  useEffect(() => {
    try {
      localStorage.setItem("bou-float-tiny", String(tiny));
    } catch {
      /* Preferences must never block tracking. */
    }
    const width = tiny ? 240 : 340;
    const height = Math.max(
      124,
      (tiny ? 86 : 125) +
        Math.min(4, projects.length) * (tiny ? 34 : 46) +
        (long ? 38 : 0) +
        (error ? 40 : 0),
    );
    if (window.bouDesktop?.resizeFloating)
      window.bouDesktop
        .resizeFloating(width, height)
        .catch(() => setError(tr("לא ניתן לשנות את גודל החלון כרגע.")));
    else if (owner !== window) {
      try {
        owner.resizeTo(width, height);
      } catch {
        /* Some browsers enforce their own minimum size. */
      }
    }
  }, [tiny, projects.length, !!long, !!error, owner]);
  async function act(type, projectId = projects[0]?.id) {
    if (inFlight.current) return;
    if (type === "start" && timer?.projectId === projectId) {
      if (timer.runningSince !== null) return;
      type = "resume";
    }
    const observed = timer;
    inFlight.current = true;
    setBusy(true);
    setError("");
    try {
      const next = await mutate((s) =>
        timerAction(s, { type, projectId, expected: observed?.id ?? null }),
      );
      if (
        observed &&
        Date.now() - observed.createdAt > 12 * HOUR &&
        next.timer?.id !== observed.id
      ) {
        const entry = next.entries.find((e) => e.id === observed.id);
        if (entry) showEntry(entry);
      }
    } catch (e) {
      setError(e.message);
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }
  const pauseLabel = timer?.runningSince === null ? tr("המשך") : tr("השהיה");
  return (
    <section
      className={`compact-clock ${tiny ? "is-tiny" : ""} ${light ? "is-light" : ""}`}
      aria-label={tr("שעון צף")}
    >
      <header className="compact-header">
        <span className="compact-brand">
          {tr("תמורה")}
          <span>.</span>
        </span>
        <div className="compact-tools">
          <button
            title={tiny ? tr("הגדלת הצג") : tr("מצב זעיר")}
            aria-label={tiny ? tr("הגדלת הצג") : tr("מצב זעיר")}
            onClick={() => setTiny(!tiny)}
          >
            {tiny ? <Maximize2 /> : <Minimize2 />}
          </button>
          <button
            title={light ? tr("מעבר לצג כהה") : tr("מעבר לצג בהיר")}
            aria-label={light ? tr("מעבר לצג כהה") : tr("מעבר לצג בהיר")}
            onClick={() => {
              try { setPreference("mode", light ? "dark" : "light"); }
              catch { setError(tr("לא הצלחנו לשמור את ההעדפות. בדוק הרשאות שמירה ומקום פנוי.")); }
            }}
          >
            {light ? <Moon /> : <Sun />}
          </button>
          <button
            title={tr("סגירת הצג הצף")}
            aria-label={tr("סגירת הצג הצף")}
            onClick={close}
          >
            <X />
          </button>
        </div>
      </header>
      <div className="compact-measure">
        <span className="focus-digits" dir="ltr" aria-label={tr("זמן בצג")}>
          {hms(elapsed(timer, now))}
        </span>
        <div className="compact-actions">
          {timer ? (
            <React.Fragment key={timer.id}>
              <button
                key={pauseLabel}
                title={pauseLabel}
                aria-label={pauseLabel}
                disabled={busy}
                onClick={() =>
                  act(timer.runningSince === null ? "resume" : "pause")
                }
              >
                {timer.runningSince === null ? <Play /> : <Pause />}
              </button>
              <button
                key="stop"
                className="compact-stop"
                title={tr("עצירה ושמירה")}
                aria-label={tr("עצירה ושמירה")}
                disabled={busy}
                onClick={() => act("stop")}
              >
                <Square />
              </button>
            </React.Fragment>
          ) : (
            <button
              key="start"
              title={tr("התחל מדידה")}
              aria-label={tr("התחל מדידה")}
              disabled={busy || !projects.length}
              onClick={() => act("start")}
            >
              <Play />
            </button>
          )}
        </div>
      </div>
      <div
        className="compact-projects"
        role="group"
        aria-label={tr("מעבר בין פרויקטים")}
      >
        {projects.map((p) => (
          <button
            key={p.id}
            className={`compact-project ${timer?.projectId === p.id ? "is-active" : ""}`}
            style={{ "--project-color": p.color }}
            disabled={busy}
            aria-label={tr("עבודה על {0}", [p.name])}
            aria-pressed={timer?.projectId === p.id}
            title={`${p.name} · ${state.clients.find((c) => c.id === p.clientId)?.name || ""}${timer?.projectId === p.id ? "" : tr(" \u2014 לחיצה שומרת את המדידה הקודמת ומתחילה כאן")}`}
            onClick={() => act("start", p.id)}
          >
            <i className="compact-project-dot" />
            <span className="compact-project-name">
              <bdi>{p.name}</bdi>
              {!tiny && (
                <small>
                  <bdi>
                    {state.clients.find((c) => c.id === p.clientId)?.name}
                  </bdi>
                </small>
              )}
            </span>
            {timer?.projectId === p.id ? (
              <span
                className="compact-running"
                aria-label={
                  timer.runningSince === null ? tr("מושהה") : tr("במדידה")
                }
              >
                {timer.runningSince === null ? (
                  <Pause />
                ) : (
                  <span className="compact-live" />
                )}
              </span>
            ) : (
              <Play className="compact-row-play" />
            )}
          </button>
        ))}
        {!projects.length && (
          <p className="compact-empty">
            {tr("צור פרויקט באפליקציה כדי להתחיל.")}
          </p>
        )}
      </div>
      {long && (
        <p className="compact-warning" role="status">
          {tr("מעל 12 שעות \u2014 עצור ובדוק את הסיום.")}
        </p>
      )}
      {error && (
        <p className="compact-error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
