import { Moon, Sun } from 'lucide-react';
import { AnimatePresence, m } from 'motion/react';
import { strings } from '../strings.ts';
import type { RevealOrigin, Theme } from '../theme.ts';
import { Button } from './Button.tsx';

const REPOSITORY_URL = 'https://github.com/cosmemorillojulia/archdraft';

interface HeaderProps {
  theme: Theme;
  onToggleTheme: (origin: RevealOrigin) => void;
}

/** Fixed application bar: the product name, what it does, the code and the theme. */
export function Header({ theme, onToggleTheme }: HeaderProps) {
  const themeLabel = theme === 'dark' ? strings.header.themeToLight : strings.header.themeToDark;
  return (
    <header className="relative z-30 flex h-13 shrink-0 items-center justify-between gap-4 border-b border-line bg-surface px-4">
      <div className="flex min-w-0 items-baseline gap-4">
        <h1 className="text-lg font-bold tracking-[-0.02em]">{strings.appName}</h1>
        <p className="hidden truncate text-sm text-muted md:block">{strings.tagline}</p>
      </div>
      <div className="flex items-center gap-1">
        <a
          href={REPOSITORY_URL}
          className="rounded-control px-2.5 py-1.5 text-sm text-muted transition-colors hover:text-ink"
        >
          {strings.header.sourceCode}
        </a>
        <Button
          variant="ghost"
          size="icon"
          aria-label={themeLabel}
          title={themeLabel}
          onClick={(event) => {
            const rect = event.currentTarget.getBoundingClientRect();
            onToggleTheme({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 });
          }}
          className="overflow-hidden"
        >
          <AnimatePresence mode="popLayout" initial={false}>
            <m.span
              key={theme}
              initial={{ opacity: 0, rotate: -90, scale: 0.6 }}
              animate={{ opacity: 1, rotate: 0, scale: 1 }}
              exit={{ opacity: 0, rotate: 90, scale: 0.6 }}
              transition={{ duration: 0.3 }}
              className="flex"
            >
              {theme === 'dark' ? (
                <Sun size={17} aria-hidden="true" />
              ) : (
                <Moon size={17} aria-hidden="true" />
              )}
            </m.span>
          </AnimatePresence>
        </Button>
      </div>
    </header>
  );
}
