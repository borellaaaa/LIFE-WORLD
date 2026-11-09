import { useGame } from '../../game/state/store';
import { Logo } from './Logo';

export function LoadingScreen() {
  const { progress, label } = useGame((s) => s.loading);
  return (
    <div className="screen screen--loading">
      <div className="loading">
        <Logo />
        <div className="loading__bar" role="progressbar" aria-valuenow={Math.round(progress * 100)} aria-valuemin={0} aria-valuemax={100}>
          <div className="loading__fill" style={{ width: `${Math.max(3, progress * 100)}%` }} />
        </div>
        <div className="loading__label">{label}</div>
      </div>
      <div className="screen__footer">Alpha 0.1 • Protótipo jogável</div>
    </div>
  );
}
