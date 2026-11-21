import { ErrorBoundary } from '../components/ErrorBoundary/ErrorBoundary.js';
import { rwNormalizeNewsArticle } from '../api/normalizeNewsArticle.js';
import { D, UI_HE, h, useEffect, useRef, useState } from './runtime.js';
import { GlobalHeader } from '../components/Header/Header.js';
import { useFeed } from '../hooks/useFeed.js';
import { rwFocusMain, rwFollowInitialHash } from '../utils/routeFocus.js';
import { HE_TEXT } from '../i18n/meta.js';
import { AnalystShared } from '../pages/Analysts/Analysts.js';
import { DataRoomV2 } from '../pages/DataRoom/DataRoom.js';
import { CasesPageV2 } from '../pages/Events/Events.js';
import { HomeV2 } from '../pages/Home/Home.js';
export function App() {
  const normalizePath = () => {
    const p = UI_HE ? location.pathname.replace(/^\/he(?=\/|$)/, '') || '/' : location.pathname;
    return p.startsWith('/analysts')
      ? '/analysts'
      : p.startsWith('/data')
        ? '/data'
        : p.startsWith('/events')
          ? '/events'
          : '/';
  };
  const [route, setRoute] = useState(normalizePath);
  const current = useRef(route);
  current.current = route;
  const scrollPositions = useRef({ '/': 0, '/events': 0, '/data': 0, '/analysts': 0 });
  function switchRoute(path, fromPop) {
    const nextPath = new URL(path, location.origin),
      p = UI_HE ? nextPath.pathname.replace(/^\/he(?=\/|$)/, '') || '/' : nextPath.pathname;
    const target = p.startsWith('/analysts')
      ? '/analysts'
      : p.startsWith('/data')
        ? '/data'
        : p.startsWith('/events')
          ? '/events'
          : '/';
    if (target === current.current && nextPath.href === location.href) return;
    scrollPositions.current[current.current] = window.scrollY;
    if (!fromPop)
      history.pushState({ path: target }, '', nextPath.pathname + nextPath.search + nextPath.hash);
    if (D.flushSync) D.flushSync(() => setRoute(target));
    else setRoute(target);
    requestAnimationFrame(() => {
      const anchor = nextPath.hash
        ? document.getElementById(decodeURIComponent(nextPath.hash.slice(1)))
        : null;
      if (anchor) anchor.scrollIntoView({ block: 'start' });
      else window.scrollTo({ top: scrollPositions.current[target] || 0, behavior: 'instant' });
      if (!fromPop && !anchor) rwFocusMain(document);
    });
  }
  function go(path) {
    if (document.startViewTransition) document.startViewTransition(() => switchRoute(path, false));
    else switchRoute(path, false);
  }
  useEffect(() => rwFollowInitialHash(document, window), []);
  useEffect(() => {
    const pop = () => switchRoute(location.pathname + location.search + location.hash, true);
    window.addEventListener('popstate', pop);
    return () => window.removeEventListener('popstate', pop);
  }, []);
  useEffect(() => {
    document.title =
      (UI_HE
        ? HE_TEXT[
            route === '/events'
              ? 'events'
              : route === '/data'
                ? 'data'
                : route === '/analysts'
                  ? 'analysts'
                  : 'home'
          ][0]
        : route === '/events'
          ? 'События и контекст'
          : route === '/data'
            ? 'Данные и источники'
            : route === '/analysts'
              ? 'Аналитики и публикации'
              : 'Обстановка в регионе') + ' — REGIONAL WATCH';
  }, [route]);
  const overview = useFeed('/api/overview', 60000, true);
  const news = useFeed(
    '/api/news?lang=' + (UI_HE ? 'he' : 'ru') + '&limit=40&sort=latest',
    60000,
    route === '/',
  );
  const cases = useFeed(
    '/api/stories?lang=' + (UI_HE ? 'he' : 'ru') + '&limit=40',
    60000,
    route === '/' || route === '/events',
  );
  const editorial = useFeed(
    '/api/editorial-notes?lang=' + (UI_HE ? 'he' : 'ru') + '&limit=20',
    120000,
    route === '/',
  );
  const data = useFeed('/api/data', 120000, route === '/data');
  const officialPosts = useFeed(
    '/api/official-posts?lang=' + (UI_HE ? 'he' : 'ru') + '&limit=5',
    120000,
    route === '/data',
  );
  const heAviation = useFeed('/api/rw-localized/aviation', 180000, UI_HE && route === '/data');
  const heSatellite = useFeed('/api/rw-localized/satellite', 180000, UI_HE && route === '/data');
  const ruAviation = useFeed('/api/rw/aviation', 180000, !UI_HE && route === '/data');
  const ruSatellite = useFeed('/api/rw/satellite', 180000, !UI_HE && route === '/data');
  const hePosts = useFeed('/api/rw-localized/analysts', 90000, UI_HE && route === '/analysts');
  const heProfiles = useFeed('/api/rw-localized/profiles', 300000, UI_HE && route === '/analysts');
  const readyNews = Array.isArray(news.value?.articles)
    ? news.value.articles.map(rwNormalizeNewsArticle)
    : [];
  const normalizedEditorial = Array.isArray(editorial.value?.notes)
    ? editorial.value.notes.map(x => ({
        id: x.id,
        headline: x.headline || x.title,
        text: x.text || x.body || '',
        sourceUrl: x.source_url || x.url,
        time: Number.isFinite(x.published_ms) ? new Date(x.published_ms).toISOString() : null,
        author: x.author,
        content_language: x.content_language,
        translation_status: x.translation_status,
        verifiedNote: x.verified_note || '',
        verifiedLanguage: x.field_languages?.verified_note || x.content_language,
      }))
    : [];
  const normalizedNews =
    news.value || editorial.value
      ? {
          stories: readyNews,
          editorials: normalizedEditorial,
          feedPending: !news.value && !news.error,
          feedLoaded: !!news.value,
        }
      : null;
  const readyCases = Array.isArray(cases.value?.stories) ? cases.value.stories : [];
  const normalizedCases = cases.value
    ? {
        stories: readyCases,
        sourceCoverage: {
          hasKnownGaps:
            Array.isArray(overview.value?.sources) &&
            overview.value.sources.some(s => s.state === 'error' || s.state === 'partial'),
        },
      }
    : null;
  return h(
    'div',
    { className: 'app-container' },
    h(GlobalHeader, { active: route, overview: overview.value, go }),
    h(
      'main',
      { id: 'main-content', tabIndex: -1 },
      h(
        ErrorBoundary,
        { level: 'page', resetKey: route },
        route === '/'
          ? h(HomeV2, {
              visible: true,
              overview: overview.value,
              news: normalizedNews,
              cases: normalizedCases,
              go,
              errors: { news: news.error, cases: cases.error },
              feeds: { news, cases },
            })
          : null,
        route === '/events'
          ? h(CasesPageV2, { visible: true, cases: normalizedCases, error: cases.error, feed: cases })
          : null,
        route === '/data'
          ? h(DataRoomV2, {
              visible: true,
              data:
                officialPosts.value?.items && data.value
                  ? { ...data.value, home: officialPosts.value.items }
                  : data.value,
              error: data.error,
              feed: data,
              aviation: UI_HE ? heAviation.value : ruAviation.value,
              satellite: UI_HE ? heSatellite.value : ruSatellite.value,
              aviationError: UI_HE ? heAviation.error : ruAviation.error,
              satelliteError: UI_HE ? heSatellite.error : ruSatellite.error,
              aviationPending: UI_HE
                ? !heAviation.value && !heAviation.error
                : !ruAviation.value && !ruAviation.error,
              satellitePending: UI_HE
                ? !heSatellite.value && !heSatellite.error
                : !ruSatellite.value && !ruSatellite.error,
            })
          : null,
        route === '/analysts' ? h(AnalystShared, { hePosts, heProfiles }) : null,
      ),
    ),
  );
}
