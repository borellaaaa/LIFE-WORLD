import type { Game } from '../../game/Game';
import { gameStore, setMenu } from '../../game/state/store';
import { Logo } from '../screens/Logo';

export function PauseMenu({ game }: { game: Game }) {
  return (
    <div className="screen screen--menu" onClick={(e) => e.target === e.currentTarget && game.resume()}>
      <div className="panel menu">
        <Logo compact />
        <h2 className="menu__title">Jogo pausado</h2>
        <div className="menu__buttons">
          <button className="btn btn--primary" onClick={() => game.resume()} autoFocus>Continuar</button>
          <button className="btn" onClick={() => setMenu('settings')}>Configurações</button>
          <button className="btn" onClick={() => setMenu('controls')}>Controles</button>
          <button className="btn btn--ghost" onClick={() => {
            gameStore.setState({ phase: 'title', menu: 'none' });
            game.input.exitPointerLock();
          }}>Voltar ao título</button>
        </div>
        <p className="menu__note">O tempo do jogo fica parado enquanto este menu está aberto.</p>
      </div>
    </div>
  );
}
