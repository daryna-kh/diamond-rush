export const FIRE_SPITTER_FRAME_COUNT = 13;
export const FIRE_SPITTER_FRAME_MS = 150;
export const FIRE_SPITTER_EFFECT_DURATION =
  FIRE_SPITTER_FRAME_COUNT * FIRE_SPITTER_FRAME_MS;

const FIRE_SPITTER_DISTANCES = [1, 2, 3];

function createFireSpitterEffect(spitter, now) {
  const distance = FIRE_SPITTER_DISTANCES[spitter.fireDistanceIndex || 0];
  const directionX = spitter.fireDirectionX || -1;
  const direction = directionX > 0 ? "right" : "left";
  const originX = spitter.x + directionX;
  const originY = spitter.y;
  const targetX = spitter.x + directionX * distance;
  const targetY = spitter.y;
  spitter.fireDistanceIndex =
    ((spitter.fireDistanceIndex || 0) + 1) % FIRE_SPITTER_DISTANCES.length;

  return {
    id: `fire-spitter:${spitter.id}:${now}:${direction}:${distance}`,
    type: "fire-spitter-flame",
    sourceId: spitter.id,
    sourceType: spitter.type,
    x: originX,
    y: originY,
    originX,
    originY,
    targetX,
    targetY,
    direction,
    directionX,
    distance,
    active: true,
    startedAt: now,
    frameMs: FIRE_SPITTER_FRAME_MS,
    frameCount: FIRE_SPITTER_FRAME_COUNT,
    atlas: "objects",
    framePrefix: "gen1.f#0",
    palette: 0,
    sprite: null,
  };
}

function isEffectActive(effect, now) {
  return effect.active && now - effect.startedAt < FIRE_SPITTER_EFFECT_DURATION;
}

export function applyFireSpitters(levelState, now) {
  const emitted = [];

  for (const effect of levelState.effects) {
    if (effect.type === "fire-spitter-flame" && !isEffectActive(effect, now)) {
      effect.active = false;
    }
  }

  for (const spitter of levelState.fireSpitters) {
    if (!spitter.active) continue;
    const hasActiveEffect = levelState.effects.some(
      (effect) => effect.sourceId === spitter.id && isEffectActive(effect, now),
    );
    if (hasActiveEffect) continue;

    const effect = createFireSpitterEffect(spitter, now);
    levelState.effects.push(effect);
    emitted.push(effect);
  }

  return emitted;
}
