# Dashboard UI/UX Final Spec

## Direction

Conot dashboard uses a dark, clean, modern admin style. The interface is built for operational scanning: low visual noise, clear hierarchy, stable controls, readable status, and consistent behavior across desktop, tablet, and mobile. This spec intentionally avoids marketing composition, decorative shapes, oversized glow, and stacked CSS override patches.

## Design Tokens

- Breakpoints: mobile `<=767px`, tablet `768-1023px`, desktop `>=1024px`, wide `>=1280px`.
- Layout width: main content max `1280px`; fixed desktop sidebar; sticky tablet/mobile topbar.
- Radius: controls `6px`, panels/cards `8px`, dialogs/drawers `10px`.
- Borders: one subtle visible border per panel/control; no double-border look.
- Shadow: overlays, dropdowns, and toasts only; normal cards use border-first hierarchy.
- Tap targets: minimum `40px` for buttons, form controls, switches, and row actions.
- Color: near-black app background, neutral surfaces, Conot green only for primary action, focus, active navigation, and success emphasis.
- Focus: accessible `2px` ring using Conot green; no oversized neon outline.
- Typography: system sans-serif; no viewport-scaled body text; compact headings inside operational panels.

## Layout Rules

- Desktop uses a quiet fixed sidebar, compact topbar profile identity, max-width content, table-first pages, and restrained action placement.
- Tablet hides the sidebar and uses sticky topbar plus horizontal section tabs.
- Mobile uses one column, scrollable section tabs, full-screen drawers, and card-list data rows instead of wide tables.
- Global horizontal body scroll is not allowed; only wrapped desktop table containers may overflow internally.
- User/profile controls must stay compact and balanced; logout appears as a direct secondary action when it is the only account action, and moves to overflow only if more account actions are added.

## Refresh UX

- Dashboard pages use auto-refresh instead of prominent refresh buttons.
- Polling pauses when the tab is hidden and when an editing drawer/detail modal is open.
- Manual refresh remains available only through a small overflow action menu.
- Pages show subtle `Updated just now` / `Updating...` metadata near page actions.
- First load uses skeletons; background refresh uses inline metadata/spinner; action buttons show local loading state.
- Short minimum feedback duration prevents harsh flicker without delaying data correctness.

## Component Contract

- `Button` supports `variant`, `size`, `icon`, and `loading`; icon-only buttons require an accessible label.
- `StatusPill` is the only semantic status primitive for guild/bot/storage/access status.
- `DataTable<T>` renders TanStack-backed sortable tables on desktop and card rows on mobile.
- `Drawer`/`FormDrawer` uses accessible dialog behavior, Escape close, clear header/body/footer, and full-screen mobile layout.
- `FilterToggle`/activity filters persist per guild/section and include preset ranges.
- `ExportMenu` exposes CSV and JSON export actions without crowding the toolbar.
- `AuditDiffViewer` shows changed fields first, side-by-side desktop diff, and stacked mobile diff.

## Motion Contract

- Motion is functional: page enter, drawer/modal open, dropdown open, toast feedback, skeleton shimmer, hover, press, and focus transitions.
- Durations stay short: fast `120ms`, base `180ms`, slow `260ms`.
- Motion must not create layout jumps, overlap, or scroll shifts.
- `prefers-reduced-motion: reduce` disables non-essential transitions and animations.

## Page Requirements

- Login: hybrid auth hero with Conot Trackers headline, clear Discord login intent, compact benefit chips, and a dashboard preview visual; no long marketing landing sections.
- Guild picker: real loading/empty state, clean guild rows/cards, no fake skeleton mixed with real content.
- Overview: compact setup checklist, status icons, progress bar, consistent metrics, no large oval/circle status blocks.
- Trackers and Title Watches: clean search/sort toolbar, primary create action, responsive data rows, row action menus, subtle refresh metadata.
- Settings: grouped command/log/test sections, clear save state, inline validation, and button-level preview loading.
- Health: status-first toolbar, runtime/storage metrics, degraded state visible, subtle refresh metadata.
- Logs, Notifications, and Audit: shared activity layout with filters, export, detail drawer, and readable diff viewer.

## Acceptance Criteria

- UI no longer looks like incremental CSS patches layered over old styling.
- No large unclear ovals/circles for normal status or setup steps.
- Refresh is automatic/subtle and does not dominate sidebar, toolbar, or page primary flow.
- No text/control overlap at `390px`, `768px`, `1024px`, and `1440px`.
- No global horizontal scroll at mobile/tablet/desktop widths.
- Destructive actions require confirmation.
- Loading, empty, error, read-only, saving, deleting, and API-disconnected states are visible and actionable.
- Keyboard users can open/close dialogs, tab through forms, and use Escape to close overlays.
- Existing backend API and payload contracts remain unchanged.
