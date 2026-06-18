const { Command } = require('commander');
const path = require('path');
const chalk = require('chalk');
const { scanLocaleFiles } = require('./scanner');
const { analyzeCoverage } = require('./analyzer');
const {
  renderConsoleReport,
  generateJsonReport,
  generateCsvReport,
  writeReport
} = require('./reporter');

const program = new Command();

program
  .name('locale-scan')
  .description('扫描多语言资源文件，定位缺失翻译键并生成覆盖率报告')
  .version('1.0.0')
  .option('-d, --dir <path>', '扫描目录', process.cwd())
  .option('-r, --reference <locale>', '指定基准语言（默认使用键最多的语言）')
  .option('--union', '使用所有语言的键并集作为基准（而非仅基准语言）')
  .option('-p, --pattern <patterns...>', '自定义文件匹配模式（逗号分隔）')
  .option('--no-missing', '不输出缺失键列表')
  .option('--matrix', '输出缺失键对比矩阵')
  .option('--max-keys <number>', '每种语言最多显示的缺失键数', '20')
  .option('--max-matrix-rows <number>', '矩阵最多显示行数', '30')
  .option('-o, --output <path>', '报告输出目录', null)
  .option('--format <format>', '输出格式: console,json,csv,all', 'console')
  .option('--fail-under <percentage>', '覆盖率低于此百分比时退出码为 1', '0')
  .option('--placeholder <tokens...>', '自定义占位符标记（字符串或 /regex/ 格式），匹配到的值视为未翻译。默认包含 TODO/TBD/[en] 等')
  .option('--no-default-placeholders', '禁用内置占位符检测，仅使用 --placeholder 指定的')
  .option('--namespace', '输出按 namespace 汇总的视图（按 auth/dashboard/profile 等分组）')
  .option('--no-namespace-details', '在 namespace 视图中不显示具体缺失键列表')
  .option('--max-namespace-keys <number>', '每个 namespace 下每种语言最多显示的缺失键数', '10')
  .option('--no-plurals', '不输出复数键不完整警告');

async function main() {
  program.parse(process.argv);
  const opts = program.opts();
  const scanDir = path.resolve(opts.dir);
  const patterns = opts.pattern ? opts.pattern : undefined;
  const failUnder = parseFloat(opts.failUnder);
  console.log(chalk.cyan(`🔎  正在扫描目录: ${scanDir}`));
  let scanned;
  try {
    scanned = await scanLocaleFiles(scanDir, { patterns });
  } catch (err) {
    console.error(chalk.red('❌ 扫描失败:'), err.message);
    process.exit(1);
  }
  const localeCount = Object.keys(scanned).length;
  if (localeCount === 0) {
    console.log(chalk.yellow('⚠️  未找到任何多语言资源文件'));
    console.log(chalk.gray('提示: 可使用 -p 参数指定文件匹配模式'));
    process.exit(0);
  }
  console.log(chalk.green(`✅ 找到 ${localeCount} 种语言的资源文件`));
  const { normalizePlaceholders, DEFAULT_PLACEHOLDERS } = require('./analyzer');
  let placeholderList = [];
  if (opts.defaultPlaceholders !== false) {
    placeholderList = placeholderList.concat(DEFAULT_PLACEHOLDERS);
  }
  if (opts.placeholder && opts.placeholder.length > 0) {
    placeholderList = placeholderList.concat(opts.placeholder);
  }
  const analysis = analyzeCoverage(scanned, {
    referenceLocale: opts.reference,
    useAllKeysUnion: !!opts.union,
    placeholders: placeholderList
  });
  const consoleOptions = {
    showMissingKeys: opts.missing !== false,
    showMatrix: !!opts.matrix,
    maxKeys: parseInt(opts.maxKeys, 10),
    maxMatrixRows: parseInt(opts.maxMatrixRows, 10),
    showNamespace: !!opts.namespace,
    showNamespaceDetails: opts.namespaceDetails !== false,
    maxNamespaceKeys: parseInt(opts.maxNamespaceKeys, 10),
    showPlurals: opts.plurals !== false
  };
  if (opts.format === 'console' || opts.format === 'all') {
    const report = renderConsoleReport(analysis, consoleOptions);
    console.log(report);
  }
  if (opts.output) {
    const outputDir = path.resolve(opts.output);
    if (opts.format === 'json' || opts.format === 'all') {
      const jsonPath = path.join(outputDir, 'locale-report.json');
      writeReport(jsonPath, generateJsonReport(analysis));
      console.log(chalk.gray(`📄 JSON 报告已写入: ${jsonPath}`));
    }
    if (opts.format === 'csv' || opts.format === 'all') {
      const csvPath = path.join(outputDir, 'locale-report.csv');
      writeReport(csvPath, generateCsvReport(analysis));
      console.log(chalk.gray(`📄 CSV 报告已写入: ${csvPath}`));
    }
  }
  if (failUnder > 0) {
    const overall = analysis.summary.overallCoverage;
    if (overall < failUnder) {
      console.log(chalk.red(`\n❌ 整体覆盖率 ${overall}% 低于阈值 ${failUnder}%`));
      process.exit(1);
    }
  }
}

main().catch(err => {
  console.error(chalk.red('❌ 未预期的错误:'), err);
  process.exit(1);
});
