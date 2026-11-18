import { h } from '../../app/runtime.js';
import { RW_ICON_PATHS } from './iconPaths.js';
export function UiIcon({ name, size = 19 }) {
  return h(
    'svg',
    {
      className: 'rw-ui-icon',
      viewBox: '0 0 24 24',
      width: size,
      height: size,
      fill: 'none',
      stroke: 'currentColor',
      strokeWidth: '1.75',
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
      'aria-hidden': 'true',
      focusable: 'false',
    },
    h('path', { d: RW_ICON_PATHS[name] || RW_ICON_PATHS.files }),
  );
}
