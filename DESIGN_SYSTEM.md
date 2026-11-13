# Design system

The app uses the palette from the operations system document.

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

Dark appearance is scoped to the sign-in surface. Account security and Access retain the existing light shell until a coherent whole-app theme is implemented. Focus indicators remain visible, numeric metadata uses tabular numerals, and motion respects Reduce Motion. Broader typography and legacy density inconsistencies remain review findings.
