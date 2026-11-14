# Design system

The PWA retains the existing GadgetHub identity. Source PDF/HTML are missing; palette choices follow the user’s supplied visual requirements.

| Token | Value | Use |
| --- | --- | --- |
| Ink | `#0a0a0a` | Sidebar, phone drawer, and dark panels. |
| Sidebar text | `#c9c9c4` | Resting navigation labels. |
| Active nav | `#1f1f1e` | The current destination, with a `#0fa36e` icon. |
| Page | `#f4f4f2` | The canvas behind the work. |
| Card | `#ffffff` | Panels, tables, and the header. |
| Line | `#e6e6e2` | Borders and dividers. |
| Text | `#111111` | Headings and body copy. |
| Muted | `#6b6b66` | Secondary copy and idle phone tabs. |
| Green | `#0fa36e` | The active mark and focus ring. |
| Green action | `#0a7d56` | Primary buttons and positive amounts. |
| Green tint | `#e5f5ee` | Selected and success washes. |
| Amber | `#b7791f` | Waiting states. Amber text is `#8a5a12` on `#fdf3df`. |
| Red | `#d93025` | Destructive and overdue marks. Red text is `#b3261e` on `#fdeceb`. |

Type and radius stay. The phone bar still reserves `4.75rem`. On a desk the sidebar and header are fixed to the screen, and only the page scrolls. The sidebar link list keeps a quiet scrollbar.


## Security components

Security screens share `.security-*` components in `globals.css`: system typography, 4/8-point spacing, 16px input text to avoid iPhone focus zoom, 48px actions, readable error/status messages, and quiet grouped surfaces. Labels remain visible; errors use text as well as red; success uses a status live region. Device rows wrap metadata and actions rather than using wide tables. Inline confirmations keep context and provide Cancel. Safe-area padding applies to login; existing bottom navigation keeps safe-area behavior.

Dark appearance now applies throughout the workspace and security screens, following the device by default or an explicit Account preference. Focus indicators remain visible, numeric metadata uses tabular numerals, and motion respects Reduce Motion. Broader typography and legacy density inconsistencies remain review findings.


## PWA tokens and interaction conventions

`globals.css` is the shared token source. Light surfaces use page `#f4f4f2`, panel `#ffffff`, ink `#111111`, muted `#6b6b66`, borders `#e6e6e2`. Dark surfaces use page `#141a16`, panel `#202623`, ink `#f0f4f0`, muted `#b4bfb6`, borders `#424e46`. Green action fill stays `#0a7d56` with white text; dark green text is `#72dcb0`. Amber/red have semantic text and soft-surface pairs. Status also has readable text.

System typography, tabular monetary values, 4/8-point spacing, restrained borders and grouped surfaces remain shared. Workflow fields have explicit accessible names, visible labels, suitable input types and 16px mobile entry text. Minimum 44px controls and safe-area padding apply globally. Mobile catalog prices wrap below names rather than clipping. Existing tables become labeled mobile record cards while retaining header associations. Scroll regions are keyboard-focusable.

Security and operational panels reuse `.security-*` / `.workflow-*`. Collapsible forms keep records visible; each record offers only valid next-state actions. Errors preserve entered values, network retries keep the same request key, and successful financial feedback follows confirmed server state. Updates and destructive/financial actions have explicit controls. Motion respects Reduce Motion. Automated accessibility checks supplement, rather than replace, physical VoiceOver and large-text acceptance testing.


## PIN and secret entry
App PINs use six equal masked boxes with a restrained green focus ring and a numeric keyboard. A single semantic input preserves native paste, selection, backspace and screen-reader labeling; the boxes are decorative and hidden from assistive technology. PIN reveal is explicit and resets when focus leaves the field or the app is hidden. Password inputs use an inset eye control with a 44px target, visible focus and pressed state, retaining autocomplete and form semantics. No control fetches stored server secrets.


Password creation/reset uses one shared masked field with an inset eye control and a secondary Generate password action. Generated values use platform cryptographic randomness. Reset uses a native modal dialog with focus containment, Escape/cancel behavior and a clear affected-person summary. Email status distinguishes accepted delivery from an unconfirmed attempt.


Reference-catalog lookup uses existing disclosure panels, native labeled inputs and source-attributed result rows. Missing attributes are explicit; incomplete family/reference classifications cannot look like verified sellable variants. Source controls show text-based enablement, error/cooldown and heartbeat states, use the shared password eye control and confirm only preferences saved—not a completed remote collection.
