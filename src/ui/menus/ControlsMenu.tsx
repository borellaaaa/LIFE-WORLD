import { setMenu } from '../../game/state/store';

const ROWS: [string[], string][] = [
  [['W', 'A', 'S', 'D'], 'Andar (setas também funcionam)'],
  [['Shift'], 'Correr (segurar)'],
  [['Mouse'], 'Girar a câmera (clique na tela para travar o cursor)'],
  [['Roda'], 'Aproximar / afastar a câmera'],
  [['E'], 'Interagir / ação principal'],
  [['F'], 'Ação secundária (quando houver)'],
  [['W', 'A', 'S', 'D'], 'Parar a atividade atual'],
  [['1', '2', '3'], 'Velocidade do tempo'],
  [['0'], 'Pausar / retomar o tempo'],
  [['Esc'], 'Menu de pausa'],
  [['F3'], 'Mostrar FPS'],
];

export function ControlsMenu() {
  return (
    <div className="screen screen--menu">
      <div className="panel menu menu--wide">
        <h2 className="menu__title">Controles</h2>
        <div className="controls">
          {ROWS.map(([keys, label], i) => (
            <div key={i} className="controls__row">
              <span className="controls__keys">{keys.map((k) => <kbd key={k} className="keycap">{k}</kbd>)}</span>
              <span>{label}</span>
            </div>
          ))}
        </div>
        <div className="menu__row">
          <button className="btn btn--primary" onClick={() => setMenu('pause')} autoFocus>Voltar</button>
        </div>
      </div>
    </div>
  );
}
