import { describe, expect, it } from 'vitest';
import { type Migration, MIGRATIONS, migrateDocument, SCHEMA_VERSION } from '../src/index.ts';

/** A fictitious upgrade used to exercise the chain while the format is at version 1. */
const renameName: Migration = ({ name, ...rest }) => ({ ...rest, title: name });

describe('migrateDocument', () => {
  it('has no real migrations while the format is at version 1', () => {
    expect(SCHEMA_VERSION).toBe(1);
    expect(MIGRATIONS.size).toBe(0);
  });

  it('returns a current document unchanged', () => {
    const document = { schemaVersion: SCHEMA_VERSION, title: 'x' };
    expect(migrateDocument(document)).toEqual({ success: true, document });
  });

  it('leaves input without an integer schemaVersion for the schema to report', () => {
    for (const document of [
      null,
      'text',
      42,
      [],
      {},
      { schemaVersion: '1' },
      { schemaVersion: 0.5 },
    ]) {
      expect(migrateDocument(document)).toEqual({ success: true, document });
    }
  });

  it('applies a fictitious migration and stamps the new version', () => {
    const result = migrateDocument(
      { schemaVersion: 1, name: 'Shop' },
      { migrations: new Map([[1, renameName]]), targetVersion: 2 },
    );
    expect(result).toEqual({ success: true, document: { schemaVersion: 2, title: 'Shop' } });
  });

  it('chains migrations in order across several versions', () => {
    const calls: number[] = [];
    const step =
      (version: number): Migration =>
      (document) => {
        calls.push(version);
        return { ...document, [`v${version}`]: true };
      };
    const result = migrateDocument(
      { schemaVersion: 1 },
      {
        migrations: new Map([
          [3, step(3)],
          [1, step(1)],
          [2, step(2)],
        ]),
        targetVersion: 4,
      },
    );
    expect(calls).toEqual([1, 2, 3]);
    expect(result).toEqual({
      success: true,
      document: { schemaVersion: 4, v1: true, v2: true, v3: true },
    });
  });

  it('does not modify its input', () => {
    const document = Object.freeze({ schemaVersion: 1, name: 'Shop' });
    migrateDocument(document, { migrations: new Map([[1, renameName]]), targetVersion: 2 });
    expect(document).toEqual({ schemaVersion: 1, name: 'Shop' });
  });

  it('rejects documents from a newer version', () => {
    expect(migrateDocument({ schemaVersion: SCHEMA_VERSION + 1 })).toEqual({
      success: false,
      issue: {
        code: 'UNSUPPORTED_SCHEMA_VERSION',
        severity: 'error',
        message: `The diagram uses format version 2, newer than the supported version 1; update Archdraft to open it`,
      },
    });
  });

  it('rejects older versions with a gap in the chain', () => {
    const result = migrateDocument(
      { schemaVersion: 1 },
      { migrations: new Map([[2, renameName]]), targetVersion: 3 },
    );
    expect(result).toMatchObject({
      success: false,
      issue: {
        code: 'UNSUPPORTED_SCHEMA_VERSION',
        message: 'Format version 1 is not supported and cannot be upgraded to version 3',
      },
    });
  });

  it('rejects versions below the first one', () => {
    expect(migrateDocument({ schemaVersion: 0 })).toMatchObject({
      success: false,
      issue: { code: 'UNSUPPORTED_SCHEMA_VERSION' },
    });
  });

  it('reports a migration that throws instead of throwing', () => {
    const broken = (): never => {
      throw new Error('nodes is not an array');
    };
    const result = migrateDocument(
      { schemaVersion: 1 },
      { migrations: new Map([[1, broken]]), targetVersion: 2 },
    );
    expect(result).toEqual({
      success: false,
      issue: {
        code: 'MIGRATION_FAILED',
        severity: 'error',
        message: 'Could not upgrade the diagram from format version 1 to 2: nodes is not an array',
      },
    });
  });

  it('reports non-Error values thrown by a migration', () => {
    const broken = (): never => {
      // eslint-disable-next-line @typescript-eslint/only-throw-error -- the chain must cope with it
      throw 'boom';
    };
    expect(
      migrateDocument(
        { schemaVersion: 1 },
        { migrations: new Map([[1, broken]]), targetVersion: 2 },
      ),
    ).toMatchObject({ success: false, issue: { message: expect.stringContaining(': boom') } });
  });
});
