import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { createRenderer } from './helpers/component-tree.mjs';

// A page stand-in: the pointer listener, animation frames and the glowing surfaces, swapped in for one test.
function page({ hover = true } = {}) {
 const listeners = new Map(), frames = new Map(), cancelled = [];
 let next = 0;
 class Element {
  constructor(selector, box) { this.selector = selector; this.box = box; this.props = {}; this.style = { setProperty: (name, value) => { this.props[name] = value; } }; }
  closest(selector) { return this.selector && selector.split(',').includes(this.selector) ? this : null; }
  getBoundingClientRect() { return this.box; }
 }
 const globals = {
  window: { matchMedia: query => ({ matches: query === '(hover: hover)' && hover }) },
  document: { addEventListener: (type, listener, options) => listeners.set(type, { listener, options }), removeEventListener: (type, listener) => { if (listeners.get(type)?.listener === listener) listeners.delete(type); } },
  requestAnimationFrame: callback => { frames.set(++next, callback); return next; },
  cancelAnimationFrame: id => { cancelled.push(id); frames.delete(id); },
  Element,
 };
 const saved = Object.fromEntries(Object.keys(globals).map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
 for (const [name, value] of Object.entries(globals)) Object.defineProperty(globalThis, name, { value, configurable: true, writable: true });
 const restore = () => { for (const [name, descriptor] of Object.entries(saved)) if (descriptor) Object.defineProperty(globalThis, name, descriptor); else delete globalThis[name]; };
 const move = (target, clientX, clientY) => listeners.get('pointermove').listener({ target, clientX, clientY });
 const runFrames = () => { const due = [...frames.values()]; frames.clear(); for (const callback of due) callback(); };
 return { Element, listeners, frames, cancelled, move, runFrames, restore };
}

function mount() {
 const r = createRenderer();
 const { usePointerGlow } = r.load('hooks/use-pointer-glow.ts');
 const Shell = () => { usePointerGlow(); return null; };
 r.mount(React.createElement(Shell));
 return r;
}

test('the tile under the pointer learns where the pointer is, once per frame, in whole pixels from its corner', t => {
 const fake = page();
 t.after(fake.restore);
 const r = mount();
 assert.deepEqual(fake.listeners.get('pointermove').options, { passive: true });
 const tile = new fake.Element('.stat-tile', { left: 100, top: 40 }), card = new fake.Element('.asset-card', { left: 0, top: 0 });
 fake.move(tile, 150.4, 70.6);
 fake.move(tile, 160, 80);
 assert.equal(fake.frames.size, 1, 'a second move in the same frame waits for it');
 fake.runFrames();
 assert.deepEqual(tile.props, { '--glow-x': '50px', '--glow-y': '31px' });
 fake.move(card, 12, 9);
 fake.runFrames();
 assert.deepEqual(card.props, { '--glow-x': '12px', '--glow-y': '9px' });
 // Anything else under the pointer, or a target that is no element, is left alone.
 const panel = new fake.Element('.panel', { left: 0, top: 0 });
 fake.move(panel, 5, 5); fake.runFrames();
 fake.move({}, 5, 5); fake.runFrames();
 assert.deepEqual(panel.props, {});
 // Unmounting removes the listener and cancels a frame still waiting.
 fake.move(tile, 1, 1);
 r.unmount();
 assert.equal(fake.listeners.has('pointermove'), false);
 assert.equal(fake.cancelled.length, 1);
 assert.equal(fake.frames.size, 0);
});

test('a touch screen, with no pointer to follow, gets no listener', t => {
 const fake = page({ hover: false });
 t.after(fake.restore);
 mount();
 assert.equal(fake.listeners.size, 0);
});
