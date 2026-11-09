import { Logo } from './Logo';
import { useGame } from '../../game/state/store';

export function TitleScreen({ onPlay }: { onPlay: () => void }) {
  const name = useGame((s) => s.playerName);
  return (
    <div className="screen screen--title">
      <div className="title">
        <Logo />
        <p className="title__tagline">Uma vida inteira para viver, uma rua inteira para explorar.</p>
        <div className="title__card">
          <div className="title__avatar">LM</div>
          <div>
            <div className="title__name">{name}</div>
            <div className="title__meta">Rua das Acácias, 120 • Segunda-feira, 08:30</div>
          </div>
        </div>
        <button className="btn btn--primary btn--xl" onClick={onPlay} autoFocus>Jogar</button>
        <div className="title__keys">
          <span><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> andar</span>
          <span><kbd>Shift</kbd> correr</span>
          <span><kbd>Mouse</kbd> câmera</span>
          <span><kbd>E</kbd> interagir</span>
          <span><kbd>Esc</kbd> pausa</span>
        </div>
      </div>
      <div className="screen__footer">LIFE WORLD 3D • Alpha 0.1</div>
    </div>
  );
}
