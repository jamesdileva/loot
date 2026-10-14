export function createDebouncer(fn, options = {}) {
  const delay = options.delay ?? 300;
  const setTimeoutFn = options.setTimeout ?? setTimeout;
  const clearTimeoutFn = options.clearTimeout ?? clearTimeout;
  let timer = null;

  function schedule() {
    if (timer !== null) clearTimeoutFn(timer);
    timer = setTimeoutFn(() => {
      timer = null;
      fn();
    }, delay);
  }

  function flush() {
    if (timer === null) return false;
    clearTimeoutFn(timer);
    timer = null;
    fn();
    return true;
  }

  function cancel() {
    if (timer === null) return false;
    clearTimeoutFn(timer);
    timer = null;
    return true;
  }

  return { schedule, flush, cancel };
}