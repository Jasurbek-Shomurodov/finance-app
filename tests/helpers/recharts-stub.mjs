// A stand-in for the chart library: every export is a named component that renders its children in a plain element,
// so a component tree (helpers/component-tree.mjs) keeps each chart part with the props it was given. A test reads
// what an axis, tooltip or series was handed and calls its formatters directly.
import React from 'react';

const part = name => Object.assign(({ children }) => React.createElement('div', { 'data-chart': name }, children), { displayName: name });
export const recharts = new Proxy({}, { get: (cache, name) => name === '__esModule' || typeof name === 'symbol' ? undefined : cache[name] ??= part(String(name)) });
/** The first chart part named `name` in the renderer's tree. */
export const chartPart = (renderer, name) => renderer.find(element => element.type?.displayName === name);
/** Every chart part named `name` in the renderer's tree. */
export const chartParts = (renderer, name) => renderer.all(element => element.type?.displayName === name);
