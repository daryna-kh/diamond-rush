import { Rectangle, Texture } from "pixi.js";
import { TILE_SIZE } from "../render/StageRenderer.js";

const DOOR_TEXTURES = new Map();
const DOOR_FRAME_MS = 120;

const DOOR_FRAMES = {
  "door-head": {
    open: [2],
    closing: [2, 1, 0],
    closed: [0],
  },
  "door-bottom": {
    open: [5],
    closing: [5, 4, 3],
    closed: [3],
  },
};

function getDoorFramePalette(frameId) {
  const match = /^cm\.f#1:frame:\d+:palette:(\d+)$/.exec(frameId || "");
  return match ? Number(match[1]) : null;
}

function getDoorFrameId(part, palette, state, step) {
  const frames = DOOR_FRAMES[part]?.[state] || DOOR_FRAMES[part]?.open;
  if (!frames) return null;
  const frame = frames[Math.min(step, frames.length - 1)];
  return `cm.f#1:frame:${frame}:palette:${palette}`;
}

function createDoorTexture(assets, frameId) {
  if (DOOR_TEXTURES.has(frameId)) return DOOR_TEXTURES.get(frameId);

  const frame = assets.atlases.objects.frames.find((candidate) => candidate.id === frameId);
  if (!frame) throw new Error(`Missing door frame: ${frameId}`);

  const texture = new Texture({
    source: assets.textures.objects.source,
    frame: new Rectangle(frame.x, frame.y, frame.width, frame.height),
    label: frameId,
  });
  DOOR_TEXTURES.set(frameId, texture);
  return texture;
}

function getDoorStep(entity, now) {
  if (!entity.doorAnimation) return null;
  const state = entity.doorAnimation.state || "open";
  if (state !== "closing") return 0;
  if (!entity.doorAnimation.startedAt) entity.doorAnimation.startedAt = now;

  const step = Math.floor((now - entity.doorAnimation.startedAt) / DOOR_FRAME_MS);
  const maxStep = DOOR_FRAMES["door-head"].closing.length - 1;
  if (step >= maxStep) entity.doorAnimation.state = "closed";
  return Math.min(step, maxStep);
}

function alignDoorSprite(entity, sprite) {
  const draw = sprite.entityDraw;
  sprite.x = entity.x * TILE_SIZE + draw.dx;
  sprite.y = entity.y * TILE_SIZE + draw.dy;

  if (draw.asset === "door-bottom") {
    sprite.y += (draw.height || TILE_SIZE) - sprite.texture.height;
  }
}

export function syncDoorSprite(assets, entity, sprite, now) {
  const draw = sprite.entityDraw;
  if (!entity.doorAnimation || !DOOR_FRAMES[draw?.asset]) return false;

  const palette = getDoorFramePalette(draw.frameId);
  const step = getDoorStep(entity, now);
  if (palette === null || step === null) return false;

  const frameId = getDoorFrameId(draw.asset, palette, entity.doorAnimation.state || "open", step);
  if (frameId && sprite.doorFrameId !== frameId) {
    sprite.texture = createDoorTexture(assets, frameId);
    sprite.doorFrameId = frameId;
  }

  alignDoorSprite(entity, sprite);
  return true;
}
