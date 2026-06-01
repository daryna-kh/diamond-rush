export function createInputState() {
  const activeKeys = new Map();
  const keyOrder = [];
  let pendingIntent = null;

  const removeKeyOrder = (key) => {
    const index = keyOrder.indexOf(key);
    if (index !== -1) keyOrder.splice(index, 1);
  };

  const getActiveKey = () => {
    for (let i = keyOrder.length - 1; i >= 0; i -= 1) {
      const key = keyOrder[i];
      if (activeKeys.has(key)) return key;
    }
    return null;
  };

  return {
    press(key, intent) {
      if (!intent) return;
      if (!activeKeys.has(key)) keyOrder.push(key);
      activeKeys.set(key, { ...intent });
      pendingIntent = { ...intent };
    },
    release(key) {
      activeKeys.delete(key);
      removeKeyOrder(key);
    },
    getIntent() {
      const key = getActiveKey();
      return key ? { ...activeKeys.get(key) } : null;
    },
    consumeIntent() {
      const activeIntent = this.getIntent();
      if (activeIntent) {
        pendingIntent = null;
        return activeIntent;
      }

      const intent = pendingIntent;
      pendingIntent = null;
      return intent;
    },
    clear() {
      activeKeys.clear();
      keyOrder.length = 0;
      pendingIntent = null;
    },
    get activeDirection() {
      return this.getIntent()?.direction || null;
    },
    get size() {
      return activeKeys.size;
    },
  };
}
