const ATLAS_DEFS = {
  objects: {
    imagePath: "assets/atlases/objects.png",
    jsonPath: "assets/atlases/objects.json",
  },
  ui: {
    imagePath: "assets/atlases/ui.png",
    jsonPath: "assets/atlases/ui.json",
  },
};

const HUD_ICONS = {
  health: {
    normal: {
      left: { atlas: "ui", frameId: "ui.f#2:module:11:palette:0" },
      empty: { atlas: "ui", frameId: "ui.f#2:module:13:palette:0" },
      filled: { atlas: "ui", frameId: "ui.f#2:module:15:palette:0" },
      right: { atlas: "ui", frameId: "ui.f#2:module:17:palette:0" },
    },
    low: {
      left: { atlas: "ui", frameId: "ui.f#2:module:12:palette:0" },
      empty: { atlas: "ui", frameId: "ui.f#2:module:14:palette:0" },
      filled: { atlas: "ui", frameId: "ui.f#2:module:16:palette:0" },
      right: { atlas: "ui", frameId: "ui.f#2:module:18:palette:0" },
    },
  },
  lives: { atlas: "objects", frameId: "cm.f#4:module:0:palette:0" },
  diamonds: { atlas: "objects", frameId: "cm.f#2:frame:0:palette:0" },
  required: { atlas: "objects", frameId: "cm.f#5:frame:0:palette:0" },
};
const HEALTH_SEGMENTS = 4;

function publicAssetUrl(path) {
  return `${import.meta.env.BASE_URL}${path.replace(/^\/+/, "")}`;
}

async function loadAtlas(atlasId) {
  const atlas = ATLAS_DEFS[atlasId];
  const response = await fetch(publicAssetUrl(atlas.jsonPath));
  if (!response.ok)
    throw new Error(`Failed to load ${atlas.jsonPath}: ${response.status}`);
  const data = await response.json();
  return {
    ...data,
    imageUrl: publicAssetUrl(atlas.imagePath),
  };
}

async function loadHudAtlases() {
  const entries = await Promise.all(
    Object.keys(ATLAS_DEFS).map(async (atlasId) => [
      atlasId,
      await loadAtlas(atlasId),
    ]),
  );
  return Object.fromEntries(entries);
}

function findFrame(atlases, iconDef) {
  return atlases?.[iconDef.atlas]?.frames.find(
    (frame) => frame.id === iconDef.frameId,
  );
}

function setIconFrame(icon, atlases, iconDef) {
  const atlas = atlases?.[iconDef.atlas];
  const frame = findFrame(atlases, iconDef);
  if (!atlas || !frame) return;

  icon.style.width = `${frame.width}px`;
  icon.style.height = `${frame.height}px`;
  icon.style.backgroundImage = `url("${atlas.imageUrl}")`;
  icon.style.backgroundSize = `${atlas.width}px ${atlas.height}px`;
  icon.style.backgroundPosition = `-${frame.x}px -${frame.y}px`;
}

function createIcon(className, label) {
  const icon = document.createElement("span");
  icon.className = `game-hud__icon ${className}`;
  icon.setAttribute("aria-label", label);
  icon.role = "img";
  return icon;
}

function createValueGroup(className, label, iconLabel) {
  const group = document.createElement("div");
  group.className = `game-hud__group ${className}`;

  const icon = createIcon(`${className}-icon`, iconLabel);
  const value = document.createElement("span");
  value.className = "game-hud__value";
  value.textContent = "-";

  group.append(icon, value);
  group.setAttribute("aria-label", label);
  return { group, icon, value };
}

function createHealthGroup() {
  const group = document.createElement("div");
  group.className = "game-hud__group game-hud__health";
  group.setAttribute("aria-label", "Health");
  return group;
}

function getRequiredDiamonds(levelState) {
  const requirements = (levelState?.gemLocks || [])
    .map((lock) => lock.requiredDiamonds)
    .filter(Number.isFinite);
  if (requirements.length === 0) return null;
  return Math.max(...requirements);
}

function renderHealth(group, levelState, atlases) {
  const health = levelState?.player?.health ?? 0;
  const maxHealth = Math.max(0, levelState?.player?.maxHealth ?? HEALTH_SEGMENTS);
  const visibleSegments = Math.max(HEALTH_SEGMENTS, maxHealth);
  const iconSet =
    health === 1 && maxHealth === HEALTH_SEGMENTS
      ? HUD_ICONS.health.low
      : HUD_ICONS.health.normal;
  group.replaceChildren();

  const left = createIcon("game-hud__health-cap", "Health left frame");
  setIconFrame(left, atlases, iconSet.left);
  group.appendChild(left);

  for (let index = 0; index < visibleSegments; index += 1) {
    const filled = index < health;
    const icon = createIcon(
      filled ? "game-hud__health-segment-filled" : "game-hud__health-segment-empty",
      filled ? "Health segment filled" : "Health segment empty",
    );
    setIconFrame(
      icon,
      atlases,
      filled ? iconSet.filled : iconSet.empty,
    );
    group.appendChild(icon);
  }

  const right = createIcon("game-hud__health-cap", "Health right frame");
  setIconFrame(right, atlases, iconSet.right);
  group.appendChild(right);
}

function renderHud(parts, stageRoot, atlases) {
  const levelState = stageRoot?.levelState;
  const collectedDiamonds = levelState?.collectedDiamonds ?? 0;
  const totalDiamonds = levelState?.collectibles?.length ?? 0;
  const requiredDiamonds = getRequiredDiamonds(levelState);
  const lives = levelState?.player?.lives ?? 0;

  renderHealth(parts.health, levelState, atlases);
  parts.lives.value.textContent = String(lives);
  parts.diamonds.value.textContent = `${collectedDiamonds}/${totalDiamonds}`;
  parts.required.value.textContent =
    requiredDiamonds === null ? "-" : String(requiredDiamonds);
  parts.gameOver.hidden = !levelState?.player?.gameOver;
}

export function createGameHud(stageRoot) {
  const hud = document.createElement("div");
  hud.className = "game-hud";

  const health = createHealthGroup();
  const lives = createValueGroup("game-hud__lives", "Lives", "Lives");
  const diamonds = createValueGroup(
    "game-hud__diamonds",
    "Diamonds",
    "Diamonds",
  );
  const required = createValueGroup(
    "game-hud__required",
    "Required diamonds",
    "Required diamonds",
  );
  const gameOver = document.createElement("div");
  gameOver.className = "game-hud__game-over";
  gameOver.textContent = "GAME OVER";
  gameOver.hidden = true;

  hud.append(health, lives.group, diamonds.group, required.group, gameOver);
  document.body.appendChild(hud);

  const parts = {
    health,
    lives,
    diamonds,
    required,
    gameOver,
  };
  let currentStageRoot = stageRoot;
  let atlases = null;

  loadHudAtlases()
    .then((loadedAtlases) => {
      atlases = loadedAtlases;
      setIconFrame(lives.icon, atlases, HUD_ICONS.lives);
      setIconFrame(diamonds.icon, atlases, HUD_ICONS.diamonds);
      setIconFrame(required.icon, atlases, HUD_ICONS.required);
      renderHud(parts, currentStageRoot, atlases);
    })
    .catch((error) => {
      console.warn("Game HUD icons are unavailable.", error);
    });

  renderHud(parts, currentStageRoot, atlases);

  return {
    element: hud,
    updateScene(nextStageRoot) {
      currentStageRoot = nextStageRoot;
      renderHud(parts, currentStageRoot, atlases);
    },
  };
}
