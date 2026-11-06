import { useStrings } from '../i18n/locale.ts';
import { Modal } from './Modal.tsx';

/** Address of the code of the project, which the about dialog links to. */
export const SOURCE_URL = 'https://github.com/cosmemorillojulia/archdraft';

/** What Archdraft is and what happens to the diagrams: the privacy policy. */
export function AboutDialog({ onClose }: { onClose: () => void }) {
  const strings = useStrings();
  const { about } = strings;
  return (
    <Modal title={about.title} subtitle={about.subtitle} onClose={onClose}>
      <div className="flex flex-col gap-5 text-sm leading-relaxed">
        <p>{about.intro}</p>
        <section>
          <h3 className="mb-2 font-semibold">{about.privacyTitle}</h3>
          <ul className="flex list-disc flex-col gap-2 pl-5">
            {about.privacy.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>
        <p className="text-muted">
          {about.source}{' '}
          <a
            href={SOURCE_URL}
            target="_blank"
            rel="noreferrer"
            className="font-medium text-accent underline-offset-2 hover:underline"
          >
            {about.sourceLink}
          </a>
        </p>
      </div>
    </Modal>
  );
}
