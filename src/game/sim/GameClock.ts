/**
 * Relógio do jogo. Em velocidade 1, 1 segundo real = 1 minuto de jogo
 * (um dia dura 24 minutos reais).
 */
export const WEEKDAYS = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo'];
export const WEEKDAYS_SHORT = ['SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB', 'DOM'];

/** minutos de jogo por segundo real em cada velocidade */
export const SPEEDS = [0, 1, 3, 10] as const;

export class GameClock {
  /** minutos desde o início (dia 1, segunda-feira, 00:00) */
  total: number;
  speed = 1; // índice em SPEEDS
  /** multiplicador temporário (ex.: dormindo) */
  boost = 1;
  private hourListeners: ((hour: number, day: number) => void)[] = [];

  constructor(startDay = 1, startMinutes = 8 * 60) {
    this.total = (startDay - 1) * 1440 + startMinutes;
  }

  get paused() {
    return this.speed === 0;
  }

  get rate() {
    return SPEEDS[this.speed] * (this.speed === 0 ? 0 : this.boost);
  }

  /** avança pelo tempo real `dt` (s); retorna minutos de jogo avançados */
  tick(dt: number): number {
    const before = this.total;
    this.total += dt * this.rate;
    const h0 = Math.floor(before / 60), h1 = Math.floor(this.total / 60);
    for (let h = h0 + 1; h <= h1; h++) this.hourListeners.forEach((fn) => fn(h % 24, Math.floor(h / 24) + 1));
    return this.total - before;
  }

  onHour(fn: (hour: number, day: number) => void) {
    this.hourListeners.push(fn);
  }

  get day() {
    return Math.floor(this.total / 1440) + 1;
  }

  /** 0 = segunda ... 6 = domingo */
  get weekday() {
    return (this.day - 1) % 7;
  }

  /** minutos desde 00:00 do dia atual */
  get minuteOfDay() {
    return this.total % 1440;
  }

  static format(minuteOfDay: number) {
    const m = Math.floor(minuteOfDay);
    const hh = Math.floor(m / 60) % 24;
    const mm = m % 60;
    return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
  }
}
