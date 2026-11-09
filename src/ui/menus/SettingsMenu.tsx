import { useGame, updateSettings, setMenu } from '../../game/state/store';
import { applyPreset, DEFAULT_SETTINGS, type ShadowQuality, type GraphicsPreset } from '../../game/state/settings';

function Slider({ label, value, min, max, step, format, onChange }: {
  label: string; value: number; min: number; max: number; step: number; format: (v: number) => string; onChange: (v: number) => void;
}) {
  return (
    <label className="setting">
      <span className="setting__label">{label}</span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(parseFloat(e.target.value))} />
      <span className="setting__value">{format(value)}</span>
    </label>
  );
}

function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="setting setting--toggle">
      <span className="setting__label">{label}</span>
      <button type="button" className={`toggle ${value ? 'toggle--on' : ''}`} onClick={() => onChange(!value)} aria-pressed={value}>
        <span className="toggle__knob" />
      </button>
    </label>
  );
}

export function SettingsMenu() {
  const s = useGame((st) => st.settings);
  const pct = (v: number) => `${Math.round(v * 100)}%`;
  return (
    <div className="screen screen--menu">
      <div className="panel menu menu--wide">
        <h2 className="menu__title">Configurações</h2>
        <div className="settings">
          <section>
            <h3>Gráficos</h3>
            <div className="presets">
              {(['low', 'medium', 'high'] as GraphicsPreset[]).map((p) => (
                <button key={p} className="chip" onClick={() => updateSettings(applyPreset(p))}>
                  {p === 'low' ? 'Desempenho' : p === 'medium' ? 'Equilibrado' : 'Qualidade'}
                </button>
              ))}
            </div>
            <label className="setting">
              <span className="setting__label">Sombras</span>
              <select value={s.shadows} onChange={(e) => updateSettings({ shadows: e.target.value as ShadowQuality })}>
                <option value="off">Desligadas</option>
                <option value="low">Baixa</option>
                <option value="high">Alta</option>
              </select>
              <span className="setting__value" />
            </label>
            <Slider label="Resolução de render" value={s.renderScale} min={0.5} max={1} step={0.05} format={pct} onChange={(v) => updateSettings({ renderScale: v })} />
            <Slider label="Densidade da grama" value={s.grassDensity} min={0} max={1} step={0.05} format={pct} onChange={(v) => updateSettings({ grassDensity: v })} />
            <Slider label="Campo de visão" value={s.fov} min={50} max={85} step={1} format={(v) => `${v}°`} onChange={(v) => updateSettings({ fov: v })} />
          </section>
          <section>
            <h3>Controles e interface</h3>
            <Slider label="Sensibilidade do mouse" value={s.mouseSensitivity} min={0.2} max={3} step={0.05} format={(v) => v.toFixed(2)} onChange={(v) => updateSettings({ mouseSensitivity: v })} />
            <Toggle label="Inverter eixo Y" value={s.invertY} onChange={(v) => updateSettings({ invertY: v })} />
            <Slider label="Tamanho da interface" value={s.uiScale} min={0.85} max={1.2} step={0.05} format={pct} onChange={(v) => updateSettings({ uiScale: v })} />
            <Toggle label="Mostrar FPS (F3)" value={s.showFps} onChange={(v) => updateSettings({ showFps: v })} />
          </section>
        </div>
        <div className="menu__row">
          <button className="btn btn--ghost" onClick={() => updateSettings(DEFAULT_SETTINGS)}>Restaurar padrão</button>
          <button className="btn btn--primary" onClick={() => setMenu('pause')}>Voltar</button>
        </div>
      </div>
    </div>
  );
}
