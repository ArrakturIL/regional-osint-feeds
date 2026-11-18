import { UI_HE, h } from '../../app/runtime.js';
export function Loading({ label }) {
  return h(
    'div',
    { className: 'loading skeleton' },
    label || (UI_HE ? 'טוענים נתונים…' : 'Загружаем данные…'),
  );
}
