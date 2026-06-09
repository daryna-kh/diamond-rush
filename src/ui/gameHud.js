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
  lives: { atlas: "ui", frameId: "ui.f#2:module:19:palette:0" },
  gemRed: { atlas: "ui", frameId: "ui.f#2:module:24:palette:0" },
  gemViolet: { atlas: "ui", frameId: "ui.f#2:module:25:palette:0" },
  gemLock: { atlas: "objects", frameId: "cm.f#5:frame:0:palette:0" },
};
const HUD_DIGITS = Array.from({ length: 10 }, (_, index) => ({
  atlas: "ui",
  frameId: `ui.f#2:module:${index}:palette:0`,
}));
const HUD_SLASH = { atlas: "ui", frameId: "ui.f#2:module:10:palette:0" };
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

function createSpriteNumber(className) {
  const value = document.createElement("span");
  value.className = `game-hud__sprite-number ${className}`;
  return value;
}

function setSpriteNumber(value, number, atlases) {
  value.replaceChildren();
  if (!atlases) {
    value.textContent = String(number ?? "-");
    return;
  }

  const text = String(Math.max(0, Number(number) || 0));
  for (const char of text) {
    const digit = Number(char);
    const icon = createIcon("game-hud__digit", char);
    setIconFrame(icon, atlases, HUD_DIGITS[digit]);
    value.appendChild(icon);
  }
}

function setSpriteGemCounter(counter, collected, total, atlases) {
  counter.value.replaceChildren();
  if (!atlases) {
    counter.value.textContent = `${collected ?? 0}/${total ?? 0}`;
    return;
  }

  const parts = [
    ...String(Math.max(0, Number(collected) || 0)).split("").map((char) => ({
      type: "digit",
      value: Number(char),
      label: char,
    })),
    { type: "slash", label: "/" },
    ...String(Math.max(0, Number(total) || 0)).split("").map((char) => ({
      type: "digit",
      value: Number(char),
      label: char,
    })),
  ];

  for (const part of parts) {
    const icon = createIcon(
      part.type === "slash" ? "game-hud__digit game-hud__slash" : "game-hud__digit",
      part.label,
    );
    setIconFrame(
      icon,
      atlases,
      part.type === "slash" ? HUD_SLASH : HUD_DIGITS[part.value],
    );
    counter.value.appendChild(icon);
  }
}

function createHealthGroup() {
  const group = document.createElement("div");
  group.className = "game-hud__group game-hud__health";
  group.setAttribute("aria-label", "Health");
  return group;
}

function createLivesGroup() {
  const group = document.createElement("div");
  group.className = "game-hud__group game-hud__lives";
  group.setAttribute("aria-label", "Lives");

  const icon = createIcon("game-hud__lives-icon", "Lives");
  const value = createSpriteNumber("game-hud__lives-value");
  group.append(icon, value);
  return { group, icon, value };
}

function createGemCounter(className, label, iconLabel) {
  const group = document.createElement("div");
  group.className = `game-hud__group game-hud__gem-counter ${className}`;
  group.setAttribute("aria-label", label);

  const iconWrap = document.createElement("span");
  iconWrap.className = "game-hud__gem-icon-wrap";
  const icon = createIcon(`${className}-icon`, iconLabel);
  const value = createSpriteNumber("game-hud__gem-value");
  iconWrap.append(icon, value);
  group.append(iconWrap);
  return { group, icon, value };
}

function createGemLockCounter() {
  const group = document.createElement("div");
  group.className = "game-hud__group game-hud__gem-lock-counter";
  group.setAttribute("aria-label", "Required diamonds");

  const iconWrap = document.createElement("span");
  iconWrap.className = "game-hud__lock-icon-wrap";
  const icon = createIcon("game-hud__gem-lock-icon", "Required diamonds");
  const value = createSpriteNumber("game-hud__lock-value");
  iconWrap.append(icon, value);
  group.append(iconWrap);
  return { group, icon, value };
}

function getRequiredDiamonds(levelState) {
  return Math.max(
    0,
    ...(levelState?.gemLocks || []).map(
      (lock) => Number(lock.requiredDiamonds) || 0,
    ),
  );
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
  const lives = levelState?.player?.lives ?? 0;
  const collectedGems = levelState?.collectedGems || { violet: 0, red: 0 };
  const totalGems = levelState?.totalGems || { violet: 0, red: 0 };
  const requiredDiamonds = getRequiredDiamonds(levelState);

  renderHealth(parts.health, levelState, atlases);
  setSpriteNumber(parts.lives.value, lives, atlases);
  setSpriteNumber(parts.gemLock.value, requiredDiamonds, atlases);
  setSpriteGemCounter(
    parts.gemViolet,
    collectedGems.violet,
    totalGems.violet,
    atlases,
  );
  setSpriteGemCounter(
    parts.gemRed,
    collectedGems.red,
    totalGems.red,
    atlases,
  );
  parts.gameOver.hidden = !levelState?.player?.gameOver;
}

export function createGameHud(stageRoot) {
  const hud = document.createElement("div");
  hud.className = "game-hud";

  const health = createHealthGroup();
  const lives = createLivesGroup();
  const gemViolet = createGemCounter(
    "game-hud__gem-violet",
    "Violet diamonds",
    "Violet diamonds",
  );
  const gemRed = createGemCounter(
    "game-hud__gem-red",
    "Red diamonds",
    "Red diamonds",
  );
  const gemLock = createGemLockCounter();
  const gameOver = document.createElement("div");
  gameOver.className = "game-hud__game-over";
  gameOver.textContent = "GAME OVER";
  gameOver.hidden = true;

  hud.append(
    health,
    lives.group,
    gemViolet.group,
    gemRed.group,
    gemLock.group,
    gameOver,
  );
  document.body.appendChild(hud);

  const parts = {
    health,
    lives,
    gemViolet,
    gemRed,
    gemLock,
    gameOver,
  };
  let currentStageRoot = stageRoot;
  let atlases = null;

  loadHudAtlases()
    .then((loadedAtlases) => {
      atlases = loadedAtlases;
      setIconFrame(lives.icon, atlases, HUD_ICONS.lives);
      setIconFrame(gemViolet.icon, atlases, HUD_ICONS.gemViolet);
      setIconFrame(gemRed.icon, atlases, HUD_ICONS.gemRed);
      setIconFrame(gemLock.icon, atlases, HUD_ICONS.gemLock);
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
