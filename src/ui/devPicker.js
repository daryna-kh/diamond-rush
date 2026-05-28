function createOption(value, text) {
  const option = document.createElement("option");
  option.value = value;
  option.textContent = text;
  return option;
}

function getStageMetadata(stageMetadata, worldId, stageId) {
  return stageMetadata?.worlds?.[worldId]?.stages?.[stageId] || null;
}

function formatStageOption(stage, metadata) {
  const suffix = metadata?.role === "start" ? " - Start" : "";
  return `${stage.id + 1} (${stage.width}x${stage.height})${suffix}`;
}

function fillStageOptions(select, stages, stageMetadata, worldId) {
  select.replaceChildren();
  for (const stage of stages) {
    const metadata = getStageMetadata(stageMetadata, worldId, stage.id);
    select.appendChild(createOption(String(stage.id), formatStageOption(stage, metadata)));
  }
}

export function createDevPicker({
  worlds,
  stagesByWorld,
  stageMetadata,
  initialWorldId,
  initialStageId,
  initialZoom,
  onChange,
  onZoomChange,
  onPanModeChange,
  onUnknownHighlightChange,
  onDynamicHighlightChange,
}) {
  const wrapper = document.createElement("div");
  wrapper.className = "dev-picker";

  const worldLabel = document.createElement("label");
  worldLabel.className = "dev-picker__field";
  const worldText = document.createElement("span");
  worldText.textContent = "World";
  const worldSelect = document.createElement("select");
  worldSelect.className = "dev-picker__select";
  for (const world of worlds) worldSelect.appendChild(createOption(world.id, world.label));

  const stageLabel = document.createElement("label");
  stageLabel.className = "dev-picker__field";
  const stageText = document.createElement("span");
  stageText.textContent = "Stage";
  const stageSelect = document.createElement("select");
  stageSelect.className = "dev-picker__select";

  const zoomLabel = document.createElement("label");
  zoomLabel.className = "dev-picker__field";
  const zoomText = document.createElement("span");
  zoomText.textContent = "Zoom";
  const zoomInput = document.createElement("input");
  zoomInput.className = "dev-picker__range";
  zoomInput.type = "range";
  zoomInput.min = "0.25";
  zoomInput.max = "3";
  zoomInput.step = "0.25";
  zoomInput.value = String(initialZoom);
  const zoomValue = document.createElement("span");
  zoomValue.className = "dev-picker__value";

  const panButton = document.createElement("button");
  panButton.type = "button";
  panButton.className = "dev-picker__button";

  const unknownButton = document.createElement("button");
  unknownButton.type = "button";
  unknownButton.className = "dev-picker__button";

  const dynamicButton = document.createElement("button");
  dynamicButton.type = "button";
  dynamicButton.className = "dev-picker__button";

  let currentWorldId = initialWorldId;
  let panModeEnabled = false;
  let unknownHighlightEnabled = false;
  let dynamicHighlightEnabled = false;
  const renderZoomValue = () => {
    zoomValue.textContent = `${Number(zoomInput.value).toFixed(2)}x`;
  };
  const renderPanButton = () => {
    panButton.textContent = panModeEnabled ? "Pan: On" : "Pan: Off";
    panButton.classList.toggle("dev-picker__button--active", panModeEnabled);
  };
  const renderUnknownButton = () => {
    unknownButton.textContent = unknownHighlightEnabled ? "Unknown: On" : "Unknown: Off";
    unknownButton.classList.toggle("dev-picker__button--active", unknownHighlightEnabled);
  };
  const renderDynamicButton = () => {
    dynamicButton.textContent = dynamicHighlightEnabled ? "Dynamic: On" : "Dynamic: Off";
    dynamicButton.classList.toggle("dev-picker__button--active", dynamicHighlightEnabled);
  };

  worldSelect.value = currentWorldId;
  fillStageOptions(stageSelect, stagesByWorld[currentWorldId].stages, stageMetadata, currentWorldId);
  stageSelect.value = String(initialStageId);
  renderZoomValue();
  renderPanButton();
  renderUnknownButton();
  renderDynamicButton();

  worldSelect.addEventListener("change", () => {
    currentWorldId = worldSelect.value;
    const nextStage = stagesByWorld[currentWorldId].stages[0];
    fillStageOptions(stageSelect, stagesByWorld[currentWorldId].stages, stageMetadata, currentWorldId);
    stageSelect.value = String(nextStage.id);
    onChange({ worldId: currentWorldId, stageId: nextStage.id });
  });

  stageSelect.addEventListener("change", () => {
    onChange({ worldId: currentWorldId, stageId: Number(stageSelect.value) });
  });

  zoomInput.addEventListener("input", () => {
    renderZoomValue();
    onZoomChange(Number(zoomInput.value));
  });

  panButton.addEventListener("click", () => {
    panModeEnabled = !panModeEnabled;
    renderPanButton();
    onPanModeChange(panModeEnabled);
  });

  unknownButton.addEventListener("click", () => {
    unknownHighlightEnabled = !unknownHighlightEnabled;
    renderUnknownButton();
    onUnknownHighlightChange(unknownHighlightEnabled);
  });

  dynamicButton.addEventListener("click", () => {
    dynamicHighlightEnabled = !dynamicHighlightEnabled;
    renderDynamicButton();
    onDynamicHighlightChange(dynamicHighlightEnabled);
  });

  worldLabel.append(worldText, worldSelect);
  stageLabel.append(stageText, stageSelect);
  zoomLabel.append(zoomText, zoomInput, zoomValue);
  wrapper.append(worldLabel, stageLabel, zoomLabel, panButton, unknownButton, dynamicButton);
  document.body.appendChild(wrapper);

  return {
    element: wrapper,
    setMode(mode) {
      wrapper.hidden = mode !== "dev";
    },
  };
}
