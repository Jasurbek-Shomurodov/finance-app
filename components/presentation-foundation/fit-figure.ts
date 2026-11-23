import type { CSSProperties } from 'react';

/**
 * A figure that must stay on one line inside a box of fixed width: the donut's total, a Settings font preview.
 * Formatted amounts keep their parts together with no-break spaces, and some forms run long (Arabic's
 * "1,234,567 US$", "17.9 ألف US$"), so the figure shrinks to its box instead of breaking. Give the element the
 * `fit-figure` class (`app/styles/foundation.css`) and spread this as its style; its box must be a size container,
 * and the caller sets `--fit-max` (the largest size) and `--fit-room` (the width it may fill, in `cqi`).
 */
export const fitFigure = (text: string) => ({ '--chars': text.length }) as CSSProperties;
