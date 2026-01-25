/**
 * widget.js - high-level interface for blessed (patched for bmo)
 * Same as neo-blessed/lib/widget.js but without the 'Terminal' widget,
 * avoiding term.js/pty.js runtime deps in bundled builds.
 */

var widget = exports;

widget.classes = [
  'Node',
  'Screen',
  'Element',
  'Box',
  'Text',
  'Line',
  'ScrollableBox',
  'ScrollableText',
  'BigText',
  'List',
  'Form',
  'Input',
  'Textarea',
  'Textbox',
  'Button',
  'ProgressBar',
  'FileManager',
  'Checkbox',
  'RadioSet',
  'RadioButton',
  'Prompt',
  'Question',
  'Message',
  'Loading',
  'Listbar',
  'Log',
  'Table',
  'ListTable',
  // 'Terminal', // removed
  'Image',
  'ANSIImage',
  'OverlayImage',
  'Video',
  'Layout'
];

widget.classes.forEach(function(name) {
  var file = name.toLowerCase();
  widget[name] = widget[file] = require('neo-blessed/lib/widgets/' + file);
});

widget.aliases = {
  'ListBar': 'Listbar',
  'PNG': 'ANSIImage'
};

Object.keys(widget.aliases).forEach(function(key) {
  var name = widget.aliases[key];
  widget[key] = widget[name];
  widget[key.toLowerCase()] = widget[name];
});
