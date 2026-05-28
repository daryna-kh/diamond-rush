export function createStagePanController(canvas, { isEnabled, onPan }) {
  let dragging = false;
  let lastX = 0;
  let lastY = 0;

  const updateCursor = () => {
    canvas.style.cursor = isEnabled() ? (dragging ? "grabbing" : "grab") : "default";
  };

  canvas.addEventListener("pointerdown", (event) => {
    if (!isEnabled()) return;

    dragging = true;
    lastX = event.clientX;
    lastY = event.clientY;
    canvas.setPointerCapture(event.pointerId);
    updateCursor();
  });

  canvas.addEventListener("pointermove", (event) => {
    if (!dragging || !isEnabled()) return;

    const dx = event.clientX - lastX;
    const dy = event.clientY - lastY;
    lastX = event.clientX;
    lastY = event.clientY;
    onPan(dx, dy);
  });

  const stopDragging = (event) => {
    if (!dragging) return;

    dragging = false;
    if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
    updateCursor();
  };

  canvas.addEventListener("pointerup", stopDragging);
  canvas.addEventListener("pointercancel", stopDragging);
  canvas.addEventListener("pointerleave", updateCursor);
  canvas.addEventListener("pointerenter", updateCursor);

  updateCursor();

  return {
    updateCursor,
  };
}
