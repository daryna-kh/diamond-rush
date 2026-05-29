function copyDraw(draw) {
  return { ...draw };
}

function createEntityState(entity) {
  const baseEntity = {
    id: entity.id,
    type: entity.type,
    x: entity.x,
    y: entity.y,
    initialX: entity.x,
    initialY: entity.y,
    blocks: entity.blocks,
    data: entity.data,
    specifying_data: entity.specifying_data,
    key: entity.key,
    draws: entity.draws.map(copyDraw),
    sprite: null,
    sprites: [],
    active: true,
  };

  if (entity.type === "diamond") return { ...baseEntity, collected: false };
  if (entity.type === "boulder") return { ...baseEntity, moved: false, falling: false };
  if (entity.type === "checkpoint" || entity.type === "player-spawn") {
    return { ...baseEntity, checkpointIndex: entity.specifying_data, activated: false };
  }
  if (entity.type === "exit" || entity.type === "secret-exit") {
    return { ...baseEntity, open: false, secret: entity.type === "secret-exit" };
  }

  return baseEntity;
}

function createPlayerState(playerSpawn) {
  return {
    id: "player",
    type: "player",
    x: playerSpawn?.x ?? 0,
    y: playerSpawn?.y ?? 0,
    spawnX: playerSpawn?.x ?? 0,
    spawnY: playerSpawn?.y ?? 0,
    direction: "down",
    moving: false,
    alive: true,
    sprite: null,
  };
}

export function createLevelState(stage, classification) {
  const entities = classification.entities.map(createEntityState);

  return {
    stageId: stage.id,
    width: stage.width,
    height: stage.height,
    rawStage: stage,
    classification,
    playerSpawn: classification.playerSpawn ? { ...classification.playerSpawn } : null,
    player: createPlayerState(classification.playerSpawn),
    entities,
    entitiesById: new Map(entities.map((entity) => [entity.id, entity])),
    collectibles: entities.filter((entity) => entity.type === "diamond"),
    boulders: entities.filter((entity) => entity.type === "boulder"),
    checkpoints: entities.filter((entity) => entity.type === "checkpoint" || entity.type === "player-spawn"),
    exits: entities.filter((entity) => entity.type === "exit" || entity.type === "secret-exit"),
    enemies: [],
    effects: [],
    collectedDiamonds: 0,
  };
}
