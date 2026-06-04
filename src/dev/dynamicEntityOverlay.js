import { Container, Graphics } from "pixi.js";
import { TILE_SIZE } from "../render/StageRenderer.js";

const ENTITY_COLORS = {
  "player-spawn": 0xff40d4,
  diamond: 0xffd84a,
  boulder: 0x9aa3ad,
  checkpoint: 0x43e889,
  exit: 0x4aa3ff,
  "secret-exit": 0xb17cff,
  snake: 0xff6f3c,
  "fire-spitter-left": 0xff3b1f,
  "fire-spitter-right": 0xff8a1f,
};

export function createDynamicEntityOverlay(levelState) {
  const overlay = new Container();
  overlay.label = "dynamic-entity-debug";

  for (const entity of levelState.entities) {
    const color = ENTITY_COLORS[entity.type] || 0xffffff;
    const marker = new Graphics()
      .rect(entity.x * TILE_SIZE + 2, entity.y * TILE_SIZE + 2, TILE_SIZE - 4, TILE_SIZE - 4)
      .fill({ color, alpha: 0.28 })
      .stroke({ color, width: 2, alpha: 0.95 });

    marker.label = `dynamic:${entity.type}:${entity.x}:${entity.y}`;
    overlay.addChild(marker);
  }

  return overlay;
}
