/**
 * Teste de fumaça (end-to-end) da jogabilidade no navegador real (Chromium).
 *   npm run dev   (em outro terminal)
 *   npm run e2e   [-- http://localhost:5173]
 *
 * Usa window.__lifeWorld para simular teclas e avançar a simulação de forma
 * determinística (independente do FPS).
 */
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
const url = process.argv[2] ?? 'http://localhost:5173';

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

await page.goto(`${url}/?capture&autoplay`);
await page.waitForFunction(() => window.__lifeWorld !== undefined, null, { timeout: 180000 });
await page.evaluate(() => window.__lifeWorld.stopLoop());

const results = [];
async function test(name, fn) {
  try {
    const detail = await page.evaluate(fn);
    const ok = detail && detail.ok;
    results.push({ name, ok, detail });
  } catch (e) {
    results.push({ name, ok: false, detail: String(e) });
  }
}

// helpers injetados na página
await page.evaluate(() => {
  const lw = window.__lifeWorld;
  window.T = {
    hold(code, seconds) { lw.key(code, true); lw.simulate(seconds); lw.key(code, false); lw.simulate(0.1); },
    press(code) { lw.key(code, true); lw.simulate(1 / 30); lw.key(code, false); lw.simulate(1 / 30); },
    s: () => lw.state(),
  };
});

await test('Personagem nasce e fica apoiado no chão (gravidade)', () => {
  window.__lifeWorld.simulate(1.5);
  const s = T.s();
  return { ok: s.grounded && Math.abs(s.feet[1] - 0.12) < 0.05, y: s.feet[1], grounded: s.grounded };
});

await test('WASD: andar para frente desloca o personagem', () => {
  window.__lifeWorld.teleport(-30, 1.5, Math.PI); window.__lifeWorld.setCamera(0, 0.3); window.__lifeWorld.simulate(0.3);
  const a = T.s().feet;
  T.hold('KeyW', 1.5);
  const b = T.s().feet;
  const d = Math.hypot(b[0] - a[0], b[2] - a[2]);
  return { ok: d > 1.6 && d < 3.2, distance: +d.toFixed(2) };
});

await test('Shift: correr é mais rápido que andar', () => {
  const lw = window.__lifeWorld;
  lw.teleport(-30, 1.5, Math.PI / 2); lw.simulate(0.3);
  lw.key('KeyW', true); lw.simulate(0.8);
  const walk = T.s().speed;
  lw.key('ShiftLeft', true); lw.simulate(0.8);
  const run = T.s().speed;
  lw.key('ShiftLeft', false); lw.key('KeyW', false); lw.simulate(0.5);
  return { ok: run > walk * 2 && run > 3.5, walk: +walk.toFixed(2), run: +run.toFixed(2) };
});

await test('Personagem gira na direção do movimento', () => {
  const lw = window.__lifeWorld;
  lw.teleport(-30, 1.5, 0); lw.setCamera(0, 0.3); lw.simulate(0.3);
  T.hold('KeyD', 1.0); // câmera olhando -Z => direita = +X => yaw ~ +90°
  const yaw = T.s().yaw;
  const diff = Math.abs(Math.atan2(Math.sin(yaw - Math.PI / 2), Math.cos(yaw - Math.PI / 2)));
  return { ok: diff < 0.25, yawDeg: +(yaw * 180 / Math.PI).toFixed(1) };
});

await test('Porta fechada bloqueia a passagem', () => {
  const lw = window.__lifeWorld;
  lw.teleport(-0.8, -13.2, Math.PI); lw.setCamera(0, 0.3); lw.simulate(0.3);
  T.hold('KeyW', 4);
  const s = T.s();
  // sobe a varanda (y = 0.27) e para na folha da porta (z = -16.5)
  return { ok: s.feet[2] > -16.5 && s.feet[2] < -15.8 && Math.abs(s.feet[1] - 0.27) < 0.02 && !s.indoor, y: +s.feet[1].toFixed(3), z: +s.feet[2].toFixed(2) };
});

await test('Indicador de interação aparece perto da porta', () => {
  const s = T.s();
  return { ok: s.focused === 'door-front', focused: s.focused };
});

await test('E abre a porta e permite entrar na casa', () => {
  T.press('KeyE');
  window.__lifeWorld.simulate(1);
  const opened = T.s().doors['door-front'];
  T.hold('KeyW', 2.2);
  const s = T.s();
  return { ok: opened && s.indoor && s.feet[2] < -17, opened, indoor: s.indoor, z: +s.feet[2].toFixed(2) };
});

await test('Não atravessa paredes (parede lateral do quarto)', () => {
  const lw = window.__lifeWorld;
  lw.teleport(-4.6, -22.55, -Math.PI / 2); lw.setCamera(Math.PI / 2, 0.3); lw.simulate(0.3);
  const x0 = T.s().feet[0];
  T.hold('KeyW', 4);
  const s = T.s();
  // parede interna em x = -5.9; raio do personagem 0.27
  return { ok: s.feet[0] < x0 - 0.5 && s.feet[0] > -5.9, from: +x0.toFixed(2), x: +s.feet[0].toFixed(2) };
});

await test('Sobe degraus e meio-fio (auto-step)', () => {
  const lw = window.__lifeWorld;
  lw.teleport(-20, 0, Math.PI); lw.setCamera(0, 0.3); lw.simulate(0.3);
  T.hold('KeyW', 3.5);
  const s = T.s();
  return { ok: s.feet[1] > 0.11 && s.feet[2] < -5, y: +s.feet[1].toFixed(3), z: +s.feet[2].toFixed(2) };
});

await test('Não atravessa móveis (sofá)', () => {
  const lw = window.__lifeWorld;
  lw.teleport(-1.2, -18.7, -Math.PI / 2); lw.setCamera(Math.PI / 2, 0.3); lw.simulate(0.3);
  T.hold('KeyW', 3);
  const s = T.s();
  // encosto do sofá em x ≈ -2.13
  return { ok: s.feet[0] > -2.2, x: +s.feet[0].toFixed(2) };
});

await test('Geladeira: lanche aumenta Fome e custa $6', () => {
  const lw = window.__lifeWorld;
  lw.setTime(12);
  lw.teleport(4.55, -20.48, Math.PI / 2); lw.setCamera(-Math.PI / 2, 0.3); lw.simulate(0.3);
  const before = T.s();
  const focused = before.focused;
  T.press('KeyE');
  const during = T.s().activity;
  lw.simulate(17); // 15 min de jogo = 15 s em velocidade 1
  const after = T.s();
  return {
    ok: focused === 'fridge' && during === 'snack' && after.activity === null && after.needs.hunger > before.needs.hunger + 15 && Math.round(before.money - after.money) === 6,
    focused, during, hunger: [Math.round(before.needs.hunger), Math.round(after.needs.hunger)], money: [before.money, Math.round(after.money)],
  };
});

await test('Cama: dormir acelera o tempo e recupera Energia; WASD cancela', () => {
  const lw = window.__lifeWorld;
  lw.teleport(-1.45, -23.2, -Math.PI / 2); lw.setCamera(Math.PI / 2, 0.4); lw.simulate(0.3);
  const before = T.s();
  T.press('KeyE');
  const act = T.s().activity;
  lw.simulate(3);
  const mid = T.s();
  T.press('KeyW');
  lw.simulate(0.5);
  const after = T.s();
  const minutes = mid.clock.minute - before.clock.minute;
  return {
    ok: before.focused === 'bed' && act === 'sleep' && minutes > 30 && mid.needs.energy > before.needs.energy && after.activity === null,
    focused: before.focused, act, gameMinutesIn3s: Math.round(minutes), energy: [Math.round(before.needs.energy), Math.round(mid.needs.energy)],
  };
});

await test('Necessidades decaem com o tempo', () => {
  const lw = window.__lifeWorld;
  lw.teleport(-30, 1.5, 0); lw.simulate(0.2);
  const a = T.s().needs;
  lw.game.setSpeed(3); lw.simulate(6); lw.game.setSpeed(1); // ~1 h de jogo
  const b = T.s().needs;
  return { ok: b.hunger < a.hunger - 4 && b.fun < a.fun - 3, hunger: [Math.round(a.hunger), Math.round(b.hunger)], fun: [Math.round(a.fun), Math.round(b.fun)] };
});

await test('Ciclo dia/noite altera a iluminação', () => {
  const lw = window.__lifeWorld;
  lw.setTime(12); lw.simulate(0.1);
  const day = lw.game.dayNight.sun.intensity;
  lw.setTime(23); lw.simulate(0.1);
  const night = lw.game.dayNight.sun.intensity;
  const nf = lw.game.dayNight.nightFactor;
  lw.setTime(10); lw.simulate(0.1);
  return { ok: day > 2 && night < 0.8 && nf > 0.9, day: +day.toFixed(2), night: +night.toFixed(2), nightFactor: +nf.toFixed(2) };
});

// Menu de pausa pela tecla Esc (evento real do teclado)
await page.keyboard.press('Escape');
await page.evaluate(() => window.__lifeWorld.simulate(0.2));
await test('Esc abre o menu de pausa e congela o relógio', () => {
  const lw = window.__lifeWorld;
  const menu = document.querySelector('.menu__title')?.textContent;
  const t0 = T.s().clock.minute;
  lw.simulate(3);
  const t1 = T.s().clock.minute;
  return { ok: menu === 'Jogo pausado' && t1 === t0, menu, frozen: t1 === t0 };
});

const perf = await page.evaluate(() => window.__lifeWorld.state());
await browser.close();

let pass = 0;
for (const r of results) {
  console.log(`${r.ok ? 'PASSOU' : 'FALHOU'}  ${r.name}  ${JSON.stringify(r.detail)}`);
  if (r.ok) pass++;
}
console.log(`\n${pass}/${results.length} testes passaram. draw calls=${perf.drawCalls} triângulos=${perf.triangles} colisores=${perf.colliders}`);
if (errors.length) console.log('Erros no console:', errors.slice(0, 10));
process.exit(pass === results.length && errors.length === 0 ? 0 : 1);
