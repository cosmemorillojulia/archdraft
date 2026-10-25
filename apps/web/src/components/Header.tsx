import { CodeXml, Moon, Sun } from 'lucide-react';
import { AnimatePresence, m } from 'motion/react';
import { strings } from '../strings.ts';
import { useTheme } from '../theme.ts';
import { Button } from './Button.tsx';
import { HistoryControls } from './HistoryControls.tsx';
import { ShareMenu } from './ShareMenu.tsx';

const REPOSITORY_URL = 'https://github.com/cosmemorillojulia/archdraft';

/**
 * Fixed application bar: the product name, what it does, undo and redo,
 * sharing and files, the code and the theme. The theme state lives here, so a theme change re-renders only the
 * header while the page blends into the new colours.
 */
export function Header() {
  const [theme, toggleTheme] = useTheme();
  const themeLabel = theme === 'dark' ? strings.header.themeToLight : strings.header.themeToDark;
  return (
    <header className="relative z-30 flex h-13 shrink-0 items-center justify-between gap-4 border-b border-line bg-surface px-4">
      <div className="flex min-w-0 items-baseline gap-4">
        {/* Wordmark: capitals by CSS, so assistive technology still reads the word. */}
        <h1 className="inline-block -skew-x-[8deg] text-lg font-bold tracking-[0.06em] uppercase">
          {strings.appName}
        </h1>
        <p className="hidden truncate text-sm text-muted md:block">{strings.tagline}</p>
      </div>
      <div className="flex items-center gap-1">
        <HistoryControls />
        <span aria-hidden="true" className="mx-1 h-5 w-px bg-line" />
        <ShareMenu />
        <a
          href={REPOSITORY_URL}
          title={strings.header.sourceCode}
          className="inline-flex items-center gap-1.5 rounded-control px-2.5 py-1.5 text-sm text-muted transition-colors hover:text-ink max-md:px-2"
        >
          <CodeXml size={16} aria-hidden="true" className="md:hidden" />
          <span className="max-md:sr-only">{strings.header.sourceCode}</span>
        </a>
        <Button
          variant="ghost"
          size="icon"
          aria-label={themeLabel}
          title={themeLabel}
          onClick={toggleTheme}
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
