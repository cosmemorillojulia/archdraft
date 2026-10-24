import { type ComponentProps, useId } from 'react';

interface TextAreaFieldProps extends Omit<ComponentProps<'textarea'>, 'id'> {
  label: string;
  hint?: string;
}

/** Multi-line text input with a visible label and an optional hint linked for screen readers. */
export function TextAreaField({ label, hint, className = '', ...props }: TextAreaFieldProps) {
  const id = useId();
  const hintId = `${id}-hint`;
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      <textarea
        id={id}
        aria-describedby={hint === undefined ? undefined : hintId}
        className={`min-h-32 resize-y rounded-control border border-rule bg-sheet px-3 py-2 text-sm leading-relaxed text-graphite placeholder:text-lead focus-visible:border-diazo ${className}`}
        {...props}
      />
      {hint !== undefined && (
        <p id={hintId} className="text-xs text-lead">
          {hint}
        </p>
      )}
    </div>
  );
}
