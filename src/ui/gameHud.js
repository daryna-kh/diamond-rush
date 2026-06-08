function getRequiredDiamonds(levelState) {
  const requirements = (levelState?.gemLocks || [])
    .map((lock) => lock.requiredDiamonds)
    .filter(Number.isFinite);
  if (requirements.length === 0) return null;
  return Math.max(...requirements);
}

function getHudText(levelState) {
  const collectedDiamonds = levelState?.collectedDiamonds ?? 0;
  const requiredDiamonds = getRequiredDiamonds(levelState);
  const health = levelState?.player?.health ?? "-";
  const maxHealth = levelState?.player?.maxHealth ?? "-";
  const lives = levelState?.player?.lives ?? "-";
  const gameOver = levelState?.player?.gameOver ? " | gameOver" : "";
  return `health: ${health}/${maxHealth} | lives: ${lives} | collectedDiamonds: ${collectedDiamonds} | requiredDiamonds: ${requiredDiamonds ?? "-"}${gameOver}`;
}

export function createGameHud(stageRoot) {
  const hud = document.createElement("div");
  hud.className = "game-hud";

  const render = (nextStageRoot) => {
    hud.textContent = getHudText(nextStageRoot?.levelState);
  };

  render(stageRoot);
  document.body.appendChild(hud);

  return {
    element: hud,
    updateScene(nextStageRoot) {
      render(nextStageRoot);
    },
  };
}
