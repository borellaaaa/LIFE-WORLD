// Captura telas do visualizador de personagem: node scripts/e2e/shoot-viewer.mjs <url-base> <saida> [combos...]
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_PATH || 'playwright');
const [base, outDir, ...combos] = process.argv.slice(2);
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 520, height: 720 } });
page.on('console', (m) => { if (m.type() === 'error') console.log('console:', m.text()); });
page.on('pageerror', (e) => console.log('pageerror:', e.message));
for (const c of combos) {
  await page.goto(`${base}/viewer.html?${c}`);
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 60000 });
  const name = c.replace(/[^a-z0-9]+/gi, '_');
  await page.screenshot({ path: `${outDir}/${name}.png` });
  console.log('ok', name);
}
await browser.close();
