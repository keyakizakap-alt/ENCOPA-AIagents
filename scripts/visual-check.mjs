// Renders the running app at several widths and reports the layout faults that a build,
// a type check and an API test suite all pass straight through: horizontal overflow,
// mismatched control sizes, truncated labels, a page that never hydrates, and console
// errors. Written after a Content-Security-Policy shipped green on every other check and
// still left the live page unstyled.
//
//   pnpm build && pnpm start &   # or any running instance
//   node scripts/visual-check.mjs http://127.0.0.1:3000
//
// Needs a Chromium binary. Set CHROMIUM_PATH, or rely on Playwright's default lookup.
import { chromium } from 'playwright-core';

const target = process.argv[2] || 'http://127.0.0.1:3000';
const shotDir = process.argv[3] || '';
const widths = [
  ['320', 320, 1000, true],
  ['390', 390, 1000, true],
  ['834', 834, 1000, false],
  ['1280', 1280, 950, false],
  ['1536', 1536, 950, false],
];

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || undefined,
  args: ['--no-sandbox'],
});

let failures = 0;
for (const [name, width, height, mobile] of widths) {
  const page = await browser.newPage({ viewport: { width, height }, isMobile: mobile, hasTouch: mobile });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e).slice(0, 120)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 120)) });
  await page.goto(target, { waitUntil: 'networkidle' });

  const report = await page.evaluate(() => {
    const controls = [...document.querySelectorAll('main input, main [role="combobox"], main button')]
      .map((el) => el.getBoundingClientRect())
      .filter((r) => r.width > 0);
    const truncated = [...document.querySelectorAll('.truncate')]
      .filter((el) => el.scrollWidth > el.clientWidth + 1).length;
    // Controls that sit in one row must share a height. A shadcn trigger sets its own
    // through a data-attribute variant, which quietly outranks a plain height class and
    // leaves one box shorter than its neighbours.
    const rowHeights = [...document.querySelectorAll('#conditions, [data-row="conditions"]')]
      .flatMap((row) => [...row.querySelectorAll('input, [role="combobox"], button')]
        .map((el) => Math.round(el.getBoundingClientRect().height))
        .filter((h) => h > 0));
    const uneven = [...new Set(rowHeights)];
    // Tailwind v4 dropped cursor:pointer from its button preflight, which left every
    // button in the app looking inert. An enabled control must read as pressable, and a
    // disabled one must not.
    const affordance = [...document.querySelectorAll('button, a[href], [role="button"], summary')]
      .filter((el) => { const r = el.getBoundingClientRect(); return r.width > 4 && r.height > 4 })
      .filter((el) => {
        const cursor = getComputedStyle(el).cursor;
        const off = el.hasAttribute('disabled') || el.getAttribute('aria-disabled') === 'true';
        return off ? !['not-allowed', 'progress'].includes(cursor) : cursor !== 'pointer';
      })
      .map((el) => (el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 24));
    return {
      overflow: document.documentElement.scrollWidth - window.innerWidth,
      // A page that never hydrated leaves client-rendered values empty.
      hydrated: (document.querySelector('[role="combobox"]')?.textContent ?? 'n/a').trim().length > 0,
      styled: document.styleSheets.length > 0,
      truncated,
      uneven,
      affordance,
      controlHeights: [...new Set(controls.map((r) => Math.round(r.height)))].sort((a, b) => a - b),
    };
  });

  const problems = [];
  if (report.overflow > 0) problems.push(`横に ${report.overflow}px はみ出し`);
  if (!report.hydrated) problems.push('ハイドレーション未完了');
  if (!report.styled) problems.push('スタイルシート未適用');
  if (report.truncated > 0) problems.push(`文字切れ ${report.truncated} 件`);
  if (report.uneven.length > 1) problems.push(`検索条件の高さ不揃い: ${report.uneven.join('/')}px`);
  if (report.affordance.length) problems.push(`カーソル不正 ${report.affordance.length} 件: ${report.affordance.slice(0, 3).join(' / ')}`);
  if (errors.length) problems.push(`コンソールエラー ${errors.length} 件: ${errors[0]}`);

  if (problems.length) failures += 1;
  console.log(`${name.padStart(4)}px  ${problems.length ? '✗ ' + problems.join(' / ') : '✓ 問題なし'}`);
  if (shotDir) await page.screenshot({ path: `${shotDir}/${name}.png`, fullPage: false });
  await page.close();
}

await browser.close();
process.exit(failures ? 1 : 0);
