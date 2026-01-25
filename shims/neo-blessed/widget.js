/**
 * widget.js - high-level interface for blessed (patched for bmo)
 * Static map of widget classes to avoid dynamic requires like './widgets/' + file
 * and to exclude the Terminal widget which pulls term.js/pty.js.
 */

var widget = exports;

// Statically require each widget so bundlers include them and runtime
// does not attempt dynamic resolution.
widget.Node = widget.node = require('neo-blessed/lib/widgets/node.js');
widget.Screen = widget.screen = require('neo-blessed/lib/widgets/screen.js');
widget.Element = widget.element = require('neo-blessed/lib/widgets/element.js');
widget.Box = widget.box = require('neo-blessed/lib/widgets/box.js');
widget.Text = widget.text = require('neo-blessed/lib/widgets/text.js');
widget.Line = widget.line = require('neo-blessed/lib/widgets/line.js');
widget.ScrollableBox = widget.scrollablebox = require('neo-blessed/lib/widgets/scrollablebox.js');
widget.ScrollableText = widget.scrollabletext = require('neo-blessed/lib/widgets/scrollabletext.js');
widget.BigText = widget.bigtext = require('neo-blessed/lib/widgets/bigtext.js');
widget.List = widget.list = require('neo-blessed/lib/widgets/list.js');
widget.Form = widget.form = require('neo-blessed/lib/widgets/form.js');
widget.Input = widget.input = require('neo-blessed/lib/widgets/input.js');
widget.Textarea = widget.textarea = require('neo-blessed/lib/widgets/textarea.js');
widget.Textbox = widget.textbox = require('neo-blessed/lib/widgets/textbox.js');
widget.Button = widget.button = require('neo-blessed/lib/widgets/button.js');
widget.ProgressBar = widget.progressbar = require('neo-blessed/lib/widgets/progressbar.js');
widget.FileManager = widget.filemanager = require('neo-blessed/lib/widgets/filemanager.js');
widget.Checkbox = widget.checkbox = require('neo-blessed/lib/widgets/checkbox.js');
widget.RadioSet = widget.radioset = require('neo-blessed/lib/widgets/radioset.js');
widget.RadioButton = widget.radiobutton = require('neo-blessed/lib/widgets/radiobutton.js');
widget.Prompt = widget.prompt = require('neo-blessed/lib/widgets/prompt.js');
widget.Question = widget.question = require('neo-blessed/lib/widgets/question.js');
widget.Message = widget.message = require('neo-blessed/lib/widgets/message.js');
widget.Loading = widget.loading = require('neo-blessed/lib/widgets/loading.js');
widget.Listbar = widget.listbar = require('neo-blessed/lib/widgets/listbar.js');
widget.Log = widget.log = require('neo-blessed/lib/widgets/log.js');
widget.Table = widget.table = require('neo-blessed/lib/widgets/table.js');
widget.ListTable = widget.listtable = require('neo-blessed/lib/widgets/listtable.js');
// Omit Terminal widget entirely
// widget.Terminal = widget.terminal = require('neo-blessed/lib/widgets/terminal.js');
widget.Image = widget.image = require('neo-blessed/lib/widgets/image.js');
widget.ANSIImage = widget.ansiimage = require('neo-blessed/lib/widgets/ansiimage.js');
widget.OverlayImage = widget.overlayimage = require('neo-blessed/lib/widgets/overlayimage.js');
widget.Video = widget.video = require('neo-blessed/lib/widgets/video.js');
widget.Layout = widget.layout = require('neo-blessed/lib/widgets/layout.js');

widget.aliases = {
  'ListBar': 'Listbar',
  'PNG': 'ANSIImage'
};

Object.keys(widget.aliases).forEach(function(key) {
  var name = widget.aliases[key];
  widget[key] = widget[name];
  widget[key.toLowerCase()] = widget[name];
});
