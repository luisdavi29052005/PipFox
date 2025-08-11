export function sanitizeFacebookUrl(raw: string): string {
  const full = raw.startsWith('http') ? raw : `https://facebook.com${raw}`;
  const u = new URL(full);
  u.search = '';
  u.hash = '';
  return (u.origin + u.pathname).replace(/\/$/, '');
}
