import { Moon, Sun } from 'lucide-react';
import { Button } from '../components/Button.tsx';
import { strings } from '../strings.ts';
import type { Theme } from '../theme.ts';

const REPOSITORY_URL = 'https://github.com/cosmemorillojulia/archdraft';

interface HeaderProps {
  theme: Theme;
  onToggleTheme: () => void;
}

export function Header({ theme, onToggleTheme }: HeaderProps) {
  const themeLabel = theme === 'dark' ? strings.header.themeToLight : strings.header.themeToDark;
  return (
    <header className="flex h-13 shrink-0 items-center justify-between gap-4 border-b border-rule px-4">
      <div className="flex min-w-0 items-baseline gap-4">
        <h1 className="font-wide text-lg font-bold tracking-tight">{strings.appName}</h1>
        <p className="hidden truncate text-sm text-lead md:block">{strings.tagline}</p>
      </div>
      <div className="flex items-center gap-1">
        <a
          href={REPOSITORY_URL}
          className="rounded-control px-2.5 py-1.5 text-sm text-lead transition-colors hover:text-graphite"
        >
          {strings.header.sourceCode}
        </a>
        <Button
          variant="ghost"
          size="icon"
          aria-label={themeLabel}
          title={themeLabel}
          onClick={onToggleTheme}
        >
          {theme === 'dark' ? (
            <Sun size={18} aria-hidden="true" />
          ) : (
            <Moon size={18} aria-hidden="true" />
          )}
        </Button>
      </div>
    </header>
  );
}
