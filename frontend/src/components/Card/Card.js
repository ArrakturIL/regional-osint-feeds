import { h } from '../../app/runtime.js';
export function Card({ children, className, id }) {
  return h('div', { className: 'panel' + (className ? ' ' + className : ''), id }, children);
}
