// Patched blessed entry for bmo bundling with Bun.
// Avoids dynamic require('./widget') and the Terminal widget deps.

const program = require('neo-blessed/lib/program.js');
const tput = require('neo-blessed/lib/tput.js');
const widget = require('./widget.js');
const colors = require('neo-blessed/lib/colors.js');
const unicode = require('neo-blessed/lib/unicode.js');
const helpers = require('neo-blessed/lib/helpers.js');

function blessed() {
  return blessed.program.apply(null, arguments);
}

blessed.program = blessed.Program = program;
blessed.tput = blessed.Tput = tput;
blessed.widget = widget;
blessed.colors = colors;
blessed.unicode = unicode;
blessed.helpers = helpers;

blessed.helpers.sprintf = blessed.tput.sprintf;
blessed.helpers.tryRead = blessed.tput.tryRead;
blessed.helpers.merge(blessed, blessed.helpers);
blessed.helpers.merge(blessed, blessed.widget);

module.exports = blessed;
