// Shim to avoid WASM resolution in Bun-compiled binary
// Ink expects `yoga-wasm-web/auto` default export to be the Yoga object (with Node.create, etc.).
// The ASM build's default export is a function that returns the Yoga object.
// This shim calls that function and re-exports the resulting object as default.

import asmFactory from 'yoga-wasm-web/asm';
export * from 'yoga-wasm-web/asm';

const Yoga = asmFactory();
export default Yoga;
