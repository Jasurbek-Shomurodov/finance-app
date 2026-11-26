/**
 * Presentation foundation: the pure UI vocabulary every workspace page is built from.
 *
 * Everything here takes props and renders markup. A member may read the language context
 * and the shared formatters, but never workspace state, data hooks or the network; that is
 * what lets `tests/presentation-foundation.mjs` render each piece on its own.
 * Import members by file (`@/components/presentation-foundation/stat-tile`) so tests can
 * substitute one piece at a time; this index is the module's table of contents.
 */
export { PageHeader } from './page-header';
export { TopBarSlotProvider, useTopBarSlot } from './top-bar-slot';
export { StatTile, StatTiles, type StatTone } from './stat-tile';
export { PanelTitle } from './panel-title';
export { InfoHint } from './info-hint';
export { HintedLabel } from './hinted-label';
export { GroupedPicker, type PickerItem } from './grouped-picker';
export { Count } from './count';
export { EmptyState } from './empty-state';
export { InlineError } from './inline-error';
export { fitFigure } from './fit-figure';
export { ResourceState } from './resource-state';
export { LoadingPlaceholder, SkeletonRows, WorkspaceSkeleton, ChartSkeleton, SankeySkeleton, NetWorthBodySkeleton, StatTilesSkeleton, PanelSkeleton, CashflowPreviewSkeleton, CashFlowReportSkeleton, AccountsSkeleton } from './loading-placeholder';
export { NavigationShimmer, screenSkeletons, TransactionsSkeleton, ReportsSkeleton, CashFlowSkeleton, CashFlowTabSkeleton, BudgetSkeleton, RecurringSkeleton } from './screen-skeletons';
export { GoalsSkeleton, InvestmentsSkeleton, LoansSkeleton, PayoffPlanCardSkeleton, AssistantSkeleton, RecoveryRowsSkeleton, RecoveryDetailSkeleton, RecentlyDeletedSkeleton, PreferencesSkeleton, SettingsSkeleton } from './planning-skeletons';
export { ForecastSkeleton, WatchlistsSkeleton, IncomeEstimatesSkeleton, AssetCardSkeleton, AssetCardsSkeleton, PerformanceSkeleton, AllocationSkeleton, PayoffPlannerSkeleton, RemindersSkeleton, CalendarSkeleton, BudgetYearSkeleton, TaxPrepSkeleton } from './tab-skeletons';
export { PageHeadingSkeleton, pageHeadings } from './page-heading-skeleton';
export { Loading, Bar, Heading, Toolbar, Merchant, Figures, Tiles, Switches, Track, times } from './skeleton-kit';
export { Segmented, type SegmentedOption } from './segmented';
export { SeriesLegend, toggleKey, type SeriesLegendItem } from './series-legend';
export { HistoryChart, type HistoryPoint } from './history-chart';
export { ChartGradient, chartAxis, chartBar, chartColors, chartDonut, chartDot, chartGrid, chartHeight, chartLegend, chartLine, chartMargin, chartSankey, chartTooltip, chartValueAxis, groupedBar, guideLine, intervalLabel, leadArea, leadLine, moneyTick, monthLabel, monthTick, plannedBar, plannedGroupedBar, recordedBar, referenceLine, sankeyNodeRadius, sideBar, sideGrid, stackTop, toneColor } from './chart';
export { RowMenu, type RowMenuItem } from './row-menu';
export { MonthDayField } from './month-day-field';
export { DeleteButton } from './delete-button';
export { AssetCard } from './asset-card';
export { AssetIcon } from './asset-icon';
export { RecordIcon } from './record-icon';
export { CategoryBadge } from './category-badge';
export { CategoryIcon } from './category-icon';
export { ProgressLine } from './progress-line';
export { DoneTick } from './done-tick';
export { TodayButton } from './today-button';
export { BusinessMark } from './business-mark';
export { BusinessFilter, type BusinessOption } from './business-filter';
export { TagChip } from './tag-chip';
export { ColorChoices } from './color-choices';
export { PersonAvatar, OwnerAvatar } from './person-avatar';
export { OwnerFilter, type OwnerOption } from './owner-filter';
export { Brand } from './brand';
export { BootChart } from './boot-chart';
export { DrawerLink } from './drawer-link';
export { PartialTotal } from './partial-total';
export { AnimatedMoney } from './animated-money';
export { RollingText, rollingColumns } from './rolling-text';
export { CurrencyValue } from './currency-value';
export { CurrencySelect } from './currency-select';
export { FormattedNumberInput } from './formatted-number-input';
export { DatePicker, MonthCalendar } from './date-picker';
export { DateRangePicker, type DateRange } from './date-range-picker';
export { AmountCurrencyFields } from './amount-currency-fields';
export { ScheduleFields } from './schedule-fields';
export { ScheduledPaymentField } from './scheduled-payment-field';
export { ExchangeRatePreview } from './exchange-rate-preview';
export { FormFooter } from './form-footer';
export { FieldError } from './field-error';
export { Pagination, pageNumbers } from './pagination';
export { ConfirmDialog } from './confirm-dialog';
export { ErrorPopup } from './error-popup';
export { SortableList, SortableItem, sortableAccessibility, useSortableSensors } from './sortable';
export { signTone } from './tone';
export { OwnershipBar, OwnershipBreakdown, partColor, usePartName } from './ownership-breakdown';
