import {
  getPreferences,
  subscribePreferences,
  applyPreferences,
} from "./preferences.js";
import { tr, locale } from "./i18n.js";
import { useDisplayNow } from "./useDisplayNow.js";
import React, {
  useState,
  useEffect,
  useCallback,
  useMemo,
  useSyncExternalStore,
} from "react";
import {
  Clock3,
  Folder,
  Users,
  ChartNoAxesCombined,
  Database,
  Plus,
  Check,
  X,
  ArrowUpLeft,
} from "lucide-react";
import { read, change, subscribe, demo } from "./store.js";
import { timerAction, dayKey, hms, elapsed } from "./domain.js";
import { Button, Modal } from "./ui.jsx";
import { ClientForm, ProjectForm, EntryForm } from "./forms.jsx";
import Dashboard from "./Dashboard.jsx";
import DeleteEntity from "./DeleteEntity.jsx";
import { deletionPreview } from "./deletion.js";
import Projects, { Clients } from "./Projects.jsx";
import Reports from "./Reports.jsx";
import Settings from "./Settings.jsx";
import FocusTools from "./FocusTools.jsx";
const getNav = () => [
  ["today", tr("היום"), Clock3],
  ["projects", tr("פרויקטים"), Folder],
  ["clients", tr("לקוחות"), Users],
  ["reports", tr("דוחות"), ChartNoAxesCombined],
  ["settings", tr("גיבוי והגדרות"), Database],
];

export default function App() {
  const prefs = useSyncExternalStore(subscribePreferences, getPreferences);
  const NAV = getNav();
  const dateFormatter = useMemo(() => new Intl.DateTimeFormat(locale(), {
    timeZone: "Asia/Jerusalem", weekday: "long", day: "numeric", month: "long", year: "numeric",
  }), [prefs.language]);
  useEffect(() => {
    applyPreferences();
    window.bouDesktop?.setLanguage?.(prefs.language).catch(() => {});
  }, [prefs]);
  const [state, setState] = useState(null),
    [loadError, setLoadError] = useState(""),
    [page, setPage] = useState("today"),
    [modal, setModal] = useState(null),
    [toast, setToast] = useState(null);
  const now = useDisplayNow(state?.timer?.runningSince != null);
  const notify = useCallback(
    (text, error = false) => setToast({ text, error, id: Date.now() }),
    [],
  );
  const refresh = useCallback(
    () =>
      read()
        .then((s) =>
          setState((current) =>
            !current || s.revision >= current.revision ? s : current,
          ),
        )
        .catch((e) => setLoadError(e.message)),
    [],
  );
  useEffect(() => {
    refresh();
    const unsub = subscribe(refresh);
    const focus = () => refresh();
    window.addEventListener("focus", focus);
    document.addEventListener("visibilitychange", focus);
    return () => {
      unsub();
      window.removeEventListener("focus", focus);
      document.removeEventListener("visibilitychange", focus);
    };
  }, [refresh]);
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 7000);
    return () => clearTimeout(id);
  }, [toast]);
  useEffect(() => {
    document.title = state?.timer
      ? tr("{0} · תמורה", [hms(elapsed(state.timer, now))])
      : tr("תמורה · מעקב זמן עבודה");
  }, [state?.timer, now, prefs.language]);
  const mutate = useCallback(async (fn) => {
    const s = await change(fn);
    setState((current) =>
      !current || s.revision >= current.revision ? s : current,
    );
    return s;
  }, []);
  useEffect(
    () =>
      window.bouDesktop?.onEditEntry(async (id) => {
        const current = await read();
        const item = current.entries.find((e) => e.id === id);
        if (item) {
          setState(current);
          setModal({ type: "entry", item });
        }
      }),
    [],
  );
  const newProject = () => {
    if (!state.clients.length) {
      setModal({ type: "client", next: "project" });
      notify(tr("נתחיל בהוספת לקוח, ואז ניצור את הפרויקט."));
    } else setModal({ type: "project" });
  };
  const manual = () => {
    if (!state.projects.length) {
      newProject();
      return;
    }
    setModal({ type: "entry" });
  };
  useEffect(() => {
    const onKey = (e) => {
      if (modal || /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
      if (e.altKey && e.code === "Digit1") {
        e.preventDefault();
        setPage("today");
      }
      if (e.altKey && e.code === "KeyN" && state) {
        e.preventDefault();
        manual();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [state, modal]);
  const start = async (projectId) => {
    try {
      await mutate((s) =>
        timerAction(s, {
          type: "start",
          projectId,
          expected: state.timer?.id ?? null,
        }),
      );
      setPage("today");
      notify(
        state.timer
          ? tr("הזמן הקודם נשמר. המדידה החדשה התחילה.")
          : tr("המדידה התחילה."),
      );
    } catch (e) {
      notify(e.message, true);
    }
  };
  const editEntry = (item) => setModal({ type: "entry", item });
  const removeEntity = (kind, id) => {
    const confirmation = deletionPreview(state, kind, id);
    if (confirmation) setModal({ type: "deleteEntity", confirmation });
  };
  const remove = (id) => setModal({ type: "delete", id });
  if (loadError)
    return (
      <main className="fatal">
        <h1>{tr("לא הצלחנו לפתוח את הנתונים")}</h1>
        <p>{loadError}</p>
        <p>
          {tr(
            "יש לאפשר שמירת נתונים בדפדפן ולנסות שוב. לא נעשו שינויים בנתונים.",
          )}
        </p>
        <Button onClick={() => location.reload()}>{tr("ניסיון נוסף")}</Button>
      </main>
    );

  if (!state)
    return (
      <main className="fatal">{tr("פותחים את סביבת העבודה שלך\u2026")}</main>
    );

  const titles = {
    today: tr("היום שלך, בקצב שלך."),
    projects: tr("לכל פרויקט יש זמן."),
    clients: tr("הלקוחות שלך."),
    reports: tr("רואים את התמונה המלאה."),
    settings: tr("הכול נשאר בידיים שלך."),
  };
  const common = {
    state,
    now,
    mutate,
    notify,
    newProject,
    editEntry,
    remove,
    start,
    manual,
  };
  return (
    <div className="app-shell">
      <a href="#main" className="skip-link">
        {tr("דילוג לתוכן הראשי")}
      </a>
      <aside className="sidebar">
        <div className="brand">
          {tr("תמורה")}
          <span>.</span>
          <small>{tr("מעקב זמן עבודה")}</small>
        </div>
        <nav aria-label={tr("ניווט ראשי")}>
          {NAV.map(([key, label, Icon]) => (
            <button
              key={key}
              aria-current={page === key ? "page" : undefined}
              className={page === key ? "active" : ""}
              onClick={() => setPage(key)}
            >
              <Icon size={20} />
              <span>{label}</span>
            </button>
          ))}
        </nav>
        <div className="sidebar-footer">
          <span className="local-dot" />
          {tr("סביבת העבודה האישית שלך")}
          <small>{tr("נשמר מקומית · בלי הסחות דעת")}</small>
        </div>
      </aside>
      <main id="main" className="main">
        {demo && (
          <p className="error">
            {tr("מצב הדגמה נפרד · הנתונים כאן אינם הנתונים האישיים שלך.")}{" "}
            <a href="/">{tr("חזרה לאפליקציה האישית")}</a>
          </p>
        )}
        <header className="page-header">
          <div>
            <span className="page-eyebrow">
              {tr("מרחב העבודה שלך ")}
              <span aria-hidden="true">/</span>{" "}
              {NAV.find(([key]) => key === page)?.[1]}
            </span>
            <h1>{titles[page]}</h1>
            <p>
              {page === "today"
                ? dateFormatter.format(now)
                : page === "projects"
                  ? tr("מהרעיון הראשון ועד השעה האחרונה.")
                  : page === "reports"
                    ? tr("זמן, עבודה ותמורה \u2014 במקום אחד.")
                    : page === "clients"
                      ? tr("כל שיתוף פעולה מתחיל כאן.")
                      : tr("שמירה מקומית, גיבוי והרגלים טובים.")}
            </p>
          </div>
          <div className="page-actions">
            <FocusTools {...{ state, mutate, notify, editEntry }} />
            {page === "today" && (
              <Button icon={Plus} onClick={manual}>
                {tr("הוספה ידנית")}
              </Button>
            )}
          </div>
        </header>
        {state.timer && page !== "today" && (
          <button className="mini-timer" onClick={() => setPage("today")}>
            <Clock3 size={18} />
            <bdi>
              {state.projects.find((p) => p.id === state.timer.projectId)?.name}
            </bdi>
            <bdi>{hms(elapsed(state.timer, now))}</bdi>
            <span>
              {state.timer.runningSince === null ? tr("מושהה") : tr("במדידה")}
            </span>
            <ArrowUpLeft size={18} />
          </button>
        )}
        {page === "today" && <Dashboard {...common} navigate={setPage} />}
        {page === "projects" && (
          <Projects
            {...common}
            edit={(item) => setModal({ type: "project", item })}
            removeProject={(id) => removeEntity("project", id)}
          />
        )}
        {page === "clients" && (
          <Clients
            state={state}
            edit={(item) => setModal({ type: "client", item })}
            create={() => setModal({ type: "client" })}
            removeClient={(id) => removeEntity("client", id)}
          />
        )}
        {page === "reports" && <Reports {...common} />}
        {page === "settings" && <Settings {...common} />}
        <footer className="main-footer">
          <span>{tr("הזמן שלך. העבודה שלך. התמורה שלך.")}</span>
          <span>{tr("שעון ישראל · שבוע מתחיל ביום ראשון")}</span>
        </footer>
      </main>
      {modal && (
        <Modal
          title={
            modal.type === "client"
              ? modal.item
                ? tr("עריכת לקוח")
                : tr("לקוח חדש")
              : modal.type === "project"
                ? modal.item
                  ? tr("עריכת פרויקט")
                  : tr("פרויקט חדש")
                : modal.type === "entry"
                  ? modal.item
                    ? tr("עריכת רישום")
                    : tr("הוספת עבודה ידנית")
                  : modal.type === "deleteEntity"
                    ? modal.confirmation.kind === "client" ? tr("מחיקת לקוח") : tr("מחיקת פרויקט")
                    : tr("למחוק את הרישום?")
          }
          close={() => setModal(null)}
        >
          {modal.type === "client" && (
            <ClientForm
              item={modal.item}
              mutate={mutate}
              close={(saved) =>
                setModal(
                  saved === true && modal.next ? { type: modal.next } : null,
                )
              }
            />
          )}
          {modal.type === "project" && (
            <ProjectForm
              item={modal.item}
              {...{ state, mutate }}
              close={() => setModal(null)}
            />
          )}
          {modal.type === "entry" && (
            <EntryForm
              item={modal.item}
              {...{ state, mutate }}
              close={() => setModal(null)}
            />
          )}
          {modal.type === "deleteEntity" && (
            <DeleteEntity confirmation={modal.confirmation} {...{ state, mutate, notify }} close={() => setModal(null)} />
          )}
          {modal.type === "delete" && (
            <>
              <p>
                {tr(
                  "רישום הזמן יימחק מהפרויקט ומהדוחות. הפעולה אינה ניתנת לביטול.",
                )}
              </p>
              <div className="form-footer">
                <Button
                  kind="primary"
                  onClick={async () => {
                    try {
                      await mutate((s) => {
                        s.entries = s.entries.filter((e) => e.id !== modal.id);
                      });
                      setModal(null);
                      notify(tr("הרישום נמחק."));
                    } catch (e) {
                      notify(e.message, true);
                    }
                  }}
                >
                  {tr("כן, מחיקת הרישום")}
                </Button>
                <Button onClick={() => setModal(null)}>{tr("ביטול")}</Button>
              </div>
            </>
          )}
        </Modal>
      )}
      {toast && (
        <div
          className={`toast ${toast.error ? "is-error" : ""}`}
          role={toast.error ? "alert" : "status"}
        >
          {toast.error ? <X size={18} /> : <Check size={18} />}
          <span>{toast.text}</span>
          <button aria-label={tr("סגירת הודעה")} onClick={() => setToast(null)}>
            <X size={16} />
          </button>
        </div>
      )}
    </div>
  );
}
