/**
 * Semver parser and matcher (zero dependencies)
 * Implements subset of semver spec sufficient for npm compatibility
 */

export interface SemVer {
  major: number;
  minor: number;
  patch: number;
  prerelease: (string | number)[];
  build: string[];
  raw: string;
}

const SEMVER_REGEX = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/;

/**
 * Parse a semver string
 */
export function parse(version: string): SemVer | null {
  const match = version.trim().match(SEMVER_REGEX);
  if (!match) {
    return null;
  }

  const [, major, minor, patch, prerelease, build] = match;

  return {
    major: parseInt(major, 10),
    minor: parseInt(minor, 10),
    patch: parseInt(patch, 10),
    prerelease: prerelease 
      ? prerelease.split('.').map(id => /^\d+$/.test(id) ? parseInt(id, 10) : id)
      : [],
    build: build ? build.split('.') : [],
    raw: version,
  };
}

/**
 * Check if string is a valid semver
 */
export function valid(version: string): boolean {
  return parse(version) !== null;
}

/**
 * Format semver back to string
 */
export function format(semver: SemVer): string {
  let result = `${semver.major}.${semver.minor}.${semver.patch}`;
  if (semver.prerelease.length > 0) {
    result += `-${semver.prerelease.join('.')}`;
  }
  if (semver.build.length > 0) {
    result += `+${semver.build.join('.')}`;
  }
  return result;
}

/**
 * Compare two semvers
 * Returns: -1 if a < b, 0 if a == b, 1 if a > b
 */
export function compare(a: string | SemVer, b: string | SemVer): number {
  const semverA = typeof a === 'string' ? parse(a) : a;
  const semverB = typeof b === 'string' ? parse(b) : b;

  if (!semverA || !semverB) {
    throw new Error('Invalid semver');
  }

  // Compare major.minor.patch
  if (semverA.major !== semverB.major) {
    return semverA.major > semverB.major ? 1 : -1;
  }
  if (semverA.minor !== semverB.minor) {
    return semverA.minor > semverB.minor ? 1 : -1;
  }
  if (semverA.patch !== semverB.patch) {
    return semverA.patch > semverB.patch ? 1 : -1;
  }

  // Prerelease comparison
  // Version without prerelease has higher precedence
  if (semverA.prerelease.length === 0 && semverB.prerelease.length > 0) {
    return 1;
  }
  if (semverA.prerelease.length > 0 && semverB.prerelease.length === 0) {
    return -1;
  }

  // Compare prerelease identifiers
  const maxLen = Math.max(semverA.prerelease.length, semverB.prerelease.length);
  for (let i = 0; i < maxLen; i++) {
    const idA = semverA.prerelease[i];
    const idB = semverB.prerelease[i];

    if (idA === undefined) return -1;
    if (idB === undefined) return 1;

    if (typeof idA === 'number' && typeof idB === 'number') {
      if (idA !== idB) return idA > idB ? 1 : -1;
    } else if (typeof idA === 'number') {
      return -1; // Numbers have lower precedence than strings
    } else if (typeof idB === 'number') {
      return 1;
    } else {
      const cmp = idA.localeCompare(idB);
      if (cmp !== 0) return cmp > 0 ? 1 : -1;
    }
  }

  return 0;
}

export function gt(a: string, b: string): boolean {
  return compare(a, b) > 0;
}

export function lt(a: string, b: string): boolean {
  return compare(a, b) < 0;
}

export function gte(a: string, b: string): boolean {
  return compare(a, b) >= 0;
}

export function lte(a: string, b: string): boolean {
  return compare(a, b) <= 0;
}

export function eq(a: string, b: string): boolean {
  return compare(a, b) === 0;
}

/**
 * Sort versions (ascending)
 */
export function sort(versions: string[]): string[] {
  return [...versions].sort(compare);
}

/**
 * Sort versions (descending)
 */
export function rsort(versions: string[]): string[] {
  return [...versions].sort((a, b) => compare(b, a));
}

/**
 * Get maximum version from list
 */
export function maxVersion(versions: string[]): string | null {
  const validVersions = versions.filter(valid);
  if (validVersions.length === 0) return null;
  return rsort(validVersions)[0];
}

/**
 * Get minimum version from list
 */
export function minVersion(versions: string[]): string | null {
  const validVersions = versions.filter(valid);
  if (validVersions.length === 0) return null;
  return sort(validVersions)[0];
}

// Range matching

interface Comparator {
  operator: '' | '=' | '>' | '<' | '>=' | '<=';
  semver: SemVer;
}

interface Range {
  set: Comparator[][];
}

/**
 * Parse a version range
 */
export function parseRange(range: string): Range {
  // Handle special cases
  if (range === '*' || range === '' || range === 'x' || range === 'X') {
    return { set: [[]] }; // Match everything
  }

  if (range === 'latest') {
    return { set: [[]] };
  }

  // Split by ||
  const orParts = range.split(/\s*\|\|\s*/);
  const set: Comparator[][] = [];

  for (const orPart of orParts) {
    const comparators = parseComparatorSet(orPart.trim());
    if (comparators.length > 0 || orPart.trim() === '') {
      set.push(comparators);
    }
  }

  return { set };
}

function parseComparatorSet(range: string): Comparator[] {
  const comparators: Comparator[] = [];

  // Handle hyphen ranges: 1.0.0 - 2.0.0
  const hyphenMatch = range.match(/^\s*([^\s]+)\s+-\s+([^\s]+)\s*$/);
  if (hyphenMatch) {
    const [, from, to] = hyphenMatch;
    const fromSemver = parseLoose(from);
    const toSemver = parseLoose(to);
    
    if (fromSemver) {
      comparators.push({ operator: '>=', semver: fromSemver });
    }
    if (toSemver) {
      comparators.push({ operator: '<=', semver: toSemver });
    }
    return comparators;
  }

  // Normalize: handle operators separated by space from version (>= 1.0.0 -> >=1.0.0)
  const normalized = range
    .replace(/([<>=]+)\s+/g, '$1')  // Remove space after operator
    .replace(/\s+([<>=])/g, ' $1'); // Keep space before operator

  // Split by whitespace for AND
  const parts = normalized.split(/\s+/);

  for (const part of parts) {
    if (!part) continue;

    // Handle caret (^)
    if (part.startsWith('^')) {
      const version = part.slice(1);
      const semver = parseLoose(version);
      if (semver) {
        comparators.push({ operator: '>=', semver });
        // ^1.2.3 := >=1.2.3 <2.0.0
        // ^0.2.3 := >=0.2.3 <0.3.0
        // ^0.0.3 := >=0.0.3 <0.0.4
        let upper: SemVer;
        if (semver.major !== 0) {
          upper = { ...semver, major: semver.major + 1, minor: 0, patch: 0, prerelease: [], build: [] };
        } else if (semver.minor !== 0) {
          upper = { ...semver, minor: semver.minor + 1, patch: 0, prerelease: [], build: [] };
        } else {
          upper = { ...semver, patch: semver.patch + 1, prerelease: [], build: [] };
        }
        comparators.push({ operator: '<', semver: upper });
      }
      continue;
    }

    // Handle tilde (~)
    if (part.startsWith('~')) {
      const version = part.slice(1);
      const semver = parseLoose(version);
      if (semver) {
        comparators.push({ operator: '>=', semver });
        // ~1.2.3 := >=1.2.3 <1.3.0
        const upper: SemVer = { ...semver, minor: semver.minor + 1, patch: 0, prerelease: [], build: [] };
        comparators.push({ operator: '<', semver: upper });
      }
      continue;
    }

    // Handle comparators (>=, <=, >, <, =)
    const match = part.match(/^(>=|<=|>|<|=)?(.+)$/);
    if (match) {
      const [, op, version] = match;
      const semver = parseLoose(version);
      if (semver) {
        comparators.push({
          operator: (op || '=') as Comparator['operator'],
          semver,
        });
      }
    }
  }

  return comparators;
}

/**
 * Loose parsing that handles partial versions
 */
function parseLoose(version: string): SemVer | null {
  // Try exact match first
  const exact = parse(version);
  if (exact) return exact;

  // Handle partial versions like "1" or "1.2"
  const parts = version.replace(/^v/, '').split('.');
  const major = parseInt(parts[0], 10) || 0;
  const minor = parseInt(parts[1], 10) || 0;
  const patch = parseInt(parts[2], 10) || 0;

  return {
    major,
    minor,
    patch,
    prerelease: [],
    build: [],
    raw: version,
  };
}

/**
 * Check if version satisfies range
 */
export function satisfies(version: string, range: string): boolean {
  const semver = parse(version);
  if (!semver) return false;

  const parsedRange = parseRange(range);
  
  // Any OR group must match
  for (const comparators of parsedRange.set) {
    // Empty comparator set matches everything
    if (comparators.length === 0) return true;

    // All AND comparators must match
    let allMatch = true;
    let hasMatchingPrerelease = false;
    
    for (const comp of comparators) {
      if (!testComparator(semver, comp)) {
        allMatch = false;
        break;
      }
      
      // Check if any comparator has matching major.minor.patch for prerelease
      if (semver.prerelease.length > 0 && comp.semver.prerelease.length > 0) {
        if (semver.major === comp.semver.major &&
            semver.minor === comp.semver.minor &&
            semver.patch === comp.semver.patch) {
          hasMatchingPrerelease = true;
        }
      }
    }
    
    // Prerelease versions only match if:
    // 1. The version has no prerelease, OR
    // 2. At least one comparator has a prerelease with matching major.minor.patch
    if (allMatch) {
      if (semver.prerelease.length > 0 && !hasMatchingPrerelease) {
        // Check if any comparator explicitly includes this prerelease
        const rangeHasPrerelease = comparators.some(c => c.semver.prerelease.length > 0);
        if (!rangeHasPrerelease) {
          continue; // Skip this OR group - prerelease doesn't match
        }
      }
      return true;
    }
  }

  return false;
}

function testComparator(semver: SemVer, comp: Comparator): boolean {
  const cmp = compare(semver, comp.semver);
  
  switch (comp.operator) {
    case '':
    case '=':
      return cmp === 0;
    case '>':
      return cmp > 0;
    case '<':
      return cmp < 0;
    case '>=':
      return cmp >= 0;
    case '<=':
      return cmp <= 0;
    default:
      return false;
  }
}

/**
 * Find best matching version from list
 */
export function maxSatisfying(versions: string[], range: string): string | null {
  const matching = versions.filter(v => satisfies(v, range));
  return maxVersion(matching);
}

/**
 * Find minimum matching version from list
 */
export function minSatisfying(versions: string[], range: string): string | null {
  const matching = versions.filter(v => satisfies(v, range));
  return minVersion(matching);
}

/**
 * Coerce string to valid semver
 */
export function coerce(version: string): string | null {
  const match = version.match(/(\d+)\.?(\d+)?\.?(\d+)?/);
  if (!match) return null;
  
  const [, major, minor = '0', patch = '0'] = match;
  return `${major}.${minor}.${patch}`;
}

