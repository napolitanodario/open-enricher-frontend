"use client";

import { useEffect, useRef, useState } from "react";
import {
  Activity,
  Check,
  Film,
  FolderOpen,
  GitBranch,
  Layers3,
  LockKeyhole,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  Sun,
} from "lucide-react";

export const sections = {
  Scenes: Film,
  Overview: Layers3,
  Evaluation: Check,
  Performance: Activity,
  Pipeline: GitBranch,
};
export type Tab = keyof typeof sections;

export function ThemeToggle() {
  const [dark, setDark] = useState(false);
  useEffect(() => {
    setDark(document.documentElement.dataset.theme === "dark");
  }, []);
  const label = dark ? "Switch to light theme" : "Switch to dark theme";
  return (
    <button
      type="button"
      className="theme-toggle"
      title={label}
      aria-label={label}
      onClick={() => {
        const theme = dark ? "light" : "dark";
        document.documentElement.dataset.theme = theme;
        setDark(theme === "dark");
        try {
          localStorage.setItem("oe-theme", theme);
        } catch {}
      }}
    >
      {dark ? <Sun size={19} /> : <Moon size={19} />}
      <span className="rail-label">{dark ? "Light theme" : "Dark theme"}</span>
    </button>
  );
}

export function WorkspaceNavigation({
  active,
  hasRun,
  sceneCount,
  onCatalog,
  onSelect,
  onLock,
}: {
  active: Tab | "Experiments";
  hasRun: boolean;
  sceneCount?: number;
  onCatalog: () => void;
  onSelect: (tab: Tab) => void;
  onLock: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const toggleButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    try {
      setExpanded(localStorage.getItem("oe-navigation") === "expanded");
    } catch {}
  }, []);
  function toggle() {
    setExpanded(!expanded);
    try {
      localStorage.setItem(
        "oe-navigation",
        expanded ? "collapsed" : "expanded",
      );
    } catch {}
  }
  const toggleLabel = expanded ? "Collapse sidebar" : "Expand sidebar";
  return (
    <>
      <aside
        className="rail"
        data-expanded={expanded}
        onKeyDown={(event) => {
          if (expanded && event.key === "Escape") {
            toggle();
            toggleButton.current?.focus();
          }
        }}
      >
        <button
          ref={toggleButton}
          className="rail-toggle"
          title={toggleLabel}
          aria-label={toggleLabel}
          aria-expanded={expanded}
          aria-controls="workspace-navigation"
          onClick={toggle}
        >
          {expanded ? (
            <PanelLeftClose size={20} />
          ) : (
            <PanelLeftOpen size={20} />
          )}
          <span className="rail-label">Collapse sidebar</span>
        </button>
        <nav id="workspace-navigation" aria-label="Workspace navigation">
          <button
            title="Experiment catalog"
            aria-label="Experiments"
            aria-current={active === "Experiments" ? "page" : undefined}
            onClick={onCatalog}
          >
            <FolderOpen size={20} />
            <span className="rail-label">Experiments</span>
          </button>
          <div className="rail-sections">
            {(Object.keys(sections) as Tab[]).map((tab) => {
              const Icon = sections[tab];
              return (
                <button
                  key={tab}
                  title={tab}
                  aria-label={tab}
                  aria-current={tab === active ? "page" : undefined}
                  disabled={!hasRun}
                  onClick={() => onSelect(tab)}
                >
                  <Icon size={19} />
                  <span className="rail-label">{tab}</span>
                  {tab === "Scenes" && sceneCount !== undefined && (
                    <span className="rail-count">{sceneCount}</span>
                  )}
                </button>
              );
            })}
          </div>
        </nav>
        <div className="rail-bottom">
          <ThemeToggle />
          <button
            title="Lock workspace"
            aria-label="Lock workspace"
            onClick={onLock}
          >
            <LockKeyhole size={19} />
            <span className="rail-label">Lock workspace</span>
          </button>
        </div>
      </aside>
      {expanded && (
        <button
          className="rail-backdrop"
          aria-label="Close sidebar"
          onClick={() => {
            toggle();
            toggleButton.current?.focus();
          }}
        />
      )}
    </>
  );
}
