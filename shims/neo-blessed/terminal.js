// Stub for neo-blessed/lib/widgets/terminal.js to avoid pulling term.js/pty.js.
// bmo TUI does not use the Terminal widget.
function Terminal(options) {
  if (!(this instanceof Terminal)) return new Terminal(options);
  this.type = 'terminal';
}

Terminal.prototype.write = function() {};
Terminal.prototype.render = function() { return null; };
Terminal.prototype.destroy = function() {};

module.exports = Terminal;
