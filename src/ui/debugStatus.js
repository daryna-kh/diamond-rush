import { Text, TextStyle } from "pixi.js";

export const textStyle = new TextStyle({
  fill: "#e8f0f2",
  fontFamily: "Arial, sans-serif",
  fontSize: 18,
  lineHeight: 25,
});

export function createStatusText(assets) {
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
