import { UI_HE, fmtTime, h } from '../../app/runtime.js';
import { failureText, feedLabels } from '../../utils/feedFailure.js';

// F-04: failure of one API feed. With last-good data on screen it is a quiet
// note (the data stays); with nothing to show it is an alert. Both offer retry.
export function FeedState({ feed }) {
  if (!feed || !feed.failure) return null;
  const L = feedLabels(UI_HE),
    message = failureText(feed.failure, UI_HE),
    button = label =>
      h(
        'button',
        { type: 'button', className: 'rw-feed-retry', onClick: () => feed.retry && feed.retry() },
        label,
      );
  if (feed.value)
    return h(
      'p',
      { className: 'rw-feed-state rw-feed-state--stale', role: 'status' },
      h('span', null, L.stale(fmtTime(feed.update)) + ' ' + message),
      button(L.refresh),
    );
  return h(
    'div',
    { className: 'rw-feed-state rw-feed-state--error', role: 'alert' },
    h('span', null, message + ' ' + L.auto),
    button(L.retry),
  );
}
