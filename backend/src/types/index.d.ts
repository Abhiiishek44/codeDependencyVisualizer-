declare module "tree-sitter-python" {
  const language: unknown;
  export default language;
}

declare module "tree-sitter-javascript" {
  const language: unknown;
  export default language;
}

declare module "tree-sitter-typescript" {
  const typescript: unknown;
  const tsx: unknown;
  export default { typescript, tsx };
}
