import AppearanceSettings from "./AppearanceSettings.jsx";
import { tr } from "./i18n.js";
import PwaInstall from "./PwaInstall.jsx";
import DesktopUpdates from "./DesktopUpdates.jsx";
import React, { useState } from "react";
import {
  Download,
  Upload,
  Database,
  ShieldCheck,
  Keyboard,
} from "lucide-react";
import { Button } from "./ui.jsx";
import { download } from "./Reports.jsx";
import {
  validateBackup,
  mergeBackup,
  timerSegments,
  dayKey,
} from "./domain.js";
import { read, readBeforeUpgrade } from "./store.js";
export default function Settings({ state, mutate, notify }) {
  const [pending, setPending] = useState(null),
    [busy, setBusy] = useState(false),
    [persistent, setPersistent] = useState(null);
  const backup = async () => {
    try {
      const s = await read();
      if (s.timer)
        s.timer = {
          ...s.timer,
          segments: timerSegments(s.timer, Date.now()).filter(
            (x) => x.end > x.start,
          ),
          runningSince: null,
        };
      download(
        `bou-backup-${dayKey(Date.now())}.json`,
        JSON.stringify(s, null, 2),
        "application/json",
      );
      notify(tr("הגיבוי המלא הוכן להורדה. שמור אותו במקום בטוח."));
    } catch (e) {
      notify(e.message, true);
    }
  };
  return (
    <div className="settings-grid">
      <AppearanceSettings notify={notify} />
      {window.bouDesktop?.getUpdateStatus && <DesktopUpdates notify={notify} />}
      <section className="surface">
        <Database className="section-icon" />
        <h2>{tr("הזמן שלך. הנתונים שלך.")}</h2>
        {window.bouDesktop ? (
          <p>
            {tr(
              "הנתונים נשמרים מקומית באפליקציית Windows במחשב הזה, בתיקיית %APPDATA%\\BouTime. הם אינם נשלחים לשרת. להעברת הנתונים מהדפדפן, ייצא שם גיבוי מלא וייבא אותו כאן. גיבוי ושחזור אינם מסנכרנים בין הגרסאות.",
            )}
          </p>
        ) : (
          <p>
            {tr(
              "הנתונים נשמרים במסד IndexedDB מקומי, באותו דפדפן ומכשיר ובאותה כתובת. הם אינם נשלחים לשרת. מחיקת נתוני האתר או מעבר לדפדפן אחר עלולים להסיר את הגישה אליהם.",
            )}
          </p>
        )}
        <div className="data-counts">
          <span>
            {state.clients.length}
            {tr(" לקוחות")}
          </span>
          <span>
            {state.projects.length}
            {tr(" פרויקטים")}
          </span>
          <span>
            {state.entries.length}
            {tr(" רישומים")}
          </span>
        </div>
        {!window.bouDesktop && (
          <Button
            icon={ShieldCheck}
            onClick={async () => {
              try {
                const ok = await navigator.storage?.persist?.();
                setPersistent(
                  ok
                    ? tr("הדפדפן אישר שמירה מתמשכת. עדיין מומלץ לגבות.")
                    : tr(
                        "הדפדפן לא אישר שמירה מתמשכת. הנתונים נשמרים, אך חשוב לגבות.",
                      ),
                );
              } catch {
                setPersistent(tr("לא ניתן לבקש שמירה מתמשכת בדפדפן זה."));
              }
            }}
          >
            {tr("בקשת שמירה מתמשכת")}
          </Button>
        )}
        {persistent && (
          <p role="status" className="note">
            {persistent}
          </p>
        )}
      </section>
      <section className="surface">
        <Download className="section-icon" />
        <h2>{tr("גיבוי ושחזור")}</h2>
        <p>
          {tr(
            "גיבוי JSON כולל לקוחות, פרויקטים, משימות, תמחור ורישומים. טיימר פעיל מגובה במצב מושהה עם הזמן עד רגע הייצוא.",
          )}
        </p>
        <Button kind="primary" icon={Download} onClick={backup}>
          {tr("ייצוא גיבוי מלא")}
        </Button>
        <hr />
        <Button onClick={async () => {
          try {
            const original = await readBeforeUpgrade();
            if (!original) { notify(tr("אין גיבוי מלפני השדרוג במכשיר הזה.")); return; }
            download("temura-before-billing-upgrade.json", JSON.stringify(original, null, 2), "application/json");
          } catch (error) { notify(error.message, true); }
        }}>{tr("הורדת הנתונים מלפני השדרוג")}</Button>
        <p className="note">{tr("רישומים ישנים סומנו כטרם סווג. התעריפים והזמנים המקוריים נשמרו.")}</p>
        <label className="field">
          <span>{tr("בחירת קובץ גיבוי לשחזור")}</span>
          <input
            type="file"
            accept=".json,application/json"
            onChange={async (e) => {
              const file = e.target.files[0];
              e.target.value = "";
              if (!file) return;
              try {
                if (file.size > 20 * 1024 * 1024)
                  throw Error(tr("גודל הגיבוי המרבי הוא 20MB."));
                const s = validateBackup(JSON.parse(await file.text()));
                setPending(s);
              } catch (err) {
                notify(
                  err instanceof SyntaxError
                    ? tr("הקובץ אינו JSON תקין.")
                    : err.message,
                  true,
                );
                setPending(null);
              }
            }}
          />
        </label>
        {pending && (
          <div className="import-preview">
            <h3>{tr("הגיבוי תקין ומוכן לייבוא")}</h3>
            <p>
              {pending.clients.length}
              {tr(" לקוחות · ")}
              {pending.projects.length} {tr("פרויקטים · ")}
              {pending.entries.length}
              {tr(" רישומים · ")}
              {pending.tasks.length}
              {tr(" משימות")}
            </p>
            <p className="note">
              {tr(
                "פריטים עם מזהה קיים יישמרו כפי שהם. אין דריסה ואין כפילויות. טיימר מגיבוי ייובא מושהה רק אם אין טיימר מקומי או רישום תואם; זמן פתוח מאז יצירת הגיבוי אינו מתווסף.",
              )}
            </p>
            <Button
              icon={Upload}
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await mutate((s) => mergeBackup(s, pending));
                  setPending(null);
                  notify(tr("הגיבוי מוזג בהצלחה. פריטים קיימים לא שוכפלו."));
                } catch (e) {
                  notify(e.message, true);
                } finally {
                  setBusy(false);
                }
              }}
            >
              {tr("ייבוא ומיזוג")}
            </Button>
            <Button onClick={() => setPending(null)}>{tr("ביטול")}</Button>
          </div>
        )}
      </section>
      <section className="surface">
        <Keyboard className="section-icon" />
        <h2>{tr("בקצב שלך")}</h2>
        <p>{tr("אזור זמן: ישראל · תחילת השבוע: יום ראשון · מטבע: ₪.")}</p>
        <p>
          <kbd>Alt</kbd> + <kbd>N</kbd>
          {tr(" הוספת רישום ידני")}
        </p>
        <p>
          <kbd>Alt</kbd> + <kbd>1</kbd>
          {tr(" חזרה להיום")}
        </p>
        <p>
          <kbd>Esc</kbd>
          {tr(" סגירת טופס")}
        </p>
        <p className="note">
          {tr(
            "קיצורים פועלים מחוץ לשדות הקלדה. כל הכפתורים נגישים גם באמצעות Tab ו־Enter.",
          )}
        </p>
      </section>
      {!window.bouDesktop && <PwaInstall />}
    </div>
  );
}
