export function createInputQueue({ maxSize = 3 } = {}) {
  const queue = [];

  return {
    push(intent) {
      if (!intent) return;
      if (queue.length >= maxSize) queue.shift();
      queue.push(intent);
    },
    consume() {
      return queue.shift() || null;
    },
    clear() {
      queue.length = 0;
    },
    get size() {
      return queue.length;
    },
  };
}
