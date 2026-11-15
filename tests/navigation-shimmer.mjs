import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

// Rule: the full "Loading your workspace…" layout appears only on the first load and on a reload. A drawer tap
// (a tab or page change inside the signed-in app) shows shimmer, never the workspace layout or its banner.
const shell = fs.readFileSync('components/workspace/workspace-shell.tsx', 'utf8');
const placeholders = fs.readFileSync('components/presentation-foundation/screen-skeletons.tsx', 'utf8');

test('a drawer tap shows the navigation shimmer, not the workspace layout', () => {
 const navigating = shell.match(/\{destination \? (.+?) : children\}/);
 assert.ok(navigating, 'destination branch is present');
 assert.match(navigating[1], /NavigationShimmer/);
 assert.doesNotMatch(navigating[1], /PageSkeleton|WorkspaceSkeleton|Loading your workspace/);
});

test('the workspace layout and its banner stay on first load only', () => {
 // The only place the banner is set in the shell is the session check that runs before the signed-in app renders.
 const banners = shell.match(/Loading your workspace/g) ?? [];
 assert.equal(banners.length, 1);
 assert.match(shell, /!ready \|\| !signedIn[\s\S]*?Loading your workspace/);
});

test('the navigation shimmer is the destination layout, never the workspace banner', () => {
 const shimmer = placeholders.slice(placeholders.indexOf('export function NavigationShimmer'));
 assert.match(shell, /<NavigationShimmer label=\{t\("Loading records…"\)\} path=\{destination\} dashboard=\{savedDashboardColumns\(workspacePreferences\.data\.preferences\)\}\/>/, 'the shimmer is drawn for the tapped destination, the dashboard in its saved order');
 assert.match(shimmer, /screenSkeletons\[path\]/);
 assert.match(fs.readFileSync('components/presentation-foundation/skeleton-kit.tsx', 'utf8'), /function Loading\(.*\n.*role="status" aria-busy="true"/);
 assert.doesNotMatch(placeholders, /Loading your workspace/);
});
