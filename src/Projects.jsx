import { tr } from "./i18n.js";
import React, { useState } from "react";
import { Plus, Pencil, Play, Folder, ArrowUpLeft, Trash2 } from "lucide-react";
import { Button, Dot, Empty } from "./ui.jsx";
import { duration, hours, money, HOUR, timerSegments } from "./domain.js";
import ProjectChecklist from "./ProjectChecklist.jsx";
import { budgetState, exactDuration } from "./billing.js";
export default function Projects({
  state,
  now,
  edit,
  newProject,
  start,
  mutate,
  removeProject,
}) {
  const [archive, setArchive] = useState(false),
    [query, setQuery] = useState("");
  const projects = state.projects.filter(
    (p) =>
      p.archived === archive &&
      (p.name + " " + state.clients.find((c) => c.id === p.clientId)?.name)
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  return (
    <>
      <div className="toolbar">
        <div className="tabs">
          <button
            aria-pressed={!archive}
            className={!archive ? "selected" : ""}
            onClick={() => setArchive(false)}
          >
            {tr("פעילים")}
          </button>
          <button
            aria-pressed={archive}
            className={archive ? "selected" : ""}
            onClick={() => setArchive(true)}
          >
            {tr("בארכיון")}
          </button>
        </div>
        <input
          className="search"
          aria-label={tr("חיפוש פרויקטים")}
          placeholder={tr("חיפוש פרויקט או לקוח")}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />

        <Button kind="primary" icon={Plus} onClick={newProject}>
          {tr("פרויקט חדש")}
        </Button>
      </div>
      {projects.length ? (
        <div className="project-grid">
          {projects.map((p) => {
            const ms =
                state.entries
                  .filter((e) => e.projectId === p.id)
                  .reduce((n, e) => n + duration(e.segments), 0) +
                (state.timer?.projectId === p.id
                  ? duration(timerSegments(state.timer, now))
                  : 0),
              budget = budgetState(p, ms),
              over = budget.overMs > 0;
            return (
              <article
                className="project-card"
                key={p.id}
                style={{ "--project-color": p.color }}
              >
                <div className="section-head">
                  <span className="project-symbol" style={{ color: p.color }}>
                    <Folder size={23} />
                  </span>
                  <div className="entity-actions">
                    <button
                      className="icon-button"
                      aria-label={tr("עריכת פרויקט {0}", [p.name])}
                      onClick={() => edit(p)}
                    >
                      <Pencil size={17} />
                    </button>
                    <button
                      className="icon-button danger"
                      aria-label={tr("מחיקת פרויקט {0}", [p.name])}
                      title={tr("מחיקת פרויקט")}
                      onClick={() => removeProject(p.id)}
                    >
                      <Trash2 size={17} />
                    </button>
                  </div>
                </div>
                <p className="muted">
                  {state.clients.find((c) => c.id === p.clientId)?.name}
                </p>
                <h2>
                  <bdi>{p.name}</bdi>
                </h2>
                <p className="project-description">
                  <bdi>{p.description || tr("כל שעה מקדמת את הפרויקט.")}</bdi>
                </p>
                <div className="project-numbers">
                  <div>
                    <small>{tr("זמן שהושקע")}</small>
                    <strong>
                      {hours(ms)} <small>{tr("שע׳")}</small>
                    </strong>
                  </div>
                  <div>
                    <small>
                      {p.priceType === "fixed"
                        ? tr("תמורה אפקטיבית לשעה")
                        : p.priceType === "hourly"
                          ? tr("תעריף נוכחי לשעה")
                          : tr("תמחור")}
                    </small>
                    <strong>
                      {p.priceType === "fixed"
                        ? ms
                          ? money(p.price / (ms / HOUR))
                          : "—"
                        : p.priceType === "hourly"
                          ? money(p.price)
                          : tr("לא הוגדר")}
                    </strong>
                  </div>
                </div>
                {p.priceType === "fixed" && (
                  <p className="note">
                    {tr("מחיר כולל: ")}
                    {money(p.price)}
                  </p>
                )}
                {p.goal !== null && p.goal !== undefined && (
                  <div className={`goal ${over ? "over" : ""}`}>
                    <div>
                      <span>
                        {over
                          ? tr("חריגה מתקציב השעות")
                          : tr("ניצול תקציב השעות")}
                      </span>
                      <bdi dir="ltr">
                        {hours(ms)} / {p.goal}
                        {tr(" שע׳")}
                      </bdi>
                    </div>
                    <progress
                      value={
                        p.goal === 0
                          ? ms > 0
                            ? 1
                            : 0
                          : Math.min(ms / HOUR, p.goal)
                      }
                      max={p.goal || 1}
                      aria-label={tr("התקדמות ליעד של {0}", [p.name])}
                    />
                    <p>
                      {tr("נוצלו")}: <bdi>{exactDuration(ms)}</bdi>
                    </p>
                    <p>
                      {tr("יתרה")}:{" "}
                      <bdi>{exactDuration(budget.remainingMs)}</bdi> ·{" "}
                      {tr("חריגה")}: <bdi>{exactDuration(budget.overMs)}</bdi>
                    </p>
                  </div>
                )}
                {p.priceType === "fixed" && (
                  <p className="note">
                    {tr(
                      "התמורה האפקטיבית מחושבת מכל זמן העבודה; הוצאות ומסים אינם מנוכים.",
                    )}
                  </p>
                )}
                <ProjectChecklist
                  project={p}
                  tasks={(state.tasks || []).filter(
                    (t) => t.projectId === p.id,
                  )}
                  mutate={mutate}
                />
                <Button
                  icon={Play}
                  kind="wide"
                  disabled={archive || state.timer?.projectId === p.id}
                  onClick={() => start(p.id)}
                >
                  {state.timer?.projectId === p.id
                    ? tr("נמדד עכשיו")
                    : tr("התחל עבודה")}
                </Button>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="surface">
          <Empty
            title={archive ? tr("הארכיון שלך נקי") : tr("מקום לפרויקט הבא שלך")}
            action={
              !archive && (
                <Button onClick={newProject} icon={ArrowUpLeft}>
                  {tr("יצירת פרויקט")}
                </Button>
              )
            }
          >
            {query
              ? tr("לא נמצאו פרויקטים התואמים לחיפוש.")
              : archive
                ? tr(
                    "פרויקטים שתעביר לארכיון יופיעו כאן. כל השעות שלהם יישארו בדוחות.",
                  )
                : tr(
                    "הגדר לקוח, פרויקט ותמחור \u2014 והתחל להבין את הזמן שלך.",
                  )}
          </Empty>
        </div>
      )}
    </>
  );
}
export function Clients({ state, edit, create, removeClient }) {
  return (
    <>
      <div className="toolbar">
        <p className="muted">{tr("האנשים והעסקים שאתה עובד איתם")}</p>
        <Button kind="primary" icon={Plus} onClick={create}>
          {tr("לקוח חדש")}
        </Button>
      </div>
      <section className="surface">
        {state.clients.length ? (
          <div className="client-list">
            {state.clients.map((c) => (
              <div className="recent-row" key={c.id}>
                <span className="avatar">{c.name.slice(0, 1)}</span>
                <div className="grow">
                  <strong>
                    <bdi>{c.name}</bdi>
                  </strong>
                  <small>
                    {state.projects.filter((p) => p.clientId === c.id).length}{" "}
                    {tr("פרויקטים")}
                  </small>
                </div>
                <div className="entity-actions">
                  <Button icon={Pencil} onClick={() => edit(c)}>
                    {tr("עריכה")}
                  </Button>
                  <button
                    className="icon-button danger"
                    aria-label={tr("מחיקת לקוח {0}", [c.name])}
                    title={tr("מחיקת לקוח")}
                    onClick={() => removeClient(c.id)}
                  >
                    <Trash2 size={18} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <Empty
            title={tr("עבודה טובה מתחילה באנשים")}
            action={
              <Button icon={Plus} onClick={create}>
                {tr("הוספת לקוח ראשון")}
              </Button>
            }
          >
            {tr("הוסף את הלקוח שלך. אחר כך נשייך אליו פרויקטים.")}
          </Empty>
        )}
      </section>
    </>
  );
}
