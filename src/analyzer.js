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
  const totalKeys = allKeys.length;
  const details = {};
  for (const locale of locales) {
    const localeData = scannedLocales[locale];
    const localeKeySet = new Set(localeData.keys);
    const presentKeys = [];
    const missingKeys = [];
    const emptyKeys = [];
    for (const key of allKeys) {
      if (localeKeySet.has(key)) {
        const value = localeData.keyValueMap[key];
        const isEmpty = value === '' || value === null || value === undefined;
        if (isEmpty) {
          emptyKeys.push(key);
          missingKeys.push(key);
        } else {
          presentKeys.push({ key, files: localeData.keyToFile[key] || [], value });
        }
      } else {
        missingKeys.push(key);
      }
    }
    const presentCount = presentKeys.length;
    const emptyCount = emptyKeys.length;
    const coverage = totalKeys > 0 ? (presentCount / totalKeys) * 100 : 0;
    details[locale] = {
      locale,
      isReference: locale === refLocale,
      totalKeys,
      presentCount,
      emptyCount,
      missingCount: missingKeys.length,
      coverage: Number(coverage.toFixed(2)),
      presentKeys: presentKeys.map(k => k.key),
      emptyKeys,
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
  analyzeCoverage,
  generateDiffMatrix
};
