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

export function attachKeyboardInput(inputQueue, { isEnabled = () => true } = {}) {
  const onKeyDown = (event) => {
    if (!isEnabled() || isEditableTarget(event.target)) return;

    const intent = KEY_INTENTS[event.code];
    if (!intent) return;

    event.preventDefault();
    inputQueue.push(intent);
  };

  window.addEventListener("keydown", onKeyDown);

  return {
    destroy() {
      window.removeEventListener("keydown", onKeyDown);
    },
  };
}
