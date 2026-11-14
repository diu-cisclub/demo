/**
 * Prefix an internal path with the site's base path.
 * Needed when the site is served from a sub-path such as
 * `username.github.io/repo/`. Use it for every internal link and asset URL.
 */
export function withBase(path = '/'): string {
  const base = import.meta.env.BASE_URL.replace(/\/+$/, '');
  const clean = path.replace(/^\/+/, '');
  return `${base}/${clean}`;
}

/** True when `href` points at the current page or one of its children. */
export function isCurrent(href: string, pathname: string): boolean {
  const strip = (p: string) => p.replace(/\/+$/, '') || '/';
  const target = strip(withBase(href));
  const here = strip(pathname);
  return target === strip(withBase('/')) ? here === target : here === target || here.startsWith(`${target}/`);
}
