const KEY_INTENTS = {
  ArrowLeft: { direction: "left" },
  KeyA: { direction: "left" },
  ArrowRight: { direction: "right" },
  KeyD: { direction: "right" },
  ArrowUp: { direction: "up" },
  KeyW: { direction: "up" },
  ArrowDown: { direction: "down" },
  KeyS: { direction: "down" },
};

function isEditableTarget(target) {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.isContentEditable ||
    target.tagName === "INPUT" ||
    target.tagName === "SELECT" ||
    target.tagName === "TEXTAREA" ||
    target.tagName === "BUTTON"
  );
}

export function attachKeyboardInput(inputState, { isEnabled = () => true } = {}) {
  const onKeyDown = (event) => {
    if (!isEnabled() || isEditableTarget(event.target)) return;

    const intent = KEY_INTENTS[event.code];
    if (!intent) return;

    event.preventDefault();
    if (!event.repeat) inputState.press(event.code, intent);
  };

  const onKeyUp = (event) => {
    const intent = KEY_INTENTS[event.code];
    if (!intent) return;

    inputState.release(event.code);
    if (!isEnabled() || isEditableTarget(event.target)) return;
    event.preventDefault();
  };

  const onBlur = () => {
    inputState.clear();
  };

  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);
  window.addEventListener("blur", onBlur);

  return {
    destroy() {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
    },
  };
}
