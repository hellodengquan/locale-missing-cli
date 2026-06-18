const fs = require('fs');
const path = require('path');
const chalk = require('chalk');

function getStatusColor(coverage) {
  if (coverage >= 95) return chalk.green;
  if (coverage >= 80) return chalk.yellow;
  if (coverage >= 50) return chalk.hex('#FFA500');
  return chalk.red;
}

function formatBar(percentage, width = 20) {
  const filled = Math.round((percentage / 100) * width);
  const empty = width - filled;
  const filledChar = '█';
  const emptyChar = '░';
  return filledChar.repeat(filled) + emptyChar.repeat(empty);
}

function renderConsoleReport(analysis, options = {}) {
  const { summary, details } = analysis;
  const showMissingKeys = options.showMissingKeys !== false;
  const showMatrix = options.showMatrix === true;
  const lines = [];
  lines.push('');
  lines.push(chalk.bold.cyan('═══════════════════════════════════════════════'));
  lines.push(chalk.bold.cyan('          翻译覆盖率扫描报告'));
  lines.push(chalk.bold.cyan('═══════════════════════════════════════════════'));
  lines.push('');
  lines.push(chalk.bold('📊  概览 Summary'));
  lines.push(chalk.gray('───────────────────────────────────────────────'));
  lines.push(`  基准语言 (Reference):     ${chalk.magenta.bold(summary.referenceLocale)}`);
  lines.push(`  语言总数 (Languages):     ${summary.totalLanguages}`);
  lines.push(`  翻译键总数 (Total Keys):  ${summary.totalKeys}`);
  lines.push(`  整体覆盖率 (Overall):     ${getStatusColor(summary.overallCoverage).bold(summary.overallCoverage + '%')}`);
  lines.push(`  ✅ 完整语言: ${summary.completeLocales.length > 0 ? chalk.green(summary.completeLocales.join(', ')) : chalk.gray('(无)')}`);
  lines.push(`  ⚠️  待补语言: ${summary.incompleteLocales.length > 0 ? chalk.yellow(summary.incompleteLocales.join(', ')) : chalk.gray('(无)')}`);
  if (summary.pluralWarningsCount > 0) {
    lines.push(`  ⚠️  复数键不完整: ${chalk.yellow.bold(summary.pluralWarningsCount + ' 处')}  (详见下方复数键警告)`);
  }
  lines.push('');
  if (analysis.incompletePlurals && analysis.incompletePlurals.length > 0 && options.showPlurals !== false) {
    lines.push(chalk.bold.yellow('⚠️  复数键不完整警告 Plural Warnings'));
    lines.push(chalk.gray('───────────────────────────────────────────────'));
    const pluralsByLocale = {};
    for (const w of analysis.incompletePlurals) {
      if (!pluralsByLocale[w.locale]) pluralsByLocale[w.locale] = [];
      pluralsByLocale[w.locale].push(w);
    }
    for (const locale of Object.keys(pluralsByLocale).sort()) {
      lines.push(`  ${chalk.bold(locale)}:`);
      for (const w of pluralsByLocale[locale]) {
        const expected = w.expectedSuffixes.map(s => chalk.green(s)).join(', ');
        const missing = w.missingSuffixes.map(s => chalk.red.bold(s)).join(', ');
        lines.push(`    ${chalk.yellow(w.base)}: 需要 [${expected}]，缺 [${missing}]`);
      }
    }
    lines.push('');
  }
  lines.push(chalk.bold('📋  各语言详情 Details'));
  lines.push(chalk.gray('───────────────────────────────────────────────'));
  const localeNames = Object.keys(details).sort();
  for (const locale of localeNames) {
    const d = details[locale];
    const color = getStatusColor(d.coverage);
    const refMark = d.isReference ? chalk.magenta(' [REF]') : '';
    const bar = color(formatBar(d.coverage));
    const coverageStr = color.bold(d.coverage.toString().padStart(6, ' ') + '%');
    const emptyNote = d.emptyCount > 0 ? chalk.gray(`  (空值: ${d.emptyCount})`) : '';
    const placeholderNote = d.placeholderCount > 0 ? chalk.gray(`  (占位符: ${d.placeholderCount})`) : '';
    lines.push(`  ${chalk.bold(locale.padEnd(8))}${refMark}`);
    lines.push(`    ${bar} ${coverageStr}  (${d.presentCount}/${d.totalKeys}, 缺 ${d.missingCount})${emptyNote}${placeholderNote}`);
    lines.push(`    文件: ${chalk.gray(d.files.map(f => path.relative(process.cwd(), f)).join(', '))}`);
    if (showMissingKeys && d.missingKeys.length > 0) {
      const emptyKeySet = new Set(d.emptyKeys);
      const placeholderKeySet = new Set(d.placeholderKeys);
      const keysToShow = d.missingKeys.slice(0, options.maxKeys || 20);
      const hidden = d.missingKeys.length - keysToShow.length;
      lines.push(`    ${chalk.red.bold('缺失键:')}`);
      for (const key of keysToShow) {
        const isEmpty = emptyKeySet.has(key);
        const isPlaceholder = placeholderKeySet.has(key);
        let mark, label;
        if (isEmpty) {
          mark = chalk.hex('#FFA500')('◯');
          label = chalk.gray(' (空值/空白)');
        } else if (isPlaceholder) {
          mark = chalk.magenta('◇');
          label = chalk.gray(' (占位符)');
        } else {
          mark = chalk.red('✗');
          label = '';
        }
        lines.push(`      ${mark} ${chalk.yellow(key)}${label}`);
      }
      if (hidden > 0) {
        lines.push(`      ${chalk.gray(`... 还有 ${hidden} 个缺失键未显示 (--max-keys 调整)`)}`);
      }
    }
    lines.push('');
  }
  if (showMatrix && summary.totalLanguages > 0) {
    const { generateDiffMatrix } = require('./analyzer');
    const matrix = generateDiffMatrix(analysis);
    if (matrix.length > 0) {
      lines.push(chalk.bold('🔍  缺失键矩阵 (仅显示有缺失的键)'));
      lines.push(chalk.gray('───────────────────────────────────────────────'));
      const locales = localeNames;
      const header = ['Key', ...locales].map(h => h.padEnd(Math.max(8, h.length + 2))).join(' ');
      lines.push(`  ${chalk.bold(header)}`);
      const maxRows = options.maxMatrixRows || 30;
      const shownMatrix = matrix.slice(0, maxRows);
      for (const row of shownMatrix) {
        const cells = [row.key, ...locales.map(l => {
          const val = row[l];
          return val === '✓' ? chalk.green(val) : chalk.red.bold(val);
        })];
        const paddedCells = cells.map((c, i) => {
          const w = i === 0 ? Math.max(8, locales[0].length + 2) : Math.max(8, locales[i - 1]?.length + 2 || 8);
          return String(c).padEnd(w, ' ');
        });
        lines.push(`  ${paddedCells.join(' ')}`);
      }
      if (matrix.length > maxRows) {
        lines.push(`  ${chalk.gray(`... 还有 ${matrix.length - maxRows} 行未显示`)}`);
      }
      lines.push('');
    }
  }
  if (options.showNamespace && analysis.namespaces && Object.keys(analysis.namespaces).length > 0) {
    lines.push(chalk.bold('🏷️   Namespace 汇总视图'));
    const firstNs = analysis.namespaces[Object.keys(analysis.namespaces)[0]];
    const depthLabel = firstNs && firstNs.depth ? ` (深度: ${firstNs.depth})` : '';
    lines.push(chalk.gray('───────────────────────────────────────────────' + depthLabel));
    const namespaceNames = Object.keys(analysis.namespaces).sort();
    const localeNames = Object.keys(details).sort();
    const maxNsLen = Math.max(9, ...namespaceNames.map(n => n.length));
    const nsHeader = ['Namespace'.padEnd(maxNsLen), ...localeNames.map(l => l.padEnd(10))].join(' ');
    lines.push(`  ${chalk.bold(nsHeader)}`);
    for (const ns of namespaceNames) {
      const nsData = analysis.namespaces[ns];
      const row = [ns.padEnd(maxNsLen)];
      for (const locale of localeNames) {
        const stat = nsData.locales[locale];
        if (!stat) {
          row.push('-'.padEnd(10));
          continue;
        }
        const color = getStatusColor(stat.coverage);
        const cov = color(stat.coverage.toString().padStart(5, ' ') + '%');
        const mark = stat.missing > 0 ? ` ${chalk.red('✗')}${stat.missing}` : ` ${chalk.green('✓')}`;
        row.push(cov + mark);
      }
      lines.push(`  ${row.join(' ')}`);
    }
    lines.push('');
    if (options.showNamespaceDetails !== false) {
      for (const ns of namespaceNames) {
        const nsData = analysis.namespaces[ns];
        const badLocales = Object.entries(nsData.locales)
          .filter(([, s]) => s.missing > 0)
          .sort(([, a], [, b]) => b.missing - a.missing);
        if (badLocales.length === 0) continue;
        lines.push(`  ${chalk.bold(ns)}  (共 ${nsData.totalKeys} 键)`);
        for (const [locale, stat] of badLocales) {
          const keysToShow = stat.missingKeys.slice(0, options.maxNamespaceKeys || 10);
          const hidden = stat.missingKeys.length - keysToShow.length;
          lines.push(`    ${chalk.bold(locale.padEnd(8))} 缺 ${stat.missing}: ${chalk.yellow(keysToShow.join(', '))}${hidden > 0 ? chalk.gray(` ... +${hidden}`) : ''}`);
        }
        lines.push('');
      }
    }
  }
  return lines.join('\n');
}

function generateJsonReport(analysis) {
  const { summary, details, incompletePlurals = [], namespaces = {} } = analysis;
  const simpleDetails = {};
  for (const locale of Object.keys(details)) {
    const d = details[locale];
    simpleDetails[locale] = {
      locale: d.locale,
      isReference: d.isReference,
      coverage: d.coverage,
      totalKeys: d.totalKeys,
      presentCount: d.presentCount,
      emptyCount: d.emptyCount,
      placeholderCount: d.placeholderCount,
      missingCount: d.missingCount,
      emptyKeys: d.emptyKeys,
      placeholderKeys: d.placeholderKeys,
      missingKeys: d.missingKeys
    };
  }
  const simpleNamespaces = {};
  for (const [ns, nsData] of Object.entries(namespaces)) {
    const localeStats = {};
    for (const [locale, stat] of Object.entries(nsData.locales)) {
      localeStats[locale] = {
        coverage: stat.coverage,
        total: stat.total,
        present: stat.present,
        empty: stat.empty,
        placeholder: stat.placeholder,
        missing: stat.missing,
        missingKeys: stat.missingKeys
      };
    }
    simpleNamespaces[ns] = {
      namespace: ns,
      depth: nsData.depth,
      totalKeys: nsData.totalKeys,
      locales: localeStats
    };
  }
  return JSON.stringify({
    generatedAt: new Date().toISOString(),
    summary,
    details: simpleDetails,
    incompletePlurals,
    namespaces: simpleNamespaces
  }, null, 2);
}

function generateCsvReport(analysis) {
  const { details, allKeys } = analysis;
  const locales = Object.keys(details).sort();
  const lines = [];
  lines.push(['key', ...locales].join(','));
  for (const key of allKeys) {
    const row = [key];
    for (const locale of locales) {
      row.push(details[locale].presentKeys.includes(key) ? '1' : '0');
    }
    lines.push(row.join(','));
  }
  return lines.join('\n');
}

function writeReport(outputPath, content) {
  const dir = path.dirname(outputPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(outputPath, content, 'utf-8');
}

module.exports = {
  renderConsoleReport,
  generateJsonReport,
  generateCsvReport,
  writeReport
};
