/**
 * Raiz da interface: cria o jogo e sobrepõe telas/HUD conforme a fase.
 */
import { useEffect, useRef, useState } from 'react';
import { Game } from '../game/Game';
import { gameStore, useGame } from '../game/state/store';
import { LoadingScreen } from './screens/LoadingScreen';
import { TitleScreen } from './screens/TitleScreen';
import { Hud } from './hud/Hud';
import { PauseMenu } from './menus/PauseMenu';
import { SettingsMenu } from './menus/SettingsMenu';
import { ControlsMenu } from './menus/ControlsMenu';

export default function App() {
  const hostRef = useRef<HTMLDivElement>(null);
  const [game, setGame] = useState<Game | null>(null);
  const phase = useGame((s) => s.phase);
  const menu = useGame((s) => s.menu);
  const uiScale = useGame((s) => s.settings.uiScale);

  useEffect(() => {
    let disposed = false;
    let instance: Game | null = null;
    Game.create(hostRef.current!, (progress, label) => gameStore.setState({ loading: { progress, label } }))
      .then((g) => {
        if (disposed) {
          g.dispose();
          return;
        }
        instance = g;
        setGame(g);
        g.start();
        gameStore.setState({ phase: 'title' });
        if (new URLSearchParams(location.search).has('autoplay')) g.enterPlay();
      })
      .catch((err: unknown) => {
        console.error(err);
        gameStore.setState({ phase: 'error', error: err instanceof Error ? err.message : String(err) });
      });
    return () => {
      disposed = true;
      instance?.dispose();
    };
  }, []);

  return (
    <div className="app" style={{ ['--ui-scale' as string]: uiScale }}>
      <div ref={hostRef} className="game-host" onClick={() => {
        const st = gameStore.getState();
        if (game && st.phase === 'playing' && st.menu === 'none' && !st.pointerLocked) game.input.requestPointerLock();
      }} />
      {phase === 'loading' && <LoadingScreen />}
      {phase === 'error' && <ErrorScreen />}
      {phase === 'title' && game && <TitleScreen onPlay={() => game.enterPlay()} />}
      {phase === 'playing' && game && (
        <>
          <Hud game={game} />
          {menu === 'pause' && <PauseMenu game={game} />}
          {menu === 'settings' && <SettingsMenu />}
          {menu === 'controls' && <ControlsMenu />}
        </>
      )}
    </div>
  );
}

function ErrorScreen() {
  const error = useGame((s) => s.error);
  return (
    <div className="screen screen--error">
      <div className="panel error-panel">
        <h2>Não foi possível iniciar o jogo</h2>
        <p>{error}</p>
        <p className="muted">Verifique se o navegador tem WebGL 2 habilitado e recarregue a página.</p>
        <button className="btn btn--primary" onClick={() => location.reload()}>Recarregar</button>
      </div>
    </div>
  );
}
