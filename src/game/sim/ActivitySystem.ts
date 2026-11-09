/**
 * Executa a atividade atual: posiciona o personagem na âncora, toca a pose,
 * aplica efeitos nas necessidades/dinheiro e encerra por duração,
 * necessidade cheia ou cancelamento (movimento/E/Esc).
 */
import type { ActivityDef } from './activities';
import type { Needs } from './Needs';
import type { GameClock } from './GameClock';
import type { PlayerController } from '../player/PlayerController';
import type { CharacterModel } from '../player/CharacterModel';
import { gameStore, pushToast } from '../state/store';

export class ActivitySystem {
  current: ActivityDef | null = null;
  private elapsedMin = 0;
  private earned = 0;
  private exitPending = 0;
  onMoneyChange?: (delta: number) => void;

  constructor(
    private player: PlayerController,
    private model: CharacterModel,
    private needs: Needs,
    private clock: GameClock,
  ) {}

  get busy() {
    return this.current !== null;
  }

  start(def: ActivityDef) {
    if (this.current) this.stop(false);
    const money = gameStore.getState().money;
    if (def.cost && money < def.cost) {
      pushToast('Dinheiro insuficiente.', 'warn');
      return;
    }
    if (def.cost) {
      this.onMoneyChange?.(-def.cost);
      pushToast(`-$${def.cost}`, 'money', 2500);
    }
    this.current = def;
    this.elapsedMin = 0;
    this.earned = 0;
    this.player.locked = true;
    this.player.velocity.set(0, 0, 0);
    this.player.setVisualAnchor(def.anchor);
    this.model.setPose(def.pose);
    this.clock.boost = def.timeScale ?? 1;
    def.onStart?.();
    if (def.startText) pushToast(def.startText, 'info');
    this.publish();
  }

  /** encerra a atividade; `completed` indica término natural */
  stop(completed: boolean) {
    const def = this.current;
    if (!def) return;
    this.current = null;
    this.clock.boost = 1;
    this.model.setPose(null);
    if (def.exit) this.player.teleport(def.exit);
    this.player.setVisualAnchor(null);
    // pequeno atraso para não "andar" no mesmo quadro em que levanta
    this.exitPending = 0.25;
    def.onEnd?.();
    if (completed && def.endText) pushToast(def.endText, 'good');
    if (this.earned >= 1) pushToast(`+$${Math.floor(this.earned)} ganhos`, 'money');
    gameStore.setState({ activity: null });
  }

  /** @param gameMinutes minutos de jogo avançados neste quadro */
  update(dt: number, gameMinutes: number, wantsCancel: boolean) {
    if (this.exitPending > 0) {
      this.exitPending -= dt;
      if (this.exitPending <= 0) this.player.locked = false;
    }
    const def = this.current;
    if (!def) {
      this.needs.update(gameMinutes / 60);
      return;
    }
    if (wantsCancel) {
      this.stop(false);
      this.needs.update(gameMinutes / 60);
      return;
    }
    this.needs.update(gameMinutes / 60, def.effects);
    this.elapsedMin += gameMinutes;
    if (def.moneyPerHour) {
      const delta = (def.moneyPerHour * gameMinutes) / 60;
      this.earned += delta;
      this.onMoneyChange?.(delta);
    }
    const doneByTime = def.durationMin !== undefined && this.elapsedMin >= def.durationMin;
    const doneByNeed = def.stopWhenFull !== undefined && this.needs.isFull(def.stopWhenFull);
    if (doneByTime || doneByNeed) this.stop(true);
    else this.publish();
  }

  private publish() {
    const def = this.current;
    if (!def) return;
    let progress: number | null = null;
    if (def.durationMin) progress = Math.min(1, this.elapsedMin / def.durationMin);
    else if (def.stopWhenFull) progress = this.needs.values[def.stopWhenFull] / 100;
    const prev = gameStore.getState().activity;
    if (!prev || prev.label !== def.label || Math.abs((prev.progress ?? -1) - (progress ?? -1)) > 0.004) {
      gameStore.setState({ activity: { label: def.label, icon: def.icon, progress } });
    }
  }
}
