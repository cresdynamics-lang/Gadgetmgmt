export type InstallGuide = { device: string; steps: string[] };

const OTHER_BROWSER_STEPS = ["Open app.gadgethubke.com in Chrome or Edge. This browser cannot install apps.", "Click the install icon at the right of the address bar, then click Install."];

/**
 * Exact install steps for browsers with no install event of their own to trigger:
 * every browser on iPhone and iPad, Safari on Mac, and Chrome or Edge when they hold their offer back.
 */
export function installGuide(userAgent: string, touchPoints: number): InstallGuide {
  const ipad = /ipad/i.test(userAgent) || (/macintosh/i.test(userAgent) && touchPoints > 1);
  const ios = ipad || /iphone|ipod/i.test(userAgent);
  const android = /android/i.test(userAgent);
  const inApp = /instagram|fban|fbav|fb_iab|tiktok|musical_ly|snapchat|; wv\)/i.test(userAgent);
  const edge = /edg(e|a|ios)?\//i.test(userAgent);
  const firefox = /firefox|fxios/i.test(userAgent);
  const chrome = /chrome|crios/i.test(userAgent);

  if (ios) {
    const device = ipad ? "iPad" : "iPhone";
    return {
      device,
      steps: [
        ...(inApp ? ["This app's own browser cannot install. Open its menu and choose Open in Safari."] : []),
        "Tap the Share button. If you don't see it, tap ⋯ first.",
        "Scroll down and tap Add to Home Screen. If it isn't listed, tap View More.",
        `If you see Open as Web App, keep it on. Tap Add, then open Gadget Hub from your ${device} Home Screen.`,
      ],
    };
  }
  if (android) {
    return {
      device: "Android phone",
      steps: [
        ...(inApp ? ["This app's own browser cannot install. Open its menu and choose Open in Chrome."] : []),
        "Open the browser menu (⋮ or ☰).",
        "Tap Install app or Add to Home screen.",
        "Tap Install. Gadget Hub appears on your Home screen.",
      ],
    };
  }

  const device = /macintosh|mac os x/i.test(userAgent) ? "Mac" : /windows/i.test(userAgent) ? "Windows PC" : "computer";
  if (edge) {
    return { device, steps: ["Click the install icon at the right of the address bar. If there is none, open the ⋯ menu, choose Apps, then Install this site as an app.", "Click Install."] };
  }
  if (firefox) return { device, steps: OTHER_BROWSER_STEPS };
  if (chrome) {
    return { device, steps: ["Click the install icon at the right of the address bar. If there is none, open the ⋮ menu, choose Cast, save and share, then Install page as app.", "Click Install."] };
  }
  if (device === "Mac" && /safari/i.test(userAgent)) {
    return { device, steps: ["In the menu bar at the top of the screen, choose File, then Add to Dock.", "Click Add. Gadget Hub appears in your Dock.", "If Add to Dock isn't listed, your Mac needs updating, or open this page in Chrome instead."] };
  }
  return { device, steps: OTHER_BROWSER_STEPS };
}
