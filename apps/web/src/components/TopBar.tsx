import { type ArchitectureGraph, lintGraph } from '@archdraft/core';
import { CircleCheck, CodeXml, Moon, Sun, TriangleAlert } from 'lucide-react';
import { useMemo } from 'react';
import { strings } from '../strings.ts';
import type { Theme } from '../theme.ts';
import { Button } from './Button.tsx';

const REPOSITORY_URL = 'https://github.com/cosmemorillojulia/archdraft';

interface TopBarProps {
  graph: ArchitectureGraph;
  theme: Theme;
  onToggleTheme: () => void;
}

/** Floating bar: product and document on the left, status and settings on the right. */
export function TopBar({ graph, theme, onToggleTheme }: TopBarProps) {
  const themeLabel = theme === 'dark' ? strings.header.themeToLight : strings.header.themeToDark;
  return (
    <header className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-start justify-between gap-3 p-3">
      <div className="floating pointer-events-auto flex h-11 min-w-0 items-center gap-3 rounded-panel pr-4 pl-2">
        <Logo />
        <h1 className="text-[0.9375rem] font-semibold tracking-[-0.01em]">{strings.appName}</h1>
        <span aria-hidden="true" className="h-5 w-px bg-line" />
        <p className="min-w-0 truncate text-muted" title={graph.title}>
          <span className="text-ink">{graph.title}</span>
          <span className="ml-2 hidden rounded-full bg-surface-muted px-2 py-0.5 text-xs sm:inline">
            {strings.providers[graph.provider]}
          </span>
        </p>
      </div>
      <div className="floating pointer-events-auto flex h-11 shrink-0 items-center gap-1 rounded-panel px-1.5">
        <ReviewStatus graph={graph} />
        <Button
          variant="ghost"
          size="icon"
          aria-label={themeLabel}
          title={themeLabel}
          onClick={onToggleTheme}
        >
          {theme === 'dark' ? (
            <Sun size={17} aria-hidden="true" />
          ) : (
            <Moon size={17} aria-hidden="true" />
          )}
        </Button>
        <a
          href={REPOSITORY_URL}
          aria-label={strings.header.sourceCode}
          title={strings.header.sourceCode}
          className="inline-flex size-8 items-center justify-center rounded-control text-muted transition-colors hover:bg-surface-muted hover:text-ink"
        >
          <CodeXml size={17} aria-hidden="true" />
        </a>
      </div>
    </header>
  );
}

function ReviewStatus({ graph }: { graph: ArchitectureGraph }) {
  const count = useMemo(() => lintGraph(graph).length, [graph]);
  const clean = count === 0;
  return (
    <p
      role="status"
      className="mr-1 hidden items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium sm:flex"
      style={{
        color: clean ? 'var(--success)' : 'var(--warning)',
        backgroundColor: `color-mix(in srgb, ${clean ? 'var(--success)' : 'var(--warning)'} 12%, transparent)`,
      }}
    >
      {clean ? (
        <CircleCheck size={14} aria-hidden="true" />
      ) : (
        <TriangleAlert size={14} aria-hidden="true" />
      )}
      {clean ? strings.review.clean : strings.review.issues(count)}
    </p>
  );
}

function Logo() {
  return (
    <svg viewBox="0 0 28 28" className="size-7" aria-hidden="true">
      <rect width="28" height="28" rx="8" style={{ fill: 'var(--accent)' }} />
      <circle cx="8.5" cy="19" r="2.6" style={{ fill: 'var(--on-accent)' }} />
      <circle cx="19.5" cy="9" r="2.6" style={{ fill: 'var(--on-accent)' }} />
      <path
        d="M10.5 17.5 C 14 17.5 14 10.5 17.5 10.5"
        fill="none"
        strokeWidth="1.8"
        strokeLinecap="round"
        style={{ stroke: 'var(--on-accent)' }}
      />
    </svg>
  );
}
