# Interface design system

Every workspace page shares one visual language, first built for Overview. Extend
it instead of styling a page on its own.

- Styles live in `app/styles/*.css`, imported in cascade order by `app/globals.css`
  (tests read them combined through `tests/helpers/stylesheet.mjs`). Tokens live at
  the top of `app/styles/foundation.css`: `--font-ui`, the `--type-*` scale
  (`caption` 13px, `small` 14px, `compact` 15px, `body` 16px, `title`, `stat`,
  `page`), `--radius-card`, `--radius-control`, `--shadow-card`, `--space-page`,
  `--hairline`, `--field`, and the `--positive` / `--negative` / `--caution`
  tones. Use them rather than literal colours, radii or pixel font sizes, so
  light and dark mode stay in step.
- Shared presentational pieces live in the `components/presentation-foundation/`
  module; its `index.ts` is the table of contents. A member takes props and renders
  markup: it may read `useLanguage()` and the `lib/format` helpers, but never
  workspace state, data hooks, screens or the network. Import members by file
  (`@/components/presentation-foundation/stat-tile`) so tests can substitute one
  piece at a time. Put a new piece there once it has more than one real caller,
  and cover it in `tests/presentation-foundation.mjs`, which also enforces the
  purity boundary.
- The look: warm grey page and rail (`#f6f5f3`), white
  cards with a hairline border and 12px radius, medium-weight figures.
- Headings are one line. Never put a grey sentence under a page, panel or tile
  heading. Explanations go behind the ⓘ: pass them as `hint` to `PageHeader` or
  `PanelTitle`, or wrap them in `InfoHint`. A tile's second line is a live
  figure (an estimate, a change), never prose.
- Open each page with `PageHeader`. Pass page actions as children; the main
  action is the default `Button`, others `outline`. Inside the workspace the
  title moves into the top bar at `--type-compact` (15px), like a desktop app's
  title bar, with the page's view tabs (`Segmented` with `page-tabs`) and actions
  beside it where the bar has room. When only the actions lack room they open the page and the tabs stay in the bar; when the tabs lack room too, both open the page.
  This title is deliberately smaller than panel and card headings, which carry
  the hierarchy on the page. `--type-page` is for titles that open the page
  itself: the `PageHeader` fallback outside the top bar, full-screen setup steps
  and onboarding. On phones the view tabs wrap rather than scroll.
- Show key figures with `StatTiles` and `StatTile`. Colour a value only when its
  sign carries meaning, through `tone`; derive the tone with `signTone` from
  `tone.ts` rather than an inline comparison.
- Holdings and accounts use `AssetCard`; the product mark is `Brand`.
- Every category is recognisable at a glance: an emoji from `lib/category-icons.ts`
  on a tile in its `categoryColor` hue. Use `CategoryIcon` beside a row's name and
  `CategoryBadge` for labels; `RecordIcon` keeps drawn symbols for holdings. Goal
  covers come from `goalEmoji`.
- Long lists are grouped, with the group total in the group header: accounts by
  type (collapsible `.account-group`), upcoming payments by month
  (`.table-group-row`). Totals in different currencies are listed, never added.
- Income amounts are green; expenses stay in the ink colour. Red marks overdue,
  overspent or owed amounts only.
- Rare row actions go in a ⋯ menu rather than a row of buttons.
- Delete is always a bin. A delete button is `DeleteButton`
  (`presentation-foundation/delete-button.tsx`): icon only, its label naming what
  it deletes; in a form footer it sits apart at the start. A ⋯ menu's delete is a
  `RowMenu` item with `deletes: true`, and a confirmation that deletes passes
  `deletes` to `ConfirmDialog`; both show the bin beside the label.
- Every list whose order the person chooses (goals, accounts, categories, cards,
  templates and the like) is reorderable by drag and drop with `SortableList` /
  `SortableItem` from `presentation-foundation/sortable.tsx`; chronological or
  sorted lists are not. `UI-AGENT.md` has the full rules and the reference
  reference workflow; read it before UI work.
- Surfaces are `.panel`; their heading row is `PanelTitle` (title, `Count` pill,
  description, and an aside or action as children). Secondary tools sit in
  `.panel.tools-panel`, with rarely used settings behind `<details>`.
- Switches between views of the same data use `Segmented`, which renders
  `.segmented` with `aria-pressed` buttons. Row actions go in `.row-actions` with
  `size="sm"` buttons; status text uses `.status-badge`.
- Empty states use `EmptyState` (icon, optional title, guidance, actions).
  A failed load is `InlineError` with its Retry callback; a fetched resource's
  loading, failed and ready states are `ResourceState`. Confirmations use
  `ConfirmDialog`; dialog forms close with `FormFooter`.
- Every chart takes its look from the chart kit, `presentation-foundation/chart.tsx`: spread
  `chartGrid`, `chartAxis` / `chartValueAxis`, `chartTooltip`, `chartBar` (`groupedBar`, `stackTop`),
  `plannedBar` for anything scheduled or estimated (legend swatch `.chart-planned-key`), `leadLine` /
  `leadArea` with `ChartGradient`, `chartLine`, `guideLine`, `referenceLine`, `chartDonut`, `chartSankey`
  and `chartHeight`; label ticks with `moneyTick`, `monthTick`, `monthLabel`. Never write grid dashes,
  axis lines, tooltip boxes, bar widths or gradients inline; change the kit and every chart follows.
  Charts over months show the whole period: months not reached yet are filled with what is planned.
  `tests/presentation-foundation.mjs` enforces this.
- Percentages go through `formatPercent` from `lib/format.ts`.
- Page children are spaced by the `.content` flex gap. Do not add outer margins
  to page sections, and give a centred child an explicit `width:100%`.
- Size layouts with `@container content (...)` queries, because the sidebar
  changes the room a page really has. Record tables keep their columns and
  scroll sideways when they do not fit, with the name column frozen
  (`position: sticky`) and at least 13rem wide; on a phone (560px and below)
  each record is a card with name and value on the first line. Names are never
  ellipsised, squeezed under another column or broken between letters, and no
  script measures a table to choose its layout (that flickered). Never hide a
  figure for lack of room: move it under the name with a label instead (Budget
  shows "Actual $1,231" under the category on a phone). Upcoming tables turn
  into stacked cards below 720px.
- Never stack a row while it still has room. A breakpoint guessed for the widest
  possible row (long UZS amounts, a progress line) stacks every ordinary row too
  early and leaves a gap with the date on a second line. Row lists that line up
  trailing columns (status, amount, actions) beside a name decide with
  `useColumnsFit` (`hooks/use-columns-fit.ts`): it measures what is on screen and
  sets `data-layout="columns"` or `"stacked"`, which the stylesheet lays out.
  Prefer `flex-wrap` / `auto-fit` grids that wrap by themselves; keep fixed
  `@container` widths for page-level layout (columns of panels), not for rows.
  `/dr` Audit L finds rows that wrapped while their first line had room.
- Define each shared selector once. Change the existing rule instead of adding a
  later override, and delete rules when their class is no longer rendered.
- Cover shared UI pieces and label translations in `tests/design-system.mjs`.
- Category colors must come from `lib/category-colors.ts`. Use `CategoryBadge` for category labels and `categoryColor` for category charts. Keep colors stable across sorting and languages, with readable light/dark badge styles.

## Landing and sign-in

- Signed-out visitors see `LandingPage` (`components/landing-page.tsx`) at `/`: the
public product tour (floating nav, hero over a
product window, feature rows, closing band). Sign-in is its own page at
`signInPath` (`lib/sign-in-path.ts`), a single centred card. The shell picks
between them; link to `signInPath`, never to `/`, when someone needs to sign in.
Landing figures are sample data through the shared formatters, and every claim
on it must match the privacy policy and a feature that exists.
Both are rendered on the server for visitors without session cookies
(`VisitorHint` in the workspace layout), in the language of the request's
`Accept-Language`; keep them free of browser-only code during render.
`tests/landing-page.mjs` covers all of this.
