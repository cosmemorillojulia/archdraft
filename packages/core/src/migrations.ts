import { SCHEMA_VERSION } from './schema.ts';
import type { ValidationIssue } from './validate.ts';

/**
 * Upgrades stored documents to the current `schemaVersion` before they are
 * validated. Each migration takes a document of version `n` and returns the
 * same document in version `n + 1`; the chain stamps the new version itself so
 * a migration cannot forget it.
 *
 * Migrations receive untrusted data that has not been validated yet: they
 * must cope with missing or malformed fields and leave reporting them to the
 * schema. A migration that throws is reported as `MIGRATION_FAILED`.
 */

export type JsonObject = Readonly<Record<string, unknown>>;
export type Migration = (document: JsonObject) => JsonObject;

/** Migrations keyed by the version they upgrade from. Empty while the format is at version 1. */
export const MIGRATIONS: ReadonlyMap<number, Migration> = new Map();

export interface MigrateOptions {
  readonly migrations?: ReadonlyMap<number, Migration>;
  readonly targetVersion?: number;
}

export type MigrateResult =
  | { readonly success: true; readonly document: unknown }
  | { readonly success: false; readonly issue: ValidationIssue };

/**
 * Applies the migrations needed to bring `document` to `targetVersion`.
 * Input without an integer `schemaVersion` is returned unchanged so that the
 * schema reports the problem with its usual message. Never throws.
 */
export function migrateDocument(document: unknown, options: MigrateOptions = {}): MigrateResult {
  const { migrations = MIGRATIONS, targetVersion = SCHEMA_VERSION } = options;
  if (!isJsonObject(document)) return { success: true, document };
  const fromVersion = document.schemaVersion;
  if (typeof fromVersion !== 'number' || !Number.isInteger(fromVersion)) {
    return { success: true, document };
  }

  if (fromVersion > targetVersion) {
    return failure(
      'UNSUPPORTED_SCHEMA_VERSION',
      `The diagram uses format version ${fromVersion}, newer than the supported version ${targetVersion}; update Archdraft to open it`,
    );
  }

  let current = document;
  for (let version = fromVersion; version < targetVersion; version++) {
    const migrate = migrations.get(version);
    if (!migrate) {
      return failure(
        'UNSUPPORTED_SCHEMA_VERSION',
        `Format version ${fromVersion} is not supported and cannot be upgraded to version ${targetVersion}`,
      );
    }
    try {
      current = { ...migrate(current), schemaVersion: version + 1 };
    } catch (cause) {
      const reason = cause instanceof Error ? cause.message : String(cause);
      return failure(
        'MIGRATION_FAILED',
        `Could not upgrade the diagram from format version ${version} to ${version + 1}: ${reason}`,
      );
    }
  }
  return { success: true, document: current };
}

function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function failure(code: ValidationIssue['code'], message: string): MigrateResult {
  return { success: false, issue: { code, severity: 'error', message } };
}
