# Design system

This pass uses the shop's existing spruce and paper palette. It does not introduce a new visual language.

| Token | Use |
| --- | --- |
| `#102d27` | Desk sidebar and the phone navigation drawer. |
| `#fffefa`, `#f5f4ee` | Page surface and the outer canvas. |
| `#16856d`, `#173a2b` | Active phone tab and the selected payment method. |
| `#6d5a32` | The Stanbic status line on Sell, so it reads as a waiting state rather than a success. |
| Existing borders `#e2e9e2` and muted text `#77837a` | Catalogue, checkout, and table chrome. |

Type, radius, and shadow stay on the classes already used by the shell and the till. Icons stay in the Lucide set already imported by the shell: `LogOut` for sign out, `MoreHorizontal` for the phone More tab, and the existing page icons for the bottom bar.

Scan stays on `BarcodeCapture`. Search, quantity steppers, and the checkout card keep their current layout. The phone bar sits outside the page card, with safe-area padding, and the main column reserves `4.75rem` so the last action is not covered. From `lg` that padding is removed because the sidebar replaces the bar.

Copy that had been saved as mojibake (`catalogue…`, the middle dot, and the basket sentence) is plain text again. No new font, no new color ramp, and no marketing reskin.
