/**
 * Shared .env file utilities — used by provision, switch, and status commands.
 *
 * The .env is structured as:
 *   • A header block  — shared active settings (GLOSSO_MODE, GLOSSO_NETWORK, …)
 *   • One section per mode — labelled `# ── Sovereign`, `# ── Turnkey`, etc.
 *
 * Each provisioning run upserts the header keys and replaces only its own
 * section, leaving all other sections untouched.
 */

import fs from 'fs';

// ── Types ───────────────────────────────────────────────────────────────────

export interface EnvFile {
  /** Lines before the first section marker */
  header: string[];
  /** Ordered map: section label → body lines (excluding the `# ── Label` line) */
  sections: Map<string, string[]>;
}

// ── Constants ───────────────────────────────────────────────────────────────

export const SECTION_PREFIX = '# ── ';

/** Mode label → the key that stores the wallet address inside that section */
export const WALLET_ADDRESS_KEY: Record<string, string> = {
  Sovereign: 'SOVEREIGN_WALLET_ADDRESS',
  Turnkey: 'TURNKEY_WALLET_ADDRESS',
  Privy: 'PRIVY_WALLET_ADDRESS',
};

/** Section label → mode string used in GLOSSO_MODE */
export const LABEL_TO_MODE: Record<string, string> = {
  Sovereign: 'sovereign',
  Turnkey: 'turnkey',
  Privy: 'privy',
};

/** Mode string → section label */
export const MODE_TO_LABEL: Record<string, string> = {
  sovereign: 'Sovereign',
  turnkey: 'Turnkey',
  privy: 'Privy',
};

export const ENV_FILE_HEADER_COMMENT = [
  '# Glosso Wallet — Multi-Mode Configuration',
  '# ⚠️  NEVER commit this file to version control',
  '#',
  '# GLOSSO_MODE controls which wallet backend the agent uses.',
  '# Each provisioning run adds or updates its own labelled section below.',
  '# Previous wallet sections are preserved — switch modes with `npx glosso switch`.',
  '',
];

// ── Parsing / Serialisation ─────────────────────────────────────────────────

export function parseEnvFile(envPath: string): EnvFile {
  if (!fs.existsSync(envPath)) return { header: [], sections: new Map() };

  const lines = fs.readFileSync(envPath, 'utf-8').split('\n');
  const sections = new Map<string, string[]>();
  const header: string[] = [];
  let currentLabel: string | null = null;
  let currentLines: string[] = [];

  for (const line of lines) {
    if (line.startsWith(SECTION_PREFIX)) {
      if (currentLabel !== null) sections.set(currentLabel, currentLines);
      currentLabel = line.slice(SECTION_PREFIX.length);
      currentLines = [];
    } else if (currentLabel !== null) {
      currentLines.push(line);
    } else {
      header.push(line);
    }
  }
  if (currentLabel !== null) sections.set(currentLabel, currentLines);

  return { header, sections };
}

export function serializeEnvFile(envFile: EnvFile): string {
  const parts: string[] = [];

  const headerText = envFile.header.join('\n').trimEnd();
  if (headerText) parts.push(headerText);

  for (const [label, lines] of envFile.sections) {
    const body = lines.join('\n').trimEnd();
    parts.push(`${SECTION_PREFIX}${label}\n${body}`);
  }

  return parts.join('\n\n') + '\n';
}

// ── Header helpers ──────────────────────────────────────────────────────────

/** Update an existing KEY=value line in the header, or append it. */
export function upsertHeaderKey(header: string[], key: string, value: string): void {
  const idx = header.findIndex((l) => l.match(new RegExp(`^${key}\\s*=`)));
  if (idx >= 0) {
    header[idx] = `${key}=${value}`;
  } else {
    header.push(`${key}=${value}`);
  }
}

/** Read a KEY=value from the header. Returns undefined if not found. */
export function readHeaderKey(header: string[], key: string): string | undefined {
  for (const line of header) {
    const match = line.match(new RegExp(`^${key}\\s*=(.*)$`));
    if (match) return match[1].trim();
  }
  return undefined;
}

// ── Key reconciliation ──────────────────────────────────────────────────────

/**
 * Before replacing a section, handle key ownership correctly:
 *
 * 1. Rescue: any KEY=value lines currently in the OLD section body whose keys
 *    are NOT in `ownedKeys` get moved up to the header (e.g. XAI_API_KEY that
 *    was accidentally left inside a Turnkey section block).
 *
 * 2. Evict: any `ownedKeys` that are currently sitting in the header (e.g.
 *    user pre-set TURNKEY_API_PUBLIC_KEY before running provisioning) get
 *    removed from the header so they only live in their section — no duplicates.
 */
export function reconcileKeys(
  envFile: EnvFile,
  sectionLabel: string,
  ownedKeys: string[]
): void {
  const ownedSet = new Set(ownedKeys);

  // 1. Rescue foreign keys from the existing section body → header.
  const existing = envFile.sections.get(sectionLabel);
  if (existing) {
    for (const line of existing) {
      const match = line.match(/^\s*([A-Z0-9_]+)\s*=(.*)$/);
      if (match && !ownedSet.has(match[1])) {
        upsertHeaderKey(envFile.header, match[1], match[2].trim());
      }
    }
  }

  // 2. Evict owned keys from everywhere they don't belong:
  //    the header AND every other section.
  envFile.header = envFile.header.filter((line) => {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=/);
    return !match || !ownedSet.has(match[1]);
  });

  for (const [label, lines] of envFile.sections) {
    if (label === sectionLabel) continue;
    envFile.sections.set(
      label,
      lines.filter((line) => {
        const match = line.match(/^\s*([A-Z0-9_]+)\s*=/);
        return !match || !ownedSet.has(match[1]);
      })
    );
  }
}

// ── .env loading ────────────────────────────────────────────────────────────

/**
 * Load a .env file into process.env (non-overwriting).
 * Mirrors the same logic used in demo/src/agent.ts.
 */
export function loadEnvFile(filePath: string): void {
  if (!fs.existsSync(filePath)) return;
  fs.readFileSync(filePath, 'utf-8')
    .split('\n')
    .forEach((line) => {
      const l = line.replace(/^export\s+/, '').trim();
      const i = l.indexOf('=');
      if (i > 0 && !l.startsWith('#')) {
        const k = l.slice(0, i).trim();
        const v = l.slice(i + 1).trim().replace(/^"|"$|^'|'$/g, '');
        if (k && !process.env[k]) process.env[k] = v;
      }
    });
}

// ── Section inspection ──────────────────────────────────────────────────────

/**
 * Read a key's value from inside a section body.
 * Returns undefined if the section doesn't exist or the key isn't present.
 */
export function readSectionKey(
  envFile: EnvFile,
  sectionLabel: string,
  key: string
): string | undefined {
  const lines = envFile.sections.get(sectionLabel);
  if (!lines) return undefined;
  for (const line of lines) {
    const match = line.match(new RegExp(`^\\s*${key}\\s*=(.*)$`));
    if (match) return match[1].trim();
  }
  return undefined;
}

/**
 * Insert or update a KEY=value inside a section body.
 * If the section doesn't exist, this is a no-op.
 * If the key already exists, it is updated in-place.
 * If the key doesn't exist, it is inserted after the first comment block.
 */
export function upsertSectionKey(
  envFile: EnvFile,
  sectionLabel: string,
  key: string,
  value: string
): void {
  const lines = envFile.sections.get(sectionLabel);
  if (!lines) return;

  const idx = lines.findIndex((l) => l.match(new RegExp(`^\\s*${key}\\s*=`)));
  if (idx >= 0) {
    lines[idx] = `${key}=${value}`;
  } else {
    // Insert after the last comment/blank line at the top of the section
    let insertAt = 0;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].startsWith('#') || lines[i].trim() === '') {
        insertAt = i + 1;
      } else {
        break;
      }
    }
    lines.splice(insertAt, 0, `${key}=${value}`);
  }
}

/**
 * List all provisioned modes that have credentials in their section.
 * Checks for the per-mode wallet address key first, then falls back to
 * detecting whether the section has any KEY=value lines (for .env files
 * provisioned before the per-mode address key was introduced).
 */
export function listProvisionedModes(envFile: EnvFile): Array<{
  mode: string;
  label: string;
  address: string;
}> {
  const result: Array<{ mode: string; label: string; address: string }> = [];
  for (const [label, addrKey] of Object.entries(WALLET_ADDRESS_KEY)) {
    const mode = LABEL_TO_MODE[label];
    if (!mode) continue;

    // Preferred: explicit per-mode address key
    let address = readSectionKey(envFile, label, addrKey);

    // Fallback: section exists and has at least one KEY=value → use
    // GLOSSO_PRIMARY_ADDRESS from header if the current mode matches,
    // or try reading an address from a comment (sovereign sub-wallet list)
    if (!address) {
      const lines = envFile.sections.get(label);
      if (!lines) continue;
      const hasKeys = lines.some((l) => /^\s*[A-Z0-9_]+=/.test(l));
      if (!hasKeys) continue;

      // For legacy sovereign sections, the primary address is in a comment
      // like: `#   Index 0 (primary): 9w56ob...`
      for (const line of lines) {
        const m = line.match(/^#\s+Index\s+0\s+\(primary\):\s+(\S+)/);
        if (m) { address = m[1]; break; }
      }

      // Last resort: if GLOSSO_MODE in header matches this label, use
      // GLOSSO_PRIMARY_ADDRESS from header
      if (!address) {
        const headerMode = readHeaderKey(envFile.header, 'GLOSSO_MODE');
        if (headerMode === mode) {
          address = readHeaderKey(envFile.header, 'GLOSSO_PRIMARY_ADDRESS') || 'unknown';
        } else {
          address = 'unknown (re-provision to store address)';
        }
      }
    }

    result.push({ mode, label, address });
  }
  return result;
}
