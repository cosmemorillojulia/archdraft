import { type KeyboardEvent, type ReactNode, useId, useRef, useState } from 'react';
import { useStrings } from '../i18n/locale.ts';

/**
 * Form fields of the inspector. Text fields keep a draft while typing and
 * commit it when they lose focus or on Enter, so that each change is one
 * step of the history; choices commit at once.
 */

const INPUT =
  'w-full rounded-control border border-transparent bg-surface-muted px-3 text-sm text-ink outline-none transition-[border-color,box-shadow] placeholder:text-muted focus:border-line focus:ring-2 focus:ring-focus aria-invalid:ring-2 aria-invalid:ring-danger';

function useDraft(value: string) {
  const [draft, setDraft] = useState(value);
  const [shown, setShown] = useState(value);
  // The value can change underneath, after an undo: the draft follows it.
  if (value !== shown) {
    setShown(value);
    setDraft(value);
  }
  // Escape restores the value and leaves the field; the blur that follows must not commit.
  const cancelled = useRef(false);
  const cancel = (field: HTMLElement) => {
    cancelled.current = true;
    setDraft(value);
    field.blur();
  };
  const takeCancelled = () => {
    const was = cancelled.current;
    cancelled.current = false;
    return was;
  };
  return { draft, setDraft, cancel, takeCancelled };
}

function Field({
  id,
  label,
  error,
  errorId,
  children,
}: {
  id: string;
  label: string;
  error: string | null;
  errorId: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-xs font-medium text-muted">
        {label}
      </label>
      {children}
      {error !== null && (
        <p id={errorId} className="text-xs text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

interface TextFieldProps {
  label: string;
  value: string;
  maxLength: number;
  /** Required fields cannot be left empty; an empty draft goes back to the value. */
  required?: boolean;
  placeholder?: string | undefined;
  multiline?: boolean;
  /** Receives the trimmed text, only when it differs from the value. */
  onCommit: (value: string) => void;
}

export function TextField({
  label,
  value,
  maxLength,
  required = false,
  placeholder,
  multiline = false,
  onCommit,
}: TextFieldProps) {
  const strings = useStrings();
  const id = useId();
  const errorId = `${id}-error`;
  const { draft, setDraft, cancel, takeCancelled } = useDraft(value);
  const empty = draft.trim() === '';
  const error = required && empty ? strings.inspector.errors.required : null;

  const commit = () => {
    if (takeCancelled()) return;
    if (error !== null) {
      setDraft(value);
      return;
    }
    const next = draft.trim();
    if (next !== value) onCommit(next);
    setDraft(next);
  };
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    if (event.key === 'Escape') {
      cancel(event.currentTarget);
    } else if (event.key === 'Enter' && !multiline) {
      commit();
    }
  };
  const shared = {
    id,
    value: draft,
    maxLength,
    placeholder,
    'aria-invalid': error !== null || undefined,
    'aria-describedby': error === null ? undefined : errorId,
    onChange: (event: { target: { value: string } }) => setDraft(event.target.value),
    onBlur: commit,
    onKeyDown,
  };

  return (
    <Field id={id} label={label} error={error} errorId={errorId}>
      {multiline ? (
        <textarea {...shared} rows={3} className={`${INPUT} resize-none py-2`} />
      ) : (
        <input {...shared} type="text" className={`${INPUT} h-9`} />
      )}
    </Field>
  );
}

interface NumberFieldProps {
  label: string;
  value: number | undefined;
  min: number;
  max: number;
  placeholder: string;
  error: string;
  /** Receives a whole number in range, or undefined when the field is emptied. */
  onCommit: (value: number | undefined) => void;
}

export function NumberField({
  label,
  value,
  min,
  max,
  placeholder,
  error: message,
  onCommit,
}: NumberFieldProps) {
  const id = useId();
  const errorId = `${id}-error`;
  const text = value === undefined ? '' : String(value);
  const { draft, setDraft, cancel, takeCancelled } = useDraft(text);
  const trimmed = draft.trim();
  const parsed = Number(trimmed);
  const valid = trimmed === '' || (Number.isInteger(parsed) && parsed >= min && parsed <= max);
  const error = valid ? null : message;

  const commit = () => {
    if (takeCancelled()) return;
    if (!valid) {
      setDraft(text);
      return;
    }
    const next = trimmed === '' ? undefined : parsed;
    if (next !== value) onCommit(next);
  };

  return (
    <Field id={id} label={label} error={error} errorId={errorId}>
      <input
        id={id}
        type="text"
        inputMode="numeric"
        value={draft}
        placeholder={placeholder}
        aria-invalid={error !== null || undefined}
        aria-describedby={error === null ? undefined : errorId}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === 'Enter') commit();
          if (event.key === 'Escape') cancel(event.currentTarget);
        }}
        className={`${INPUT} h-9 tabular-nums`}
      />
    </Field>
  );
}

interface SelectFieldProps<T extends string> {
  label: string;
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (value: T) => void;
}

export function SelectField<T extends string>({
  label,
  value,
  options,
  onChange,
}: SelectFieldProps<T>) {
  const id = useId();
  return (
    <Field id={id} label={label} error={null} errorId="">
      <select
        id={id}
        value={value}
        onChange={(event) => {
          const option = options.find((candidate) => candidate.value === event.target.value);
          if (option) onChange(option.value);
        }}
        className={`${INPUT} h-9 appearance-none bg-[length:16px] bg-[right_10px_center] bg-no-repeat pr-8`}
        style={{ backgroundImage: CHEVRON }}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </Field>
  );
}

const CHEVRON = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%239aa3b2' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E")`;

interface ChoiceFieldProps<T extends string> {
  label: string;
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (value: T) => void;
}

/** A small segmented control, built on radio buttons so arrow keys move between options. */
export function ChoiceField<T extends string>({
  label,
  value,
  options,
  onChange,
}: ChoiceFieldProps<T>) {
  const name = useId();
  const labelId = `${name}-label`;
  return (
    <div
      role="radiogroup"
      aria-labelledby={labelId}
      className="flex items-center justify-between gap-3"
    >
      <span id={labelId} className="text-xs font-medium text-muted">
        {label}
      </span>
      <div className="flex shrink-0 rounded-control bg-surface-muted p-0.5">
        {options.map((option) => (
          <label
            key={option.value}
            className="relative cursor-pointer rounded-[8px] px-2.5 py-1 text-xs font-medium text-muted transition-colors has-checked:bg-surface has-checked:text-ink has-checked:shadow-sm has-focus-visible:ring-2 has-focus-visible:ring-focus"
          >
            <input
              type="radio"
              name={name}
              value={option.value}
              checked={option.value === value}
              onChange={() => onChange(option.value)}
              className="sr-only"
            />
            {option.label}
          </label>
        ))}
      </div>
    </div>
  );
}
