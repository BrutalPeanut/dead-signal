/**
 * Clickjacking guard for the website build. GitHub Pages can't send an X-Frame-Options /
 * frame-ancestors header, so the page checks for itself: if another site has put the game inside
 * a frame (where it could overlay fake buttons and trick a player into "Reset progress" or a
 * purchase), the game doesn't start and shows a link to play it on deadsignal.info instead.
 * Portal builds (CrazyGames runs games in its own iframe) and the store apps skip this check.
 */
export function framedByOtherSite(w: Window = window): boolean {
  try {
    if (w.top === w.self) return false;
    // reading top's origin throws when the parent is another site
    return w.top!.location.origin !== w.location.origin;
  } catch {
    return true;
  }
}

export function showFramedNotice(doc: Document = document) {
  doc.getElementById('boot')?.remove();
  const box = doc.createElement('div');
  box.setAttribute('style', 'position:fixed;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;background:#0b0d12;color:#eaf0f8;font:16px system-ui,sans-serif;text-align:center;padding:24px');
  const title = doc.createElement('div');
  title.textContent = 'Dead Signal';
  title.setAttribute('style', 'font-size:28px;font-weight:800;color:#5ef2ff');
  const msg = doc.createElement('div');
  msg.textContent = 'This game only runs on its own site.';
  const a = doc.createElement('a');
  a.href = 'https://deadsignal.info/';
  a.target = '_blank';
  a.rel = 'noopener';
  a.textContent = 'Play at deadsignal.info';
  a.setAttribute('style', 'padding:12px 22px;border-radius:12px;background:#ff8a1f;color:#0b0d12;font-weight:800;text-decoration:none');
  box.append(title, msg, a);
  doc.body.append(box);
}
