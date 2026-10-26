import { isShapeKind, LIMITS } from '@archdraft/core';
import { useEffect, useRef } from 'react';
import { editorStore } from '../editor/store.ts';
import { useStrings } from '../i18n/locale.ts';

/**
 * The name of a node, edited in its own box: a text field that takes the
 * place of the label. Enter, or leaving the field, keeps the new name (an
 * empty one keeps the old, except on a shape, which may have none); Escape
 * drops it. Text that is left empty is removed, as it would show nothing. Typing here never reaches the
 * canvas, which would pan, drag or take the keys as shortcuts.
 */
export function NameEditor({
  id,
  value,
  className,
}: {
  id: string;
  value: string;
  className: string;
}) {
  const strings = useStrings();
  const field = useRef<HTMLInputElement>(null);
  const finished = useRef(false);

  useEffect(() => {
    field.current?.focus();
    field.current?.select();
  }, []);

  const finish = (keep: boolean) => {
    if (finished.current) return;
    finished.current = true;
    const name = field.current?.value.trim() ?? '';
    const editor = editorStore.getState();
    editor.stopRename();
    const kind = editor.current?.document.graph.nodes.find((node) => node.id === id)?.kind;
    const mayBeEmpty = kind !== undefined && isShapeKind(kind);
    const label = keep && name !== value && (name !== '' || mayBeEmpty) ? name : value;
    if (label !== value) editor.updateNode(id, { label });
    if (kind === 'text' && label === '') {
      editor.select({ type: 'node', id });
      editor.removeSelection();
    }
  };

  return (
    <input
      ref={field}
      defaultValue={value}
      maxLength={LIMITS.labelLength}
      aria-label={strings.canvas.rename}
      spellCheck={false}
      onBlur={() => finish(true)}
      onKeyDown={(event) => {
        event.stopPropagation();
        if (event.key === 'Enter') finish(true);
        else if (event.key === 'Escape') finish(false);
      }}
      onPointerDown={(event) => event.stopPropagation()}
      onDoubleClick={(event) => event.stopPropagation()}
      className={`nodrag nopan nowheel min-w-0 rounded-[5px] bg-surface-muted outline-2 outline-accent ${className}`}
    />
  );
}
