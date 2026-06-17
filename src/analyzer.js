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
  return {
    locales,
    allKeys,
    summary,
    details
  };
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
  DEFAULT_PLACEHOLDERS
};
