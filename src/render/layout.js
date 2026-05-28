export function fitStageToScreen(app, stageRoot, statusText, mode) {
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

  stageRoot.scale.set(scale);
  stageRoot.x = isDev
    ? padding
    : Math.floor((app.screen.width - stageRoot.stagePixelWidth * scale) / 2);
  stageRoot.y = padding;

  statusText.visible = isDev;
  if (isDev) {
    statusText.x = padding * 2 + stageRoot.stagePixelWidth * scale;
    statusText.y = padding;
  }
}
