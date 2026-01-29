// Shim to avoid WASM resolution in Bun-compiled binary
// Prefer the ASM build even in Node so Ink can function without ./yoga.wasm at runtime.
export * from 'yoga-wasm-web/asm';
export { default } from 'yoga-wasm-web/asm';
