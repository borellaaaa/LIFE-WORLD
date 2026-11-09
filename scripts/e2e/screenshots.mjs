/**
 * Gera capturas de tela do jogo em cenas pré-definidas.
 *   node scripts/e2e/screenshots.mjs [url] [pasta-saida] [filtro]
 * Usa a API de depuração window.__lifeWorld (teleporte, horário, câmera).
 */
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
const { chromium } = createRequire(import.meta.url)('playwright');
const url = process.argv[2] ?? 'http://localhost:5173';
const out = process.argv[3] ?? 'docs/screenshots';
const filter = process.argv[4];
mkdirSync(out, { recursive: true });

// yaw da câmera: 0 = câmera ao sul (+Z) olhando para o norte (-Z)
const SHOTS = [
  { name: '01-fachada-manha', time: 9.2, at: [-0.8, -12.2, Math.PI], cam: [0.35, 0.22, 6.5] },
  { name: '02-rua-tarde', time: 16.4, at: [-6, 1.5, -1.2], cam: [2.2, 0.18, 5.5] },
  { name: '03-sala', time: 11, at: [-3.6, -18.2, -1.6], cam: [-0.9, 0.42, 3.2] },
  { name: '04-cozinha', time: 12.5, at: [3.6, -19.4, 0.2], cam: [-2.7, 0.45, 3.0] },
  { name: '05-quarto', time: 10, at: [-1.0, -22.6, -2.2], cam: [-1.2, 0.5, 3.0] },
  { name: '06-banheiro', time: 10, at: [3.4, -23.3, 2.4], cam: [-2.6, 0.55, 2.6] },
  { name: '07-por-do-sol', time: 18.15, at: [-0.8, -9.5, Math.PI], cam: [0.75, 0.16, 6.5] },
  { name: '08-noite', time: 21.5, at: [-0.6, -12.6, 0.4], cam: [0.6, 0.18, 5.2] },
  { name: '09-quintal', time: 15, at: [-2.5, -28.6, 0], cam: [Math.PI + 0.5, 0.25, 5] },
  // atividades (pressiona E perto do objeto)
  { name: '10-assistindo-tv', time: 20, at: [-3.4, -17.6, -Math.PI / 2], cam: [-Math.PI / 2 + 0.35, 0.3, 2.6], act: 'KeyE', wait: 2 },
  { name: '11-dormindo', time: 23.2, at: [-1.45, -23.2, -Math.PI / 2], cam: [Math.PI / 2 + 0.5, 0.75, 3.0], act: 'KeyE', wait: 2 },
  { name: '12-computador', time: 14, at: [-1.2, -19.2, Math.PI], cam: [0.65, 0.35, 2.4], act: 'KeyE', wait: 2 },
  { name: '13-cozinhando', time: 19, at: [2.7, -17.9, 0], cam: [Math.PI - 0.5, 0.35, 2.6], act: 'KeyE', wait: 2 },
  { name: '14-telefone', time: 17, at: [-3.3, -17.15, Math.PI / 2], cam: [-Math.PI / 2 - 0.5, 0.2, 2.4], act: 'KeyE', wait: 2 },
];

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', (e) => console.log('pageerror:', e.message));
await page.goto(`${url}/?capture&autoplay`);
await page.waitForFunction(() => window.__lifeWorld !== undefined, null, { timeout: 180000 });
await page.evaluate(() => window.__lifeWorld.stopLoop());
for (const s of SHOTS) {
  if (filter && !s.name.includes(filter)) continue;
  await page.evaluate((s) => {
    const lw = window.__lifeWorld;
    lw.game.clock.speed = 1;
    const st = lw.state();
    if (st.activity) { lw.key('KeyW', true); lw.simulate(0.1); lw.key('KeyW', false); lw.simulate(0.4); }
    lw.setTime(s.time);
    lw.teleport(s.at[0], s.at[1], s.at[2]);
    lw.setCamera(s.cam[0], s.cam[1], s.cam[2]);
    lw.simulate(1.2);
    if (s.act) {
      lw.key(s.act, true); lw.simulate(1 / 30); lw.key(s.act, false);
      lw.simulate(s.wait ?? 1);
      lw.setCamera(s.cam[0], s.cam[1], s.cam[2]);
      lw.simulate(0.6);
    }
    lw.pushUI();
    lw.render();
  }, s);
  const info = await page.evaluate(() => window.__lifeWorld.state());
  if (s.act && !info.activity) console.log('  (atividade não iniciou: foco =', info.focused, ')');
  await page.waitForTimeout(250);
  await page.screenshot({ path: `${out}/${s.name}.jpg`, type: 'jpeg', quality: 86 });
  console.log('ok', s.name, `draw=${info.drawCalls} tris=${info.triangles}`);
}
// Menus: pausa e configurações
if (!filter || 'menus'.includes(filter)) {
  await page.evaluate(() => { const lw = window.__lifeWorld; lw.key('KeyW', true); lw.simulate(0.1); lw.key('KeyW', false); lw.simulate(0.4); lw.setTime(16.6); lw.teleport(-4.5, -12, -2.4); lw.setCamera(-2.4 + Math.PI, 0.25, 6); lw.simulate(1); lw.render(); });
  await page.keyboard.press('Escape');
  await page.evaluate(() => window.__lifeWorld.render());
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${out}/15-menu-pausa.jpg`, type: 'jpeg', quality: 86 });
  await page.getByText('Configurações').click();
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${out}/16-configuracoes.jpg`, type: 'jpeg', quality: 86 });
  console.log('ok menus');
}
// Tela de título
if (!filter || 'titulo'.includes(filter)) {
  const t = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  await t.goto(`${url}/?capture`);
  await t.waitForFunction(() => window.__lifeWorld !== undefined, null, { timeout: 180000 });
  await t.evaluate(() => { const lw = window.__lifeWorld; lw.stopLoop(); lw.setTime(17.4); lw.teleport(-0.8, -12.4, 0.5); lw.setCamera(0.5 + Math.PI - 0.9, 0.12, 5.5); lw.simulate(1); lw.render(); });
  await t.waitForTimeout(500);
  await t.screenshot({ path: `${out}/00-titulo.jpg`, type: 'jpeg', quality: 86 });
  console.log('ok titulo');
}
await browser.close();
