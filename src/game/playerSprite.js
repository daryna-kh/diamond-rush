import { Rectangle, Sprite, Texture } from "pixi.js";
import { TILE_SIZE } from "../render/StageRenderer.js";

const PLAYER_IDLE_FRAME = "o.f#0:frame:2:palette:0";

function createFrameTexture(assets, frameId) {
  const frame = assets.atlases.objects.frames.find((candidate) => candidate.id === frameId);
  if (!frame) throw new Error(`Missing player frame: ${frameId}`);

  return new Texture({
    source: assets.textures.objects.source,
    frame: new Rectangle(frame.x, frame.y, frame.width, frame.height),
    label: frameId,
  });
}

export function createPlayerSprite(assets, spawn) {
  const texture = createFrameTexture(assets, PLAYER_IDLE_FRAME);
  const sprite = new Sprite({ texture, roundPixels: true });
  sprite.label = "player";
  sprite.x = spawn.x * TILE_SIZE;
  sprite.y = spawn.y * TILE_SIZE + TILE_SIZE - texture.height;
  sprite.zIndex = 20;
  return sprite;
}
