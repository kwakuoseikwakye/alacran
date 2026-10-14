/** Background tabs stay mounted but hidden, and a hidden host measures 0×0.
 *  Fitting it would tell the pty it is 2 columns wide, and a TUI running there
 *  would reflow into garbage the user sees when they switch back. */
export function shouldFit(width: number, height: number): boolean {
  return width > 0 && height > 0
}
