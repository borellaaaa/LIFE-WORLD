import { describe, it, expect } from 'vitest';
import { GameClock, SPEEDS } from '../GameClock';
import { Needs, BASE_RATES, moodLabel } from '../Needs';

describe('GameClock', () => {
  it('começa na segunda-feira, dia 1, no horário informado', () => {
    const c = new GameClock(1, 8 * 60 + 30);
    expect(c.day).toBe(1);
    expect(c.weekday).toBe(0);
    expect(GameClock.format(c.minuteOfDay)).toBe('08:30');
  });

  it('1 segundo real = 1 minuto de jogo na velocidade normal', () => {
    const c = new GameClock(1, 0);
    c.speed = 1;
    expect(c.tick(60)).toBeCloseTo(60);
    expect(GameClock.format(c.minuteOfDay)).toBe('01:00');
  });

  it('velocidades 2 e 3 aceleram o tempo e 0 pausa', () => {
    const c = new GameClock(1, 0);
    c.speed = 3;
    expect(c.tick(1)).toBeCloseTo(SPEEDS[3]);
    c.speed = 0;
    expect(c.paused).toBe(true);
    expect(c.tick(100)).toBe(0);
  });

  it('o multiplicador temporário (dormir) acelera ainda mais', () => {
    const c = new GameClock(1, 0);
    c.speed = 1;
    c.boost = 14;
    expect(c.tick(1)).toBeCloseTo(14);
  });

  it('vira o dia e avança o dia da semana', () => {
    const c = new GameClock(1, 23 * 60 + 59);
    c.tick(2);
    expect(c.day).toBe(2);
    expect(c.weekday).toBe(1);
    const d7 = new GameClock(7, 0);
    expect(d7.weekday).toBe(6);
    expect(new GameClock(8, 0).weekday).toBe(0);
  });

  it('dispara eventos a cada hora cheia', () => {
    const c = new GameClock(1, 6 * 60 + 50);
    const hours: number[] = [];
    c.onHour((h) => hours.push(h));
    c.speed = 3;
    c.tick(15); // 150 minutos
    expect(hours).toEqual([7, 8, 9]);
  });
});

describe('Needs', () => {
  const full = { hunger: 100, energy: 100, hygiene: 100, fun: 100, social: 100 };

  it('decaem pela taxa base por hora de jogo', () => {
    const n = new Needs(full);
    n.update(2);
    expect(n.values.hunger).toBeCloseTo(100 + BASE_RATES.hunger * 2);
    expect(n.values.energy).toBeCloseTo(100 + BASE_RATES.energy * 2);
  });

  it('atividades somam efeitos ao decaimento e ficam entre 0 e 100', () => {
    const n = new Needs({ ...full, energy: 10, hunger: 5 });
    n.update(1, { energy: 17 });
    expect(n.values.energy).toBeCloseTo(10 + BASE_RATES.energy + 17);
    n.update(10);
    expect(n.values.hunger).toBe(0);
    n.update(10, { fun: 1000 });
    expect(n.values.fun).toBe(100);
  });

  it('avisa uma única vez quando uma necessidade fica muito baixa', () => {
    const n = new Needs({ ...full, hunger: 20 });
    const low: string[] = [];
    n.onLow = (id) => low.push(id);
    n.update(1); // 14
    n.update(0.5); // 11
    expect(low).toEqual(['hunger']);
  });

  it('humor reflete as necessidades', () => {
    expect(new Needs(full).mood).toBeGreaterThan(95);
    const bad = new Needs({ hunger: 5, energy: 5, hygiene: 10, fun: 10, social: 10 });
    expect(bad.mood).toBeLessThan(10);
    expect(moodLabel(bad.mood)).toBe('Péssimo');
    expect(moodLabel(90)).toBe('Radiante');
  });
});
