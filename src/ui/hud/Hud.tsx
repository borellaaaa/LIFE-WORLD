/**
 * HUD do jogo: cartão do personagem, relógio, necessidades, prompt de
 * interação, atividade atual, local e notificações.
 */
import type { ReactElement } from 'react';
import type { Game } from '../../game/Game';
import { useGame, NEED_IDS, type NeedId } from '../../game/state/store';
import { GameClock, WEEKDAYS } from '../../game/sim/GameClock';
import { NEED_LABELS, moodLabel } from '../../game/sim/Needs';
import {
  IconHunger, IconEnergy, IconHygiene, IconFun, IconSocial, IconCoin, IconPause, IconPlay, IconFast, IconUltra,
  IconPin, IconSun, IconMoon, ActivityIcons, IconGear,
} from '../icons';
import { setMenu } from '../../game/state/store';

const NEED_ICONS: Record<NeedId, (p: { size?: number }) => ReactElement> = {
  hunger: IconHunger, energy: IconEnergy, hygiene: IconHygiene, fun: IconFun, social: IconSocial,
};

const fmtMoney = (v: number) => Math.floor(v).toLocaleString('pt-BR');

export function Hud({ game }: { game: Game }) {
  return (
    <div className="hud">
      <div className="hud__top">
        <PlayerCard />
        <LocationChip />
        <ClockWidget game={game} />
      </div>
      <Toasts />
      <ActivityBar />
      <div className="hud__bottom">
        <NeedsPanel />
        <InteractionPrompt />
        <div className="hud__bottom-right">
          <button className="icon-btn" title="Menu (Esc)" onClick={() => setMenu('pause')}><IconGear size={20} /></button>
        </div>
      </div>
      <PointerHint />
      <FpsCounter />
    </div>
  );
}

function PlayerCard() {
  const name = useGame((s) => s.playerName);
  const money = useGame((s) => s.money);
  const mood = useGame((s) => s.mood);
  const tone = mood >= 62 ? 'good' : mood >= 35 ? 'mid' : 'bad';
  return (
    <div className="panel player-card">
      <div className={`player-card__avatar player-card__avatar--${tone}`}>
        <span>LM</span>
        <svg viewBox="0 0 44 44" className="player-card__ring" aria-hidden="true">
          <circle cx="22" cy="22" r="20" pathLength={100} strokeDasharray={`${mood} 100`} />
        </svg>
      </div>
      <div className="player-card__info">
        <div className="player-card__name">{name}</div>
        <div className={`player-card__mood player-card__mood--${tone}`}>{moodLabel(mood)}</div>
      </div>
      <div className="money-pill" title="Dinheiro">
        <IconCoin size={16} />
        <span>$ {fmtMoney(money)}</span>
      </div>
    </div>
  );
}

function LocationChip() {
  const loc = useGame((s) => s.location);
  return (
    <div className="location-chip">
      <IconPin size={14} />
      <span>{loc}</span>
    </div>
  );
}

function ClockWidget({ game }: { game: Game }) {
  const c = useGame((s) => s.clock);
  const hour = c.minutes / 60;
  const night = hour < 6 || hour >= 18.5;
  const speeds = [
    { i: 0, Icon: IconPause, label: 'Pausar (0)' },
    { i: 1, Icon: IconPlay, label: 'Normal (1)' },
    { i: 2, Icon: IconFast, label: 'Rápido (2)' },
    { i: 3, Icon: IconUltra, label: 'Ultra (3)' },
  ];
  return (
    <div className="panel clock">
      <div className="clock__main">
        <span className={`clock__sky ${night ? 'clock__sky--night' : ''}`}>{night ? <IconMoon size={18} /> : <IconSun size={18} />}</span>
        <span className="clock__time">{GameClock.format(c.minutes)}</span>
      </div>
      <div className="clock__date">{WEEKDAYS[c.weekday]} • Dia {c.day}</div>
      <div className="clock__speeds">
        {speeds.map(({ i, Icon, label }) => (
          <button key={i} className={`speed-btn ${c.speed === i ? 'speed-btn--on' : ''}`} title={label} onClick={() => game.setSpeed(i)}>
            <Icon size={13} />
          </button>
        ))}
      </div>
    </div>
  );
}

function NeedsPanel() {
  const needs = useGame((s) => s.needs);
  return (
    <div className="panel needs">
      <div className="needs__title">Necessidades</div>
      {NEED_IDS.map((id) => {
        const v = needs[id];
        const Icon = NEED_ICONS[id];
        const tone = v >= 60 ? 'good' : v >= 30 ? 'mid' : 'bad';
        return (
          <div key={id} className={`need need--${tone}`}>
            <span className="need__icon"><Icon size={16} /></span>
            <span className="need__label">{NEED_LABELS[id]}</span>
            <div className="need__bar"><div className="need__fill" style={{ width: `${v}%` }} /></div>
          </div>
        );
      })}
    </div>
  );
}

function InteractionPrompt() {
  const prompt = useGame((s) => s.prompt);
  const activity = useGame((s) => s.activity);
  if (!prompt || activity) return <div className="prompt-slot" />;
  return (
    <div className="prompt-slot">
      <div className="panel prompt">
        <div className="prompt__title">{prompt.title}</div>
        {prompt.actions.map((a) => (
          <div key={a.key} className={`prompt__action ${a.disabled ? 'prompt__action--disabled' : ''}`}>
            <kbd className="keycap">{a.key}</kbd>
            <span className="prompt__label">{a.label}</span>
            {a.hint && <span className="prompt__hint">{a.hint}</span>}
          </div>
        ))}
      </div>
    </div>
  );
}

function ActivityBar() {
  const a = useGame((s) => s.activity);
  if (!a) return null;
  const Icon = ActivityIcons[a.icon] ?? IconPlay;
  return (
    <div className="activity">
      <div className="panel activity__panel">
        <span className="activity__icon"><Icon size={20} /></span>
        <div className="activity__body">
          <div className="activity__label">{a.label}</div>
          {a.progress !== null && (
            <div className="activity__bar"><div className="activity__fill" style={{ width: `${a.progress * 100}%` }} /></div>
          )}
        </div>
        <div className="activity__hint"><kbd className="keycap keycap--sm">WASD</kbd> parar</div>
      </div>
    </div>
  );
}

function Toasts() {
  const toasts = useGame((s) => s.toasts);
  return (
    <div className="toasts" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`toast toast--${t.kind}`}>{t.text}</div>
      ))}
    </div>
  );
}

function PointerHint() {
  const locked = useGame((s) => s.pointerLocked);
  if (locked || new URLSearchParams(location.search).has('capture')) return null;
  return <div className="pointer-hint">Clique na tela para controlar a câmera com o mouse (ou arraste)</div>;
}

function FpsCounter() {
  const show = useGame((s) => s.settings.showFps);
  const fps = useGame((s) => s.fps);
  if (!show) return null;
  return <div className="fps">{fps} FPS</div>;
}
