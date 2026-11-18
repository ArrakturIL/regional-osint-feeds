// Keyboard and deep-link behaviour around client-side navigation (STATUS #12).

// After an in-app route change, move focus to the main region so Tab continues
// from the new page instead of restarting at the top of the document.
export function rwFocusMain(doc) {
  const main = doc.getElementById('main-content');
  if (!main) return false;
  if (!main.hasAttribute('tabindex')) main.setAttribute('tabindex', '-1');
  main.focus({ preventScroll: true });
  return doc.activeElement === main;
}

// A first visit with #anchor: the target is rendered by the app after load and
// content above it keeps growing while feeds arrive, so the browser's native
// jump misses. Follow the anchor until the layout settles or the reader takes
// over (wheel, touch, key), then stop.
export function rwFollowInitialHash(doc, win, settleMs = 4000) {
  const hash = win.location.hash;
  if (!hash || hash.length < 2) return () => {};
  let id;
  try {
    id = decodeURIComponent(hash.slice(1));
  } catch {
    return () => {};
  }
  let stopped = false;
  let observer = null;
  let timer = 0;
  const userEvents = ['wheel', 'touchstart', 'keydown', 'mousedown'];
  const stop = () => {
    if (stopped) return;
    stopped = true;
    if (observer) observer.disconnect();
    if (timer) win.clearTimeout(timer);
    userEvents.forEach(type => win.removeEventListener(type, stop, true));
  };
  const follow = () => {
    if (stopped) return;
    const target = doc.getElementById(id);
    if (!target) return;
    target.scrollIntoView({ block: 'start' });
    if (!timer) timer = win.setTimeout(stop, settleMs);
  };
  userEvents.forEach(type => win.addEventListener(type, stop, { capture: true, passive: true }));
  if (typeof win.MutationObserver === 'function') {
    observer = new win.MutationObserver(follow);
    observer.observe(doc.body, { childList: true, subtree: true });
  }
  // Give up if the anchor never appears.
  win.setTimeout(() => {
    if (!timer) stop();
  }, settleMs * 3);
  follow();
  return stop;
}
