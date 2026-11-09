# Arquitetura — LIFE WORLD 3D

Documento técnico para quem for continuar o desenvolvimento. Descreve os módulos, o fluxo de um
quadro, as convenções e como estender o jogo sem quebrar o que existe.

## Visão geral

```
React (src/ui)  ◄──── leitura ────  gameStore (zustand)  ◄──── escrita (~8 Hz) ────  Game (src/game)
     │                                     ▲                                          │
     └── ações (botões, menus) ────────────┘                                          │
                                                                                      ▼
                       Engine (Three.js) · Physics (Rapier) · Player · Camera · Interaction · Sim · World
```

- O **motor** (Three.js + Rapier) não depende do React. A UI só lê a `gameStore` e chama métodos
  públicos do `Game` (`enterPlay`, `resume`, `setSpeed`).
- A **store** (`src/game/state/store.ts`) é o contrato entre os dois mundos: fase, menus, relógio,
  necessidades, dinheiro, prompt de interação, atividade atual, notificações e configurações.
- As **configurações** são persistidas em `localStorage` (`lifeworld3d.settings.v1`).

## Ordem de um quadro (`Game.frame`)

1. Mouse → rotação/zoom da câmera (`ThirdPersonCamera.rotate/zoom`).
2. Relógio avança (`GameClock.tick`) — parado quando há menu aberto.
3. Atividades e necessidades (`ActivitySystem.update` → `Needs.update`).
4. Jogador: entrada → velocidade → `KinematicCharacterController` do Rapier (`PlayerController.update`).
5. Portas atualizam seus corpos cinemáticos (`Door.update`).
6. Passo da física (`world.step`).
7. Detecção "dentro de casa" → esconde telhado/forro (camada `LAYER_ROOF`) e troca o IBL.
8. Câmera segue o modelo com colisão (`sphereCast`).
9. Interação: escolhe o objeto em foco e publica o prompt (`InteractionSystem.update`).
10. Dia/noite (`DayNight.update`), efeitos da casa (TV, PC, chuveiro), grama por distância.
11. Render e envio de estado à UI (a cada 125 ms).

## Módulos

| Pasta | Responsabilidade |
| --- | --- |
| `core/Engine.ts` | `WebGLRenderer` (ACES, sRGB, sombras PCF suaves), cena, câmera, resize, qualidade |
| `core/Input.ts` | Teclado por `KeyboardEvent.code` (funciona em ABNT2), mouse com pointer lock ou arrastar, `simulate()` para testes |
| `physics/Physics.ts` | Mundo Rapier, colisores estáticos/cinemáticos, `raycast`, `sphereCast`, grupos de colisão |
| `player/CharacterModel.ts` | Carrega o GLB, melhora materiais, mistura `Idle/Walk/Run` por velocidade e entra/sai de poses de atividade |
| `player/PlayerController.ts` | Cilindro de colisão + KCC: gravidade, degraus, rampas, deslizamento em paredes, giro para a direção do movimento, posição visual separada (âncoras de atividade) |
| `player/ThirdPersonCamera.ts` | Órbita, zoom, ombro, suavização e colisão |
| `interaction/` | `Interactable` (contrato), `InteractionSystem` (foco + teclas E/F), `Door` (porta articulada com corpo cinemático) |
| `sim/` | `GameClock`, `Needs` (decaimento + humor), `ActivitySystem` (executa `ActivityDef`), `activities.ts` (tipos) |
| `world/textures.ts` | Texturas procedurais tileáveis (cor + normal + rugosidade) em canvas |
| `world/materials.ts` | Biblioteca PBR com nomes estáveis |
| `world/geometry.ts` | `boxUV` (UV em escala de mundo) e `StaticBatcher` (funde peças estáticas por material) |
| `world/house/HouseBuilder.ts` | Paredes com aberturas, janelas, batentes, portas, pisos, forros, laje com platibanda |
| `world/house/PlayerHouse.ts` | Planta da casa, mobiliário, luzes e todas as interações |
| `world/house/NeighborHouse.ts` | Casas vizinhas procedurais (somente exterior) |
| `world/props/` | Móveis (`furniture.ts`) e mobiliário urbano (`street.ts`) |
| `world/vegetation.ts` | Árvores instanciadas (tronco + copa + cartões de folhas), arbustos, sebes e grama com vento |
| `world/DayNight.ts` | Céu atmosférico, sol/lua, IBL do céu (externo) e neutro (interno), neblina, estrelas, luzes noturnas |
| `world/Neighborhood.ts` | Monta o bairro e os limites do mapa |

## Convenções

- **Unidades**: metros e segundos. **Y para cima.** Rua ao longo de X em `z = 0`; lotes do norte em `z < 0`.
- **Alturas**: asfalto `y = 0`; calçadas e lotes `y = 0.12` (`LOT_Y`); piso interno da casa `y = 0.27`.
- **Frente** de um modelo/móvel = **+Z local**. `yaw` (rad) = rotação em Y; `yaw = 0` olha para +Z.
- **Personagem**: esqueleto com nomes Mixamo (`Hips`, `Spine`, `Spine1`, `Spine2`, `Neck`, `Head`,
  `LeftShoulder`, `LeftArm`, `LeftForeArm`, `LeftHand`, `LeftUpLeg`, `LeftLeg`, `LeftFoot`,
  `LeftToeBase` e equivalentes `Right*`). Clipes: `Idle`, `Walk`, `Run`, `Sit`, `SitUse`, `Sleep`,
  `Use` e `Phone`. Os metadados `userData.lifeWorld.locomotion` (velocidades naturais de walk/run)
  sincronizam a cadência dos passos.
- **Grupos de colisão** (`physics/Physics.ts`):

| Grupo | Bloqueia jogador | Bloqueia câmera | Exemplos |
| --- | --- | --- | --- |
| `WORLD` | sim | sim | chão, paredes, casas, limites do mapa |
| `PROPS` | sim | não | móveis, árvores, cercas, carros |
| `DOOR` | sim | sim | portas |
| `ROOF` | não | só do lado de fora | telhado, marquise |

## Como estender

### Novo objeto interativo
```ts
const fogueira: Interactable = {
  id: 'fogueira', name: 'Fogueira', position: new THREE.Vector3(x, y, z), radius: 1.8,
  actions: (ctx) => [{
    key: 'E', label: 'Aquecer-se', hint: 'Diversão',
    run: (c) => c.startActivity({
      id: 'warm', label: 'Aquecendo-se', icon: 'sofa', pose: 'Idle',
      anchor: { position: new THREE.Vector3(x, y, z + 1), yaw: Math.PI },
      durationMin: 30, effects: { fun: 20 },
    }),
  }],
};
game.interactions.register(fogueira);
```
- `effects` são variações **por hora de jogo**, somadas ao decaimento base de `sim/Needs.ts`.
- `stopWhenFull`, `durationMin`, `cost`, `moneyPerHour`, `timeScale`, `exit`, `onStart/onEnd` são opcionais.

### Novo móvel
Crie uma função em `world/props/furniture.ts` usando `Placer` (coordenadas locais do móvel, frente +Z):
`P.box(...)`, `P.cyl(...)`, `P.geo(...)` para geometria (agrupada automaticamente) e `P.collider(...)`
para colisão. Devolva âncoras com `P.place(fx, fz, yaw)`.

### Nova casa/cômodo
Use `HouseBuilder.wall({ a, b, matPos, matNeg, openings })`. A normal "positiva" de uma parede de `a`
para `b` aponta para a esquerda do sentido (para `a→b` em +X, `n = +Z`); `matPos` é o material desse lado.

## Depuração e testes

Com `npm run dev` (ou com `?debug` / `?capture` na URL) o jogo expõe `window.__lifeWorld`:

| Função | Uso |
| --- | --- |
| `teleport(x, z, yaw)` | move o jogador |
| `setTime(hora)` | muda o horário (ex.: `setTime(21.5)`) |
| `setCamera(yaw, pitch, dist)` | posiciona a câmera |
| `key(code, down)` | simula teclas (`'KeyW'`, `'KeyE'`, `'ShiftLeft'`...) |
| `simulate(segundos)` | avança a simulação de forma determinística (sem depender do FPS) |
| `state()` | posição, foco, atividade, portas, necessidades, dinheiro, relógio, draw calls |
| `stopLoop()/startLoop()/render()` | controle do loop para capturas |

Parâmetros de URL: `?autoplay` (pula o título), `?capture` (preserva o buffer de desenho e esconde dicas).

- `npm test` — unitários de `GameClock` e `Needs`.
- `npm run e2e` — 15 verificações de jogabilidade no Chromium (movimento, corrida, giro, gravidade,
  degraus, paredes, móveis, porta, prompt, geladeira, cama, decaimento, dia/noite, pausa).
- `viewer.html?clip=Walk&t=0.25&view=side` — visualizador do personagem (`view`: front, side, back, face, three).
