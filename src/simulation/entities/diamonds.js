import {
  getRoundEntityRollTarget,
  setEntityMove,
} from "../simulationGrid.js";

export function applyDiamondGravity(levelState, diamond, now, helpers) {
  if (diamond.type !== "diamond" || !diamond.active || diamond.collected) {
    return { moved: false, entity: diamond, kind: null };
  }

  const targetX = diamond.x;
  const targetY = diamond.y + 1;
  const fallTarget = helpers.getEntityFallTarget(levelState, diamond, targetX, targetY);

  if (fallTarget.canFall) {
    diamond.falling = true;
    setEntityMove(diamond, targetX, targetY, now);
    if (fallTarget.hitPlayer) diamond.disappearAfterMove = true;
    return { moved: true, entity: diamond, kind: "fall" };
  }

  const rollTarget = getRoundEntityRollTarget(levelState, diamond);
  if (rollTarget) {
    diamond.falling = true;
    setEntityMove(diamond, rollTarget.x, rollTarget.y, now);
    return { moved: true, entity: diamond, kind: "roll" };
  }

  diamond.falling = false;
  return { moved: false, entity: diamond, kind: null };
}
