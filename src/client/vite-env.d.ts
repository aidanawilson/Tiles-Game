/// <reference types="vite/client" />

// TypeScript 7 checks unresolved side-effect imports such as `import "./styles.css"`.
// Vite handles these assets at build time; this declaration makes that contract
// explicit during the standalone `tsc --noEmit` CI pass as well.
declare module "*.css";
