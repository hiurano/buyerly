/**
 * A CSS Module next to its component (`Sidebar.module.css`), as Linear's: Vite
 * scopes its classes (`_navigation_1x2y3_2`) and the default export maps each
 * class written in the file to its scoped name. See STYLEX.md.
 */
declare module '*.module.css' {
  const classes: Readonly<Record<string, string>>;
  export default classes;
}
