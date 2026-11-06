import { Fragment } from 'react';
import { useStrings } from '../i18n/locale.ts';
import { Modal } from './Modal.tsx';

/**
 * The keys and gestures of the editor, by what they act on. The list is text of each language
 * (`shortcuts` in the dictionaries), since the names of keys differ: Delete is Supr in Spanish.
 */
export function ShortcutsDialog({ onClose }: { onClose: () => void }) {
  const strings = useStrings();
  return (
    <Modal title={strings.shortcuts.title} subtitle={strings.shortcuts.subtitle} onClose={onClose}>
      <div className="flex flex-col gap-5">
        {strings.shortcuts.groups.map((group) => (
          <section key={group.title}>
            <h3 className="mb-2 text-xs font-semibold tracking-wide text-muted uppercase">
              {group.title}
            </h3>
            <dl className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-2 text-sm">
              {group.items.map(({ keys, action }) => (
                <Fragment key={action}>
                  <dt>{action}</dt>
                  <dd className="flex flex-wrap justify-end gap-1">
                    {keys.map((key, index) => (
                      <kbd
                        key={index}
                        className="rounded-md border border-line bg-canvas px-1.5 py-0.5 font-sans text-xs whitespace-nowrap"
                      >
                        {key}
                      </kbd>
                    ))}
                  </dd>
                </Fragment>
              ))}
            </dl>
          </section>
        ))}
      </div>
    </Modal>
  );
}
