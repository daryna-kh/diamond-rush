import {
  Application,
  Assets,
  Container,
  Rectangle,
  Sprite,
  Text,
  TextStyle,
  Texture,
} from "pixi.js";

const TILE_SIZE = 24;

const assetPaths = {
  tilesAngkorImage: "/assets/atlases/tiles-angkor.png",
  tilesAngkorJson: "/assets/atlases/tiles-angkor.json",
  objectsImage: "/assets/atlases/objects.png",
  objectsJson: "/assets/atlases/objects.json",
  stagesAngkor: "/assets/data/stages-angkor.json",
  stageRenderMapAngkor: "/assets/data/stage-render-map-angkor.json",
};

const textStyle = new TextStyle({
  fill: "#e8f0f2",
  fontFamily: "Arial, sans-serif",
  fontSize: 18,
  lineHeight: 25,
});

async function loadJson(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to load ${url}: ${response.status}`);
  return response.json();
}

async function loadInitialAssets() {
  const [
    tilesAngkorTexture,
    objectsTexture,
    tilesAngkorAtlas,
    objectsAtlas,
    stagesAngkor,
    stageRenderMapAngkor,
  ] = await Promise.all([
    Assets.load(assetPaths.tilesAngkorImage),
    Assets.load(assetPaths.objectsImage),
    loadJson(assetPaths.tilesAngkorJson),
    loadJson(assetPaths.objectsJson),
    loadJson(assetPaths.stagesAngkor),
    loadJson(assetPaths.stageRenderMapAngkor),
  ]);

  return {
    textures: {
      tilesAngkor: tilesAngkorTexture,
      "tiles-angkor": tilesAngkorTexture,
      objects: objectsTexture,
    },
    atlases: {
      tilesAngkor: tilesAngkorAtlas,
      objects: objectsAtlas,
    },
    stages: {
      angkor: stagesAngkor,
    },
    stageRenderMaps: {
      angkor: stageRenderMapAngkor,
    },
  };
}

function createStatusText(assets) {
  const stageCount = assets.stages.angkor.stages.length;
  const firstStage = assets.stages.angkor.stages[0];
  const lines = [
    "Diamond Rush Angkor stage 0",
    "",
    `tiles-angkor.png: ${assets.textures.tilesAngkor.width} x ${assets.textures.tilesAngkor.height}`,
    `tiles-angkor.json: ${assets.atlases.tilesAngkor.frames.length} frames`,
    `objects.png: ${assets.textures.objects.width} x ${assets.textures.objects.height}`,
    `objects.json: ${assets.atlases.objects.frames.length} frames`,
    `stages-angkor.json: ${stageCount} stages`,
    `stage 0: ${firstStage.width} x ${firstStage.height}`,
    `stage-render-map-angkor.json: ${assets.stageRenderMaps.angkor.triples.length} triples`,
  ];

  return new Text({ text: lines.join("\n"), style: textStyle });
}

function getStageTriple(stage, index) {
  return [
    stage.layers.player[index],
    stage.layers.foreground[index],
    stage.layers.background[index],
  ].join("/");
}

function createFrameTexture(assets, draw, textureCache) {
  const cacheKey = `${draw.atlas}:${draw.frameId}`;
  if (textureCache.has(cacheKey)) return textureCache.get(cacheKey);

  const baseTexture = assets.textures[draw.atlas];
  if (!baseTexture) throw new Error(`Missing atlas texture: ${draw.atlas}`);

  const texture = new Texture({
    source: baseTexture.source,
    frame: new Rectangle(draw.x, draw.y, draw.width, draw.height),
    label: cacheKey,
  });

  textureCache.set(cacheKey, texture);
  return texture;
}

function addDraw(stageLayers, assets, draw, x, y, textureCache) {
  if (
    draw.x === undefined ||
    draw.y === undefined ||
    draw.width === undefined ||
    draw.height === undefined
  ) {
    return;
  }

  const layer = stageLayers[draw.layer] || stageLayers.foreground;
  const sprite = new Sprite({
    texture: createFrameTexture(assets, draw, textureCache),
    roundPixels: true,
  });
  sprite.x = x * TILE_SIZE + draw.dx;
  sprite.y = y * TILE_SIZE + draw.dy;
  sprite.label = `${draw.asset}:${x}:${y}`;
  layer.addChild(sprite);
}

function renderStage(stage, renderMap, assets) {
  const stageRoot = new Container();
  const stageLayers = {
    background: new Container(),
    player: new Container(),
    foreground: new Container(),
    "foreground+1": new Container(),
  };

  stageRoot.addChild(
    stageLayers.background,
    stageLayers.player,
    stageLayers.foreground,
    stageLayers["foreground+1"],
  );

  const renderRules = new Map(renderMap.triples.map((triple) => [triple.key, triple]));
  const textureCache = new Map();
  const unknownTriples = new Map();

  for (let y = 0; y < stage.height; y++) {
    for (let x = 0; x < stage.width; x++) {
      const index = x + y * stage.width;
      const key = getStageTriple(stage, index);
      const rule = renderRules.get(key);

      if (!rule) {
        unknownTriples.set(key, (unknownTriples.get(key) || 0) + 1);
        continue;
      }

      for (const draw of rule.draws) addDraw(stageLayers, assets, draw, x, y, textureCache);
      if (rule.unknown) unknownTriples.set(key, (unknownTriples.get(key) || 0) + 1);
    }
  }

  stageRoot.stagePixelWidth = stage.width * TILE_SIZE;
  stageRoot.stagePixelHeight = stage.height * TILE_SIZE;
  stageRoot.unknownTriples = unknownTriples;

  return stageRoot;
}

function fitStageToScreen(app, stageRoot, statusText) {
  const padding = 24;
  const sidebarWidth = Math.min(360, Math.max(280, app.screen.width * 0.32));
  const availableWidth = Math.max(1, app.screen.width - sidebarWidth - padding * 3);
  const availableHeight = Math.max(1, app.screen.height - padding * 2);
  const scale = Math.max(
    1,
    Math.floor(
      Math.min(
        availableWidth / stageRoot.stagePixelWidth,
        availableHeight / stageRoot.stagePixelHeight,
      ),
    ),
  );

  stageRoot.scale.set(scale);
  stageRoot.x = padding;
  stageRoot.y = padding;
  statusText.x = padding * 2 + stageRoot.stagePixelWidth * scale;
  statusText.y = padding;
}

async function main() {
  document.body.style.margin = "0";
  document.body.style.background = "#111719";
  document.body.style.overflow = "hidden";

  const app = new Application();
  await app.init({
    background: "#111719",
    resizeTo: window,
    antialias: false,
    preference: "webgl",
  });

  document.querySelector("#app").appendChild(app.canvas);

  const loadingText = new Text({ text: "Loading assets...", style: textStyle });
  loadingText.x = 24;
  loadingText.y = 24;
  app.stage.addChild(loadingText);

  try {
    const assets = await loadInitialAssets();
    app.stage.removeChild(loadingText);

    const stage = assets.stages.angkor.stages[0];
    const stageRoot = renderStage(stage, assets.stageRenderMaps.angkor, assets);
    const statusText = createStatusText(assets);
    const unknownCount = Array.from(stageRoot.unknownTriples.values()).reduce(
      (sum, count) => sum + count,
      0,
    );

    statusText.text += `\nunknown cells in stage 0: ${unknownCount}`;
    app.stage.addChild(stageRoot);
    app.stage.addChild(statusText);
    fitStageToScreen(app, stageRoot, statusText);
    window.addEventListener("resize", () => fitStageToScreen(app, stageRoot, statusText));

    globalThis.__diamondRushAssets = assets;
    globalThis.__diamondRushStage = stageRoot;
  } catch (error) {
    loadingText.text = error instanceof Error ? error.message : String(error);
    console.error(error);
  }
}

main();
