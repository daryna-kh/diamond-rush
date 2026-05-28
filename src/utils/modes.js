const MODES = new Set(["dev", "game"]);

export function getMode() {
  const mode = new URLSearchParams(window.location.search).get("mode");
  if (MODES.has(mode)) return mode;
  return import.meta.env.DEV ? "dev" : "game";
}

export function setMode(mode) {
  const url = new URL(window.location.href);
  url.searchParams.set("mode", mode);
  window.history.replaceState({}, "", url);
}

export function createModeSwitch(initialMode, onChange) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "mode-switch";

  let currentMode = initialMode;
  const renderLabel = () => {
    button.textContent =
      currentMode === "dev" ? "Switch to Game mode" : "Switch to Dev mode";
    button.title = `Current mode: ${currentMode}`;
  };

  button.addEventListener("click", () => {
    currentMode = currentMode === "dev" ? "game" : "dev";
    setMode(currentMode);
    renderLabel();
    onChange(currentMode);
  });

  renderLabel();
  document.body.appendChild(button);
  return button;
}
