import { R, UI_HE, h } from '../../app/runtime.js';

const TEXT = UI_HE
  ? {
      page: 'לא הצלחנו להציג את העמוד בגלל שגיאה בדף.',
      app: 'האתר נתקל בשגיאה ולא הצליח להיטען.',
      hint: 'הנתונים לא אבדו. נסו לרענן את העמוד.',
      reload: 'רענון העמוד',
      home: 'לדף הבית',
      homeHref: '/he',
    }
  : {
      page: 'Этот раздел не удалось показать из-за ошибки на странице.',
      app: 'Сайт столкнулся с ошибкой и не смог загрузиться.',
      hint: 'Данные не потеряны. Попробуйте обновить страницу.',
      reload: 'Обновить страницу',
      home: 'На главную',
      homeHref: '/',
    };

// Audit 17.11 P0: a render exception used to blank the whole site (as in the
// 15.11 hotfix). Page-level boundary keeps header/navigation alive and resets
// on route change; the root boundary is the last line of defence.
export class ErrorBoundary extends R.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error) {
    return { error };
  }
  componentDidCatch(error, info) {
    console.error('[RW] render failed', error, info && info.componentStack);
  }
  componentDidUpdate(prev) {
    if (this.state.error && prev.resetKey !== this.props.resetKey) this.setState({ error: null });
  }
  render() {
    if (!this.state.error) return this.props.children;
    const root = this.props.level === 'app';
    return h(
      'section',
      { className: 'rw-crash', role: 'alert' },
      h('h1', { className: 'rw-crash-title' }, root ? TEXT.app : TEXT.page),
      h('p', null, TEXT.hint),
      h(
        'div',
        { className: 'rw-crash-actions' },
        h(
          'button',
          { type: 'button', className: 'rw-feed-retry', onClick: () => location.reload() },
          TEXT.reload,
        ),
        root ? null : h('a', { href: TEXT.homeHref, className: 'rw-crash-home' }, TEXT.home),
      ),
    );
  }
}
