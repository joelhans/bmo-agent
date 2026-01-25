// Minimal stub for pty.js to satisfy bundlers when packing neo-blessed Terminal widget.
// bmo does not use the Terminal widget; this is a no-op implementation compatible with blessed expectations.
module.exports = {
  fork() {
    const listeners = {};
    return {
      write() {},
      resize() {},
      destroy() {},
      kill() {},
      on(ev, cb) { (listeners[ev] ||= []).push(cb); },
      emit(ev, ...args) { (listeners[ev] || []).forEach((f) => f(...args)); },
    };
  }
};
