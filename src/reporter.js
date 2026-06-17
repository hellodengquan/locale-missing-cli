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
  lines.push('');
  lines.push(chalk.bold('📋  各语言详情 Details'));
  lines.push(chalk.gray('───────────────────────────────────────────────'));
  const localeNames = Object.keys(details).sort();
  for (const locale of localeNames) {
    const d = details[locale];
    const color = getStatusColor(d.coverage);
    const refMark = d.isReference ? chalk.magenta(' [REF]') : '';
    const bar = color(formatBar(d.coverage));
    const coverageStr = color.bold(d.coverage.toString().padStart(6, ' ') + '%');
    const emptyNote = d.emptyCount > 0 ? chalk.gray(`  (含空值占位: ${d.emptyCount})`) : '';
    lines.push(`  ${chalk.bold(locale.padEnd(8))}${refMark}`);
    lines.push(`    ${bar} ${coverageStr}  (${d.presentCount}/${d.totalKeys}, 缺 ${d.missingCount})${emptyNote}`);
    lines.push(`    文件: ${chalk.gray(d.files.map(f => path.relative(process.cwd(), f)).join(', '))}`);
    if (showMissingKeys && d.missingKeys.length > 0) {
      const emptyKeySet = new Set(d.emptyKeys);
      const keysToShow = d.missingKeys.slice(0, options.maxKeys || 20);
      const hidden = d.missingKeys.length - keysToShow.length;
      lines.push(`    ${chalk.red.bold('缺失键:')}`);
      for (const key of keysToShow) {
        const isEmpty = emptyKeySet.has(key);
        const mark = isEmpty ? chalk.hex('#FFA500')('◯') : chalk.red('✗');
        const label = isEmpty ? chalk.gray(' (空值占位)') : '';
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
  return lines.join('\n');
}

function generateJsonReport(analysis) {
  const { summary, details } = analysis;
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
      missingCount: d.missingCount,
      emptyKeys: d.emptyKeys,
      missingKeys: d.missingKeys
    };
  }
  return JSON.stringify({
    generatedAt: new Date().toISOString(),
    summary,
    details: simpleDetails
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
