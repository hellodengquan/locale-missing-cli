const fs = require('fs');
const path = require('path');
const { glob } = require('glob');

function flattenObject(obj, prefix = '') {
  const result = {};
  for (const key of Object.keys(obj)) {
    const newKey = prefix ? `${prefix}.${key}` : key;
    const value = obj[key];
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      Object.assign(result, flattenObject(value, newKey));
    } else {
      result[newKey] = value;
    }
  }
  return result;
}

function extractLocaleFromFilePath(filePath, baseDir) {
  const relative = path.relative(baseDir, filePath);
  const dirname = path.dirname(relative);
  const basename = path.basename(relative, path.extname(relative));
  const parts = dirname.split(path.sep).filter(Boolean);
  const localeCandidates = [...parts, basename];
  const localePattern = /^([a-z]{2})([-_][A-Z]{2})?$/;
  for (let i = localeCandidates.length - 1; i >= 0; i--) {
    if (localePattern.test(localeCandidates[i])) {
      return localeCandidates[i];
    }
  }
  return basename;
}

async function findLocaleFiles(dir, patterns) {
  const files = [];
  for (const pattern of patterns) {
    const matched = await glob(pattern, {
      cwd: dir,
      absolute: true,
      nodir: true,
      ignore: ['**/node_modules/**', '**/dist/**', '**/build/**']
    });
    files.push(...matched);
  }
  return [...new Set(files)];
}

function loadJsonFile(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(content);
  } catch (err) {
    throw new Error(`解析文件失败: ${filePath}\n${err.message}`);
  }
}

async function scanLocaleFiles(dir, options = {}) {
  const patterns = options.patterns || ['**/locales/**/*.json', '**/i18n/**/*.json', '**/lang/**/*.json', '**/*.{en,zh,ja,ko,fr,de,es,pt,it,ru,ar,hi,nl,pl,sv,tr,vi,th,id,ms,cs,da,fi,el,hu,nb,ro,sk,sl,uk,bg,he}*.json'];
  const files = await findLocaleFiles(dir, patterns);
  const results = {};
  for (const file of files) {
    const locale = extractLocaleFromFilePath(file, dir);
    const rawData = loadJsonFile(file);
    const flatKeys = flattenObject(rawData);
    if (!results[locale]) {
      results[locale] = {
        locale,
        files: [],
        keys: new Set(),
        keyToFile: {}
      };
    }
    results[locale].files.push(file);
    for (const key of Object.keys(flatKeys)) {
      results[locale].keys.add(key);
      if (!results[locale].keyToFile[key]) {
        results[locale].keyToFile[key] = [];
      }
      results[locale].keyToFile[key].push(file);
    }
  }
  return Object.fromEntries(
    Object.entries(results).map(([locale, data]) => [
      locale,
      {
        locale,
        files: data.files,
        keys: Array.from(data.keys).sort(),
        keyToFile: data.keyToFile
      }
    ])
  );
}

module.exports = {
  flattenObject,
  extractLocaleFromFilePath,
  findLocaleFiles,
  loadJsonFile,
  scanLocaleFiles
};
