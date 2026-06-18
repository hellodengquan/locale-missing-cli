const DEFAULT_PLACEHOLDERS = [
  'TODO',
  'TBD',
  'TBC',
  'N/A',
  'NA',
  /^\[en\]/i,
  /^\[zh\]/i,
  /^\[ja\]/i,
  /^\[ko\]/i,
  /^\[fr\]/i,
  /^\[de\]/i,
  /^\[es\]/i,
  /^\[it\]/i,
  /^\[pt\]/i,
  /^\[ru\]/i,
  /^TODO:/i,
  /^FIXME/i,
  /^UNTRANSLATED/i
];

const CLDR_PLURAL_RULES = {
  'af': ['one', 'other'],
  'am': ['one', 'other'],
  'ar': ['zero', 'one', 'two', 'few', 'many', 'other'],
  'be': ['one', 'few', 'many', 'other'],
  'bg': ['one', 'other'],
  'cs': ['one', 'few', 'many', 'other'],
  'da': ['one', 'other'],
  'de': ['one', 'other'],
  'el': ['one', 'other'],
  'en': ['one', 'other'],
  'es': ['one', 'other'],
  'et': ['one', 'other'],
  'fi': ['one', 'other'],
  'fr': ['one', 'other'],
  'he': ['one', 'two', 'other'],
  'hi': ['one', 'other'],
  'hr': ['one', 'few', 'many', 'other'],
  'hu': ['one', 'other'],
  'id': ['other'],
  'is': ['one', 'other'],
  'it': ['one', 'other'],
  'ja': ['other'],
  'ko': ['other'],
  'lt': ['one', 'few', 'many', 'other'],
  'lv': ['zero', 'one', 'other'],
  'mk': ['one', 'other'],
  'ms': ['other'],
  'nl': ['one', 'other'],
  'no': ['one', 'other'],
  'pl': ['one', 'few', 'many', 'other'],
  'pt': ['one', 'other'],
  'ro': ['one', 'few', 'other'],
  'ru': ['one', 'few', 'many', 'other'],
  'sk': ['one', 'few', 'many', 'other'],
  'sl': ['one', 'two', 'few', 'other'],
  'sr': ['one', 'few', 'many', 'other'],
  'sv': ['one', 'other'],
  'th': ['other'],
  'tr': ['other'],
  'uk': ['one', 'few', 'many', 'other'],
  'vi': ['other'],
  'zh': ['other'],
  'zh-CN': ['other'],
  'zh-TW': ['other']
};

function getCldrPluralCategories(locale) {
  if (CLDR_PLURAL_RULES[locale]) {
    return CLDR_PLURAL_RULES[locale].slice();
  }
  const short = locale.split('-')[0].split('_')[0].toLowerCase();
  if (CLDR_PLURAL_RULES[short]) {
    return CLDR_PLURAL_RULES[short].slice();
  }
  return ['one', 'other'];
}

function normalizePlaceholders(placeholders) {
  if (!placeholders || placeholders.length === 0) {
    return DEFAULT_PLACEHOLDERS;
  }
  const result = [];
  for (const p of placeholders) {
    if (p instanceof RegExp) {
      result.push(p);
    } else if (typeof p === 'string') {
      if (p.startsWith('/') && p.lastIndexOf('/') > 0) {
        const lastSlash = p.lastIndexOf('/');
        const pattern = p.slice(1, lastSlash);
        const flags = p.slice(lastSlash + 1);
        result.push(new RegExp(pattern, flags));
      } else {
        result.push(p);
      }
    }
  }
  return result;
}

function matchesPlaceholder(value, placeholders) {
  const trimmed = typeof value === 'string' ? value.trim() : value;
  for (const p of placeholders) {
    if (p instanceof RegExp) {
      if (p.test(String(trimmed))) return true;
    } else {
      if (String(trimmed) === String(p)) return true;
    }
  }
  return false;
}

function buildAllKeysUnion(scannedLocales) {
  const allKeys = new Set();
  for (const locale of Object.keys(scannedLocales)) {
    for (const key of scannedLocales[locale].keys) {
      allKeys.add(key);
    }
  }
  return Array.from(allKeys).sort();
}

function detectReferenceLocale(scannedLocales, preferredRefLocale) {
  const locales = Object.keys(scannedLocales);
  if (preferredRefLocale && scannedLocales[preferredRefLocale]) {
    return preferredRefLocale;
  }
  let bestLocale = null;
  let maxKeys = -1;
  for (const locale of locales) {
    const keyCount = scannedLocales[locale].keys.length;
    if (keyCount > maxKeys) {
      maxKeys = keyCount;
      bestLocale = locale;
    }
  }
  return bestLocale;
}

function analyzeCoverage(scannedLocales, options = {}) {
  const locales = Object.keys(scannedLocales);
  if (locales.length === 0) {
    return { locales: [], allKeys: [], summary: {}, details: {} };
  }
  const preferredRefLocale = options.referenceLocale || null;
  const refLocale = detectReferenceLocale(scannedLocales, preferredRefLocale);
  const allKeys = options.useAllKeysUnion
    ? buildAllKeysUnion(scannedLocales)
    : (scannedLocales[refLocale]?.keys || []);
  const placeholders = normalizePlaceholders(options.placeholders);
  const totalKeys = allKeys.length;
  const details = {};
  for (const locale of locales) {
    const localeData = scannedLocales[locale];
    const localeKeySet = new Set(localeData.keys);
    const presentKeys = [];
    const missingKeys = [];
    const emptyKeys = [];
    const placeholderKeys = [];
    for (const key of allKeys) {
      if (localeKeySet.has(key)) {
        const rawValue = localeData.keyValueMap[key];
        const isNullOrUndefined = rawValue === null || rawValue === undefined;
        const isStringValue = typeof rawValue === 'string';
        const trimmedValue = isStringValue ? rawValue.trim() : rawValue;
        const isEmptyString = isStringValue && trimmedValue === '';
        const isEmpty = isNullOrUndefined || isEmptyString;
        const isPlaceholder = !isEmpty && isStringValue && matchesPlaceholder(rawValue, placeholders);
        if (isEmpty) {
          emptyKeys.push(key);
          missingKeys.push(key);
        } else if (isPlaceholder) {
          placeholderKeys.push(key);
          missingKeys.push(key);
        } else {
          presentKeys.push({ key, files: localeData.keyToFile[key] || [], value: rawValue });
        }
      } else {
        missingKeys.push(key);
      }
    }
    const presentCount = presentKeys.length;
    const emptyCount = emptyKeys.length;
    const placeholderCount = placeholderKeys.length;
    const coverage = totalKeys > 0 ? (presentCount / totalKeys) * 100 : 0;
    details[locale] = {
      locale,
      isReference: locale === refLocale,
      totalKeys,
      presentCount,
      emptyCount,
      placeholderCount,
      missingCount: missingKeys.length,
      coverage: Number(coverage.toFixed(2)),
      presentKeys: presentKeys.map(k => k.key),
      emptyKeys,
      placeholderKeys,
      missingKeys,
      files: localeData.files
    };
  }
  const summary = {
    referenceLocale: refLocale,
    totalLanguages: locales.length,
    totalKeys,
    overallCoverage: Number(
      (Object.values(details).reduce((sum, d) => sum + d.coverage, 0) / locales.length).toFixed(2)
    ),
    completeLocales: Object.values(details).filter(d => d.missingCount === 0).map(d => d.locale),
    incompleteLocales: Object.values(details).filter(d => d.missingCount > 0).map(d => d.locale)
  };
  const partial = { locales, allKeys, summary, details };
  const incompletePlurals = detectIncompletePlurals(partial, { useCldr: options.useCldr });
  const namespaces = analyzeByNamespace(partial, { depth: options.namespaceDepth || 1 });
  summary.pluralWarningsCount = incompletePlurals.length;
  return {
    ...partial,
    incompletePlurals,
    namespaces
  };
}

const PLURAL_SUFFIXES = ['zero', 'one', 'two', 'few', 'many', 'other'];
const PLURAL_SUFFIX_PATTERN = new RegExp(`_(${PLURAL_SUFFIXES.join('|')})$`);

function getPluralBase(key) {
  const match = key.match(PLURAL_SUFFIX_PATTERN);
  if (match) {
    return { base: key.slice(0, -match[0].length), suffix: match[1] };
  }
  return null;
}

function detectIncompletePlurals(analysis, options = {}) {
  const { locales, allKeys, details } = analysis;
  if (locales.length === 0) return [];
  const baseToSuffixes = new Map();
  for (const key of allKeys) {
    const plural = getPluralBase(key);
    if (plural) {
      if (!baseToSuffixes.has(plural.base)) {
        baseToSuffixes.set(plural.base, new Set());
      }
      baseToSuffixes.get(plural.base).add(plural.suffix);
    }
  }
  const warnings = [];
  const useCldr = options.useCldr !== false;
  for (const locale of locales) {
    const detail = details[locale];
    const presentKeySet = new Set(detail.presentKeys);
    const cldrCategories = useCldr ? getCldrPluralCategories(locale) : null;
    for (const [base, globalSuffixes] of baseToSuffixes.entries()) {
      const hasAnyPresent = [...globalSuffixes].some(s => presentKeySet.has(`${base}_${s}`));
      if (!hasAnyPresent) continue;
      let expectedSuffixes;
      if (useCldr && cldrCategories) {
        expectedSuffixes = cldrCategories.slice();
      } else {
        expectedSuffixes = [...globalSuffixes];
      }
      const missingSuffixes = expectedSuffixes.filter(s => !presentKeySet.has(`${base}_${s}`));
      if (missingSuffixes.length > 0) {
        warnings.push({
          locale,
          base,
          expectedSuffixes: expectedSuffixes.sort(),
          missingSuffixes: missingSuffixes.sort(),
          missingKeys: missingSuffixes.map(s => `${base}_${s}`),
          cldr: !!(useCldr && cldrCategories)
        });
      }
    }
  }
  return warnings;
}

function getNamespace(key, depth = 1) {
  if (depth <= 1) {
    const firstDot = key.indexOf('.');
    return firstDot === -1 ? key : key.slice(0, firstDot);
  }
  const parts = key.split('.');
  const take = Math.min(depth, parts.length);
  return parts.slice(0, take).join('.');
}

function analyzeByNamespace(analysis, options = {}) {
  const depth = options.depth || 1;
  const { locales, allKeys, details } = analysis;
  if (locales.length === 0) return {};
  const namespaceKeys = new Map();
  for (const key of allKeys) {
    const ns = getNamespace(key, depth);
    if (!namespaceKeys.has(ns)) namespaceKeys.set(ns, []);
    namespaceKeys.get(ns).push(key);
  }
  const result = {};
  for (const [namespace, nsKeys] of namespaceKeys.entries()) {
    const nsTotal = nsKeys.length;
    const nsKeySet = new Set(nsKeys);
    const localeStats = {};
    for (const locale of locales) {
      const d = details[locale];
      let nsPresent = 0;
      let nsEmpty = 0;
      let nsPlaceholder = 0;
      let nsMissing = 0;
      const nsMissingKeys = [];
      const emptyKeySet = new Set(d.emptyKeys);
      const placeholderKeySet = new Set(d.placeholderKeys);
      const presentKeySet = new Set(d.presentKeys);
      for (const key of nsKeys) {
        if (emptyKeySet.has(key)) {
          nsEmpty++;
          nsMissing++;
          nsMissingKeys.push(key);
        } else if (placeholderKeySet.has(key)) {
          nsPlaceholder++;
          nsMissing++;
          nsMissingKeys.push(key);
        } else if (presentKeySet.has(key)) {
          nsPresent++;
        } else {
          nsMissing++;
          nsMissingKeys.push(key);
        }
      }
      localeStats[locale] = {
        locale,
        total: nsTotal,
        present: nsPresent,
        empty: nsEmpty,
        placeholder: nsPlaceholder,
        missing: nsMissing,
        missingKeys: nsMissingKeys.sort(),
        coverage: nsTotal > 0 ? Number(((nsPresent / nsTotal) * 100).toFixed(2)) : 0
      };
    }
    result[namespace] = {
      namespace,
      depth,
      totalKeys: nsTotal,
      keys: nsKeys.sort(),
      locales: localeStats
    };
  }
  return result;
}

function generateDiffMatrix(analysis) {
  const { locales, allKeys, details } = analysis;
  if (locales.length === 0) return [];
  const rows = [];
  for (const key of allKeys) {
    const row = { key };
    let hasMissing = false;
    for (const locale of locales) {
      const present = details[locale].presentKeys.includes(key);
      row[locale] = present ? '✓' : '✗';
      if (!present) hasMissing = true;
    }
    if (hasMissing) {
      rows.push(row);
    }
  }
  return rows;
}

module.exports = {
  buildAllKeysUnion,
  detectReferenceLocale,
  normalizePlaceholders,
  matchesPlaceholder,
  analyzeCoverage,
  generateDiffMatrix,
  detectIncompletePlurals,
  analyzeByNamespace,
  getPluralBase,
  getNamespace,
  getCldrPluralCategories,
  PLURAL_SUFFIXES,
  CLDR_PLURAL_RULES,
  DEFAULT_PLACEHOLDERS
};
