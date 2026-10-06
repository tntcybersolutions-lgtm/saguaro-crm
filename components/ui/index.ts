/**
 * components/ui — THE design system. These are the only way to build the
 * things they build; a page that hand-rolls one of them fails the
 * design-system gate (tools/check-design-system.mjs).
 *
 *   PageShell / PageHeader   page title, subtitle, one primary action
 *   StatCard                 hero metric card (toned, tappable)       components/ui/premium
 *   StatTile / StatRow       compact metric tiles                      kit
 *   StatusPill               every status, every module                components/ui/Status
 *   DataTable                every list: glass rows, sortable, sticky header, cards on phones
 *   Card / Section           a surface with a title                    kit / premium SectionCard
 *   EmptyState               the honest empty state                     kit
 *   ProjectDot / ProjectTile the job colour, in its five places         components/ui/ProjectColor
 *   Button, Field, Input, Select, Textarea, FormModal                   kit
 *
 * Colours come from lib/design-tokens (`palette`) or the CSS variables in
 * app/globals.css; job colours from lib/project-colors. No hex in a page.
 */
export {
  PageShell, Button, Card, StatTile, StatRow, Badge, Tabs, Toolbar, Menu, RowActions, ActionBar,
  DataTable, DetailList, EmptyState, Field, Input, DateInput, Textarea, Select, FormGrid, FormSection, FormModal, Toast, useToast,
} from './kit';
export type { Column, StatItem, BadgeTone, ButtonVariant, ButtonProps, Crumb, Action, TabItem } from './kit';
export { PageShell as PageHeader } from './kit';
export { StatusPill, LifecycleRail, StatusLegend } from './Status';
export { StatCard, SectionCard as Section, PremiumEmpty, ModuleHero, StatStrip, IconChip } from './premium';
export { ProjectDot, ProjectTile, ProjectStripe, stripeStyle, barStyle, rowStripe } from './ProjectColor';
export { SortBar, SortTh, useSort, useSortedRows } from './sort';
export { palette, paletteHex } from '@/lib/design-tokens';
export { projectColor, JOB_COLORS } from '@/lib/project-colors';
