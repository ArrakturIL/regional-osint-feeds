import { h, safeLink } from '../../app/runtime.js';
export function External({ url, children, className, onClick }) {
  const link = safeLink(url);
  return link
    ? h('a', { href: link, target: '_blank', rel: 'noopener noreferrer', className, onClick }, children)
    : null;
}
