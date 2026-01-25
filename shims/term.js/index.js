// Minimal stub for term.js to satisfy bundlers when packing neo-blessed Terminal widget.
// We do not use the Terminal widget in bmo; this is a no-op implementation.
module.exports = function termFactory(opts = {}) {
  const term = {
    x: 0,
    y: 0,
    ydisp: 0,
    ybase: 0,
    cursorState: false,
    cursorHidden: false,
    selectMode: false,
    lines: Array.from({ length: (opts.rows || 24) }, () => Array(opts.cols || 80).fill([0, ' '])),
    x10Mouse: false,
    vt200Mouse: false,
    normalMouse: false,
    mouseEvents: false,
    utfMouse: false,
    sgrMouse: false,
    urxvtMouse: false,
    open() {},
    on() {},
    write() {},
    resize() {},
    destroy() {},
    refresh() {},
  };
  return term;
};
