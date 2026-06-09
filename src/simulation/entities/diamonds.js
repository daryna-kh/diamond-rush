import {
  clearPendingRoundEntityRoll,
  getRoundEntityRollTarget,
  isPendingRoundEntityRollReady,
  isPendingRoundEntityRollTarget,
  ROUND_ENTITY_FALL_MOVE_MS,
  setEntityMove,
  startPendingRoundEntityRoll,
} from "../simulationGrid.js";

function startDiamondFall(diamond) {
  if (!diamond.falling) {
    diamond.fallStartY = diamond.y;
  }
  diamond.falling = true;
}

function stopDiamondFall(diamond) {
  diamond.falling = false;
  diamond.fallStartY = null;
}

export function applyDiamondGravity(levelState, diamond, now, helpers) {
  if (diamond.type !== "diamond" || !diamond.active || diamond.collected) {
    return { moved: false, entity: diamond, kind: null };
  }

  const targetX = diamond.x;
  const targetY = diamond.y + 1;
  const fallTarget = helpers.getEntityFallTarget(levelState, diamond, targetX, targetY);

  if (fallTarget.canFall) {
    clearPendingRoundEntityRoll(diamond);
    startDiamondFall(diamond);
    setEntityMove(diamond, targetX, targetY, now, ROUND_ENTITY_FALL_MOVE_MS);
    if (fallTarget.hitPlayer) diamond.disappearAfterMove = true;
    return {
      moved: true,
      entity: diamond,
      kind: "fall",
    };
  }

  const rollTarget = getRoundEntityRollTarget(levelState, diamond);
  if (rollTarget) {
    if (!isPendingRoundEntityRollReady(diamond, rollTarget, now)) {
      if (!isPendingRoundEntityRollTarget(diamond, rollTarget)) {
        startPendingRoundEntityRoll(diamond, rollTarget, now);
      }
      stopDiamondFall(diamond);
      return { moved: false, entity: diamond, kind: "roll-pending" };
    }

    clearPendingRoundEntityRoll(diamond);
    startDiamondFall(diamond);
    setEntityMove(diamond, rollTarget.x, rollTarget.y, now);
    return { moved: true, entity: diamond, kind: "roll" };
  }

  clearPendingRoundEntityRoll(diamond);
  stopDiamondFall(diamond);
  return { moved: false, entity: diamond, kind: null };
}
