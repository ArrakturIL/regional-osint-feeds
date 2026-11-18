import { UI_HE, useEffect, useRef, useState } from '../app/runtime.js';
import { classifyFailure } from '../utils/feedFailure.js';
export function useFeed(endpoint, interval, enabled) {
  const [value, setValue] = useState(null),
    [error, setError] = useState(null),
    [failure, setFailure] = useState(null),
    [update, setUpdate] = useState(0),
    cache = useRef({ last: 0, ctrl: null });
  useEffect(() => {
    if (!enabled) return;
    let active = true,
      pending = false;
    async function pull(force) {
      if (!active || (document.hidden && !force) || pending) return;
      pending = true;
      const ctrl = new AbortController(),
        clock = setTimeout(() => ctrl.abort(), 12000);
      cache.current.ctrl = ctrl;
      let status = 0;
      try {
        const r = await fetch(endpoint, {
          cache: 'no-store',
          signal: ctrl.signal,
          headers: { Accept: 'application/json' },
        });
        if (!r.ok) {
          status = r.status;
          throw Error('HTTP ' + r.status);
        }
        const j = await r.json();
        if (!j || typeof j !== 'object' || Array.isArray(j))
          throw Object.assign(Error('Invalid API response'), { rwInvalid: true });
        if (active) {
          setValue(j);
          setError(null);
          setFailure(null);
          cache.current.last = Date.now();
          setUpdate(cache.current.last);
        }
      } catch (e) {
        if (active) setFailure({ ...classifyFailure(e, status), at: Date.now() });
        if (active)
          setError(
            e.name === 'AbortError'
              ? UI_HE
                ? 'זמן ההמתנה לשרת הסתיים'
                : 'Время ожидания ответа истекло'
              : e.message,
          );
      } finally {
        clearTimeout(clock);
        pending = false;
      }
    }
    const tick = () => {
      if (!document.hidden && Date.now() - cache.current.last >= interval) pull();
    };
    cache.current.pull = pull;
    // The first load runs even in a background tab (a link opened with a middle
    // click must not sit on "loading" until it is focused); only the periodic
    // refresh pauses while the tab is hidden.
    if (!cache.current.last) pull(true);
    else if (Date.now() - cache.current.last > Math.min(interval, 10000)) pull();
    const timer = setInterval(tick, Math.min(interval, 30000));
    document.addEventListener('visibilitychange', tick);
    return () => {
      active = false;
      clearInterval(timer);
      document.removeEventListener('visibilitychange', tick);
      cache.current.ctrl?.abort();
      cache.current.pull = null;
    };
  }, [endpoint, interval, enabled]);
  // retry: an explicit reader action, so it runs even in a hidden tab.
  const retry = () => cache.current.pull && cache.current.pull(true);
  return { value, error, failure, update, retry };
}
