export function fitStageToScreen(app, stageRoot, mode, zoom = 1, pan = { x: 0, y: 0 }) {
  const padding = 24;
  const isDev = mode === "dev";
  const sidebarWidth = isDev ? Math.min(360, Math.max(280, app.screen.width * 0.32)) : 0;
  const availableWidth = Math.max(1, app.screen.width - sidebarWidth - padding * (isDev ? 3 : 2));
  const availableHeight = Math.max(1, app.screen.height - padding * 3);
  const scale = Math.max(
    1,
    Math.floor(
      Math.min(
        availableWidth / stageRoot.stagePixelWidth,
        availableHeight / stageRoot.stagePixelHeight,
      ),
    ),
  );
  const appliedScale = scale * zoom;

  stageRoot.scale.set(appliedScale);
  const stageX = isDev
    ? padding
    : Math.floor((app.screen.width - stageRoot.stagePixelWidth * appliedScale) / 2);
  stageRoot.x = stageX + (isDev ? pan.x : 0);
  stageRoot.y = padding + (isDev ? pan.y : 0);

}
