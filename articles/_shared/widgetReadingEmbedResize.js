// Compatibility entry for earlier reading-mode pages. Measured content replaces
// the old 326/364px cap, so zoom and expanded controls can grow or shrink embeds.
const resizeModule = '/site/widgetEmbeds.js';
import(/* @vite-ignore */ resizeModule).then(({installWidgetEmbeds}) => installWidgetEmbeds());
