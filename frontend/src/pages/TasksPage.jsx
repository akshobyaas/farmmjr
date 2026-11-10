import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useTasks } from "../hooks/useTasks";
import AppHeader from "../components/AppHeader";
import BottomNav from "../components/BottomNav";
import styles from "./TasksPage.module.css";

// Task 15 -- Tasks page with Today/Upcoming/Completed tabs, consuming
// Task 14's three endpoints via useTasks. Tab pills are the shared .chip
// pill (shared.css) -- the same pattern AdvisoryPage's admin filter tabs
// already use (AdvisoryPage.jsx's .advisory-toggle-btn), promoted to the
// real shared class per this task's brief -- and each task is a .list-row
// (shared.css) with a checkbox standing in for the row's usual icon slot.
const TABS = [
  { key: "today", labelKey: "tasks.tabToday" },
  { key: "upcoming", labelKey: "tasks.tabUpcoming" },
  { key: "completed", labelKey: "tasks.tabCompleted" },
];

const EMPTY_KEYS = {
  today: "tasks.emptyToday",
  upcoming: "tasks.emptyUpcoming",
  completed: "tasks.emptyCompleted",
};

export default function TasksPage() {
  const { t } = useTranslation();
  const { tasks, tab, setTab, toggleComplete, loading, error, toggleError } = useTasks();

  return (
    <div className="dashboard-page">
      <AppHeader title={t("tasks.title")} />

      <main className={`app-main ${styles["tasks-main"]}`}>
        <div className={styles["tasks-tabs"]}>
          {TABS.map(({ key, labelKey }) => (
            <button
              key={key}
              type="button"
              className={`chip ${styles["tasks-tab"]} ${tab === key ? styles["tasks-tab-active"] : ""}`}
              aria-pressed={tab === key}
              onClick={() => setTab(key)}
            >
              {t(labelKey)}
            </button>
          ))}
        </div>

        {loading && <p className="status-message">{t("common.loading")}</p>}
        {error && (
          <p className="form-error" role="alert">
            {t("tasks.loadError")}
          </p>
        )}
        {/* Fix round 1 (review finding 4) -- a toggle failure is reported
            through its own `toggleError`, separate from the load-only
            `error` above, specifically so it does NOT gate the task list
            below: the list already loaded fine, only the action failed. */}
        {toggleError && (
          <p className="form-error" role="alert">
            {t("tasks.toggleError")}
          </p>
        )}

        {!loading && !error && tasks.length === 0 && (
          <p className="status-message">{t(EMPTY_KEYS[tab] || EMPTY_KEYS.today)}</p>
        )}

        {!loading && !error && tasks.length > 0 && (
          <ul className={styles["tasks-list"]}>
            {tasks.map((task) => (
              <li key={task.id}>
                <label
                  className={`list-row ${styles["tasks-row"]} ${
                    task.completed ? styles["tasks-row-completed"] : ""
                  }`}
                >
                  <input
                    type="checkbox"
                    className={styles["tasks-checkbox"]}
                    checked={task.completed}
                    onChange={() => toggleComplete(task)}
                  />
                  <span className="list-row-text">
                    <span className={styles["tasks-category"]}>
                      {t(`dashboard.taskCategories.${task.category}`, { defaultValue: task.category })}
                    </span>
                    <span
                      className={`list-row-title ${
                        task.completed ? styles["tasks-instruction-done"] : ""
                      }`}
                    >
                      {task.instruction}
                    </span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
        )}

        <p className="auth-switch">
          <Link to="/dashboard">{t("common.backToDashboard")}</Link>
        </p>
      </main>
      <BottomNav />
    </div>
  );
}
