export const CHEST_BROWN_REWARD_PLAYER_FRAME_INDEXES = [
  131,
  132,
  133,
  134,
  135,
  136,
  137,
  138,
  139,
  140,
  17,
  18,
  19,
];

export const CHEST_BROWN_REWARD_LOOP_FRAME_INDEXES = [20, 21, 22, 23, 24];
export const CHEST_BROWN_REWARD_FRAME_MS = 180;
export const CHEST_BROWN_REWARD_LOOP_DURATION_MS = 3000;
export const CHEST_BROWN_REWARD_GEM_FRAME_INDEXES = CHEST_BROWN_REWARD_LOOP_FRAME_INDEXES;
export const CHEST_BROWN_REWARD_GEM_FRAME_ID = "cm.f#2:module:0:palette:1";

export function getChestBrownRewardDurationMs(frameMs = CHEST_BROWN_REWARD_FRAME_MS) {
  return (
    CHEST_BROWN_REWARD_PLAYER_FRAME_INDEXES.length * frameMs +
    CHEST_BROWN_REWARD_LOOP_DURATION_MS
  );
}

export const DIAMOND_COLLECT_PLAYER_FRAME_PREFIX = "cm.f#7";
export const DIAMOND_COLLECT_PLAYER_FRAME_INDEXES = [
  30,
  31,
  32,
  33,
  34,
  35,
  36,
  37,
  38,
  39,
];
export const DIAMOND_COLLECT_FRAME_MS = 80;

export function getDiamondCollectDurationMs(
  frameMs = DIAMOND_COLLECT_FRAME_MS,
) {
  return DIAMOND_COLLECT_PLAYER_FRAME_INDEXES.length * frameMs;
}

export const PLAYER_DAMAGE_FRAME_INDEXES = [6, 7, 8, 9];
export const PLAYER_DAMAGE_FRAME_MS = 120;

export function getPlayerDamageDurationMs(
  frameMs = PLAYER_DAMAGE_FRAME_MS,
) {
  return PLAYER_DAMAGE_FRAME_INDEXES.length * frameMs;
}

export const PLAYER_FIRE_DAMAGE_FRAME_PREFIX = "o.f#1";
export const PLAYER_FIRE_DAMAGE_FRAME_INDEXES = [0, 1, 2, 3];
export const PLAYER_FIRE_DEATH_FRAME_INDEXES = [0, 1, 2, 3, 4, 5];
