/** Routes where hardware back may exit the app (no in-app history). */
export const HOME_PATHS = ["/", "/login"] as const;

export function isHomePath(pathname: string): boolean {
  return (HOME_PATHS as readonly string[]).includes(pathname);
}
