const EMPTY_VALUE = 255;
const PLAYER_SPAWN_BLOCK = 79;
const DIAMOND_BLOCK = 1;
const BOULDER_BLOCK = 0;
const LEAF_BLOCK = 10;
const WALL_MIN = 80;
const WALL_MAX = 146;

const STATIC_PASSABLE_BLOCKS = new Set([
  EMPTY_VALUE,
  PLAYER_SPAWN_BLOCK,
  DIAMOND_BLOCK,
  BOULDER_BLOCK,
  LEAF_BLOCK,
]);

export function getRawCell(levelState, x, y) {
  const index = x + y * levelState.width;
  const blocks = levelState.rawStage.layers.player[index];
  const data = levelState.rawStage.layers.foreground[index];
  const specifying_data = levelState.rawStage.layers.background[index];
  return { x, y, blocks, data, specifying_data };
}

export function isWallValue(value) {
  return value >= WALL_MIN && value <= WALL_MAX;
}

export function isWallCell(cell) {
  return isWallValue(cell.blocks) || isWallValue(cell.data);
}

export function getTerrainType(cell) {
  if (cell.blocks === LEAF_BLOCK) return "passable";
  if (isWallCell(cell)) return "wall";
  if (STATIC_PASSABLE_BLOCKS.has(cell.blocks)) return "passable";
  return "static-blocker";
}

export function getStaticPassability(cell) {
  const terrainType = getTerrainType(cell);
  if (terrainType === "passable") return { passable: true, reason: null, terrainType };
  return { passable: false, reason: terrainType, terrainType };
}
