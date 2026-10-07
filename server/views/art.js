/**
 * Small animated illustrations for the barbershop and salon (decorative, aria-hidden).
 * The motion lives in site.css (`.art-*` rules) and stops for reduced-motion users.
 */
import { html } from './html.js';

/** Scissors whose blades snip open and shut around the pivot. */
export const scissorsArt = () => html`<svg class="art art-scissors" viewBox="0 0 64 64" aria-hidden="true" focusable="false">
  <g class="art-scissors__a">
    <path d="M30 29.5 61 31.4v1.2L30 34.5z" fill="currentColor"/>
    <path d="M30 32 19 39" stroke="currentColor" stroke-width="4" stroke-linecap="round" fill="none"/>
    <circle cx="14" cy="42.5" r="6.5" stroke="currentColor" stroke-width="3.6" fill="none"/>
  </g>
  <g class="art-scissors__b">
    <path d="M30 29.5 61 31.4v1.2L30 34.5z" fill="currentColor" opacity=".78"/>
    <path d="M30 32 19 25" stroke="currentColor" stroke-width="4" stroke-linecap="round" fill="none"/>
    <circle cx="14" cy="21.5" r="6.5" stroke="currentColor" stroke-width="3.6" fill="none"/>
  </g>
  <circle cx="30" cy="32" r="2.6" fill="#fff"/>
</svg>`;

/** Comb that sweeps side to side. */
export const combArt = () => html`<svg class="art art-comb" viewBox="0 0 64 64" aria-hidden="true" focusable="false">
  <g class="art-comb__body">
    <rect x="8" y="20" width="48" height="11" rx="4" fill="currentColor"/>
    <path d="M12.5 31v15M18 31v15M23.5 31v15M29 31v15M34.5 31v15M40 31v15M45.5 31v15M51 31v15" stroke="currentColor" stroke-width="2.8" stroke-linecap="round"/>
  </g>
</svg>`;

/** Hair dryer with air streaming out of the nozzle. */
export const dryerArt = () => html`<svg class="art art-dryer" viewBox="0 0 64 64" aria-hidden="true" focusable="false">
  <g class="art-dryer__body" fill="currentColor">
    <rect x="6" y="15" width="34" height="23" rx="11.5"/>
    <rect x="36" y="19.5" width="11" height="14" rx="3"/>
    <path d="M18 36h11l-3.2 21h-7.6z"/>
  </g>
  <circle cx="17.5" cy="26.5" r="5.2" fill="#fff" opacity=".85"/>
  <g class="art-dryer__air" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round">
    <path d="M51 21h11"/>
    <path d="M51 26.5h12"/>
    <path d="M51 32h11"/>
  </g>
</svg>`;

/** Three colour drops dripping in turn. */
export const dropsArt = () => html`<svg class="art art-drops" viewBox="0 0 64 64" aria-hidden="true" focusable="false">
  <path class="art-drop art-drop--1" d="M14 12c4.5 6.5 7.5 11 7.5 15.5a7.5 7.5 0 0 1-15 0C6.5 23 9.5 18.5 14 12z"/>
  <path class="art-drop art-drop--2" d="M32 16c4.5 6.5 7.5 11 7.5 15.5a7.5 7.5 0 0 1-15 0c0-4.5 3-9 7.5-15.5z"/>
  <path class="art-drop art-drop--3" d="M50 12c4.5 6.5 7.5 11 7.5 15.5a7.5 7.5 0 0 1-15 0c0-4.5 3-9 7.5-15.5z"/>
  <path d="M8 52h48" stroke="currentColor" stroke-width="3" stroke-linecap="round" opacity=".35"/>
</svg>`;

/** Sparkles that twinkle one after another. */
export const sparklesArt = () => html`<svg class="art art-sparkles" viewBox="0 0 64 64" aria-hidden="true" focusable="false">
  <path class="art-spark art-spark--1" d="M26 8l4.2 13.8L44 26l-13.8 4.2L26 44l-4.2-13.8L8 26l13.8-4.2z" fill="currentColor"/>
  <path class="art-spark art-spark--2" d="M48 36l2.4 7.6L58 46l-7.6 2.4L48 56l-2.4-7.6L38 46l7.6-2.4z" fill="currentColor"/>
  <path class="art-spark art-spark--3" d="M49 6l1.8 5.2L56 13l-5.2 1.8L49 20l-1.8-5.2L42 13l5.2-1.8z" fill="currentColor"/>
</svg>`;

/** Classic barber pole with endlessly rising stripes. */
export const poleArt = () => html`<span class="art art-pole" aria-hidden="true"><span class="art-pole__glass"></span></span>`;

/** Picks the illustration for a service. */
export function serviceArt(name) {
  return { scissors: scissorsArt, comb: combArt, dryer: dryerArt, drops: dropsArt, sparkles: sparklesArt }[name]?.() ?? sparklesArt();
}
