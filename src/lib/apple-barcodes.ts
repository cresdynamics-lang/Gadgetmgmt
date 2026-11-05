/**
 * Apple does not publish a public UPC/GTIN catalogue. Identity for a scan comes from:
 * - Model number (A-number) on the device / SIM tray / USB-C port — Apple Support 108044 / 109525
 * - Marketing part number (MPN) on the sealed box and in Settings → About, e.g. MG8G4ZA/A
 * - Retail GTIN (EAN-13 / UPC-A / GS1 AI 01) on the box, stored on Product.gtin after the first receive
 * - Serial on the box Code 128, often prefixed with S (the S is not part of the serial)
 *
 * New and Ex-UK of the same model share these codes. Staff mark the condition when receiving.
 * Ex-UK units are often scanned by IMEI or A-number because the retail box is missing.
 *
 * Macs and iPads are often scanned by serial alone. Apple serials no longer encode the model,
 * so a bare serial is saved as a serial and staff choose the model once.
 * Sources: Apple Support 108043 (iPad), 108044 (iPhone), 102869 / 108052 / 108054 / 102852 (Mac part numbers),
 * and EveryMac for Mac A-numbers, which Apple does not list.
 */

export type AppleDeviceCategory = "iPhone" | "iPad" | "Mac" | "AirPods" | "Apple Watch" | "Apple accessories";

export type AppleDeviceIdentity = {
  group: string;
  category: AppleDeviceCategory;
  name: string;
  websiteProductId?: string;
  websiteVariantKey?: string;
  modelNumber?: string;
  matchedBy: "model" | "mpn" | "gtin";
};

type CatalogRow = {
  group: string;
  category: AppleDeviceCategory;
  websiteProductId?: string;
  websiteVariantKey?: string;
};

function row(group: string, category: AppleDeviceCategory, extra: Partial<CatalogRow> = {}): CatalogRow {
  return { group, category, ...extra };
}

/** Official Apple A-numbers → shop listing group. Same codes for New and Ex-UK. */
const appleModelCatalog: Record<string, CatalogRow> = {};

function addModels(codes: string[], identity: CatalogRow) {
  for (const code of codes) appleModelCatalog[code.toUpperCase()] = identity;
}

addModels(["A3473", "A3716", "A3718", "A3717"], row("iPhone 18 Pro Max", "iPhone"));
addModels(["A3472", "A3713", "A3715", "A3714"], row("iPhone 18 Pro", "iPhone"));
addModels(["A3447", "A3719", "A3721", "A3720"], row("iPhone Duo", "iPhone"));
addModels(["A3257", "A3525", "A3527", "A3526"], row("iPhone 17 Pro Max", "iPhone"));
addModels(["A3256", "A3522", "A3524", "A3523"], row("iPhone 17 Pro", "iPhone"));
addModels(["A3258", "A3519", "A3521", "A3520"], row("iPhone 17", "iPhone"));
addModels(["A3575", "A3635", "A3634"], row("iPhone 17e", "iPhone"));
addModels(["A3260", "A3516", "A3518", "A3517"], row("iPhone Air", "iPhone"));
addModels(["A3084", "A3295", "A3297", "A3296"], row("iPhone 16 Pro Max", "iPhone"));
addModels(["A3083", "A3292", "A3294", "A3293"], row("iPhone 16 Pro", "iPhone"));
addModels(["A3082", "A3289", "A3291", "A3290"], row("iPhone 16 Plus", "iPhone"));
addModels(["A3081", "A3286", "A3288", "A3287"], row("iPhone 16", "iPhone"));
addModels(["A3212", "A3408", "A3410", "A3409"], row("iPhone 16e", "iPhone"));
addModels(["A2849", "A3105", "A3108", "A3106"], row("iPhone 15 Pro Max", "iPhone"));
addModels(["A2848", "A3101", "A3104", "A3102"], row("iPhone 15 Pro", "iPhone"));
addModels(["A2847", "A3093", "A3096", "A3094"], row("iPhone 15 Plus", "iPhone"));
addModels(["A2846", "A3089", "A3092", "A3090"], row("iPhone 15", "iPhone"));
addModels(["A2651", "A2893", "A2896", "A2895", "A2894"], row("iPhone 14 Pro Max", "iPhone"));
addModels(["A2650", "A2889", "A2892", "A2891", "A2890"], row("iPhone 14 Pro", "iPhone"));
addModels(["A2632", "A2885", "A2888", "A2887", "A2886"], row("iPhone 14 Plus", "iPhone"));
addModels(["A2649", "A2881", "A2884", "A2883", "A2882"], row("iPhone 14", "iPhone"));
addModels(["A2595", "A2782", "A2784", "A2785", "A2783"], row("iPhone SE (3rd gen)", "iPhone"));
addModels(["A2484", "A2641", "A2644", "A2645", "A2643"], row("iPhone 13 Pro Max", "iPhone"));
addModels(["A2483", "A2636", "A2639", "A2640", "A2638"], row("iPhone 13 Pro", "iPhone"));
addModels(["A2482", "A2631", "A2634", "A2635", "A2633"], row("iPhone 13", "iPhone"));
addModels(["A2481", "A2626", "A2629", "A2630", "A2628"], row("iPhone 13 mini", "iPhone"));
addModels(["A2342", "A2410", "A2412", "A2411"], row("iPhone 12 Pro Max", "iPhone"));
addModels(["A2341", "A2406", "A2408", "A2407"], row("iPhone 12 Pro", "iPhone"));
addModels(["A2172", "A2402", "A2404", "A2403"], row("iPhone 12", "iPhone"));
addModels(["A2176", "A2398", "A2400", "A2399"], row("iPhone 12 mini", "iPhone"));
addModels(["A2160", "A2217", "A2215"], row("iPhone 11 Pro", "iPhone"));
addModels(["A2161", "A2220", "A2218"], row("iPhone 11 Pro Max", "iPhone"));
addModels(["A2111", "A2223", "A2221"], row("iPhone 11", "iPhone"));
addModels(["A2275", "A2298", "A2296"], row("iPhone SE (2nd gen)", "iPhone"));
addModels(["A1921", "A2101", "A2102", "A2103", "A2104"], row("iPhone XS Max", "iPhone"));
addModels(["A1920", "A2097", "A2098", "A2099", "A2100"], row("iPhone XS", "iPhone"));
addModels(["A1984", "A2105", "A2106", "A2107", "A2108"], row("iPhone XR", "iPhone"));
addModels(["A1865", "A1901", "A1902"], row("iPhone X", "iPhone"));

addModels(["A3360", "A3361", "A3362"], row('iPad Pro 13" M5', "iPad"));
addModels(["A3357", "A3358", "A3359"], row('iPad Pro 11" M5', "iPad"));
addModels(["A2925", "A2926", "A3007"], row('iPad Pro 13" M4', "iPad"));
addModels(["A2836", "A2837", "A3006"], row('iPad Pro 11" M4', "iPad"));
addModels(["A2436", "A2437", "A2764", "A2766"], row('iPad Pro 12.9" M2', "iPad"));
addModels(["A2759", "A2761", "A2435", "A2762"], row('iPad Pro 11" M2', "iPad"));
addModels(["A2378", "A2461", "A2379", "A2462"], row('iPad Pro 12.9" M1', "iPad"));
addModels(["A2377", "A2459", "A2301", "A2460"], row('iPad Pro 11" M1', "iPad"));
addModels(["A2229", "A2069", "A2232", "A2233"], row('iPad Pro 12.9" (4th gen)', "iPad"));
addModels(["A2228", "A2068", "A2230", "A2231"], row('iPad Pro 11" (2nd gen)', "iPad"));
addModels(["A3461", "A3462", "A3464"], row('iPad Air 13" M4', "iPad"));
addModels(["A3459", "A3460", "A3463"], row('iPad Air 11" M4', "iPad"));
addModels(["A3268", "A3269", "A3271"], row('iPad Air 13" M3', "iPad"));
addModels(["A3266", "A3267", "A3270"], row('iPad Air 11" M3', "iPad"));
addModels(["A2898", "A2899", "A2900"], row('iPad Air 13" M2', "iPad"));
addModels(["A2902", "A2903", "A2904"], row('iPad Air 11" M2', "iPad"));
addModels(["A2588", "A2589", "A2591"], row("iPad Air M1", "iPad"));
addModels(["A2316", "A2324", "A2325", "A2072"], row("iPad Air (4th gen)", "iPad"));
addModels(["A2152", "A2123", "A2153", "A2154"], row("iPad Air (3rd gen)", "iPad"));
addModels(["A2993", "A2995", "A2996"], row("iPad mini (A17 Pro)", "iPad"));
addModels(["A2567", "A2568", "A2569"], row("iPad mini (6th gen)", "iPad"));
addModels(["A2133", "A2124", "A2126", "A2125"], row("iPad mini (5th gen)", "iPad"));
addModels(["A3354", "A3355", "A3356"], row("iPad (A16)", "iPad"));
addModels(["A2696", "A2757", "A2777", "A3162"], row("iPad (10th gen)", "iPad"));
addModels(["A2602", "A2604", "A2603", "A2605"], row("iPad (9th gen)", "iPad"));
addModels(["A2270", "A2428", "A2429", "A2430"], row("iPad (8th gen)", "iPad"));
addModels(["A2197", "A2200", "A2198"], row("iPad (7th gen)", "iPad"));

addModels(["A3449"], row('MacBook Air 13" M5', "Mac"));
addModels(["A3448"], row('MacBook Air 15" M5', "Mac"));
addModels(["A3240"], row('MacBook Air 13" M4', "Mac"));
addModels(["A3241"], row('MacBook Air 15" M4', "Mac"));
addModels(["A3113"], row('MacBook Air 13" M3', "Mac"));
addModels(["A3114"], row('MacBook Air 15" M3', "Mac"));
addModels(["A2941"], row('MacBook Air 15" M2', "Mac"));
addModels(["A2681"], row('MacBook Air 13" M2', "Mac"));
addModels(["A2337"], row('MacBook Air 13" M1', "Mac"));
addModels(["A2179"], row('MacBook Air 13" Intel (2020)', "Mac"));
addModels(["A1932"], row('MacBook Air 13" Intel (2018-2019)', "Mac"));
addModels(["A3434"], row('MacBook Pro 14" M5', "Mac"));
addModels(["A3426", "A3427"], row('MacBook Pro 14" M5 Pro/Max', "Mac"));
addModels(["A3428", "A3429"], row('MacBook Pro 16" M5 Pro/Max', "Mac"));
addModels(["A3112"], row('MacBook Pro 14" M4', "Mac"));
addModels(["A3401"], row('MacBook Pro 14" M4 Pro', "Mac"));
addModels(["A3185"], row('MacBook Pro 14" M4 Max', "Mac"));
addModels(["A3403"], row('MacBook Pro 16" M4 Pro', "Mac"));
addModels(["A3186"], row('MacBook Pro 16" M4 Max', "Mac"));
addModels(["A2918"], row('MacBook Pro 14" M3', "Mac"));
addModels(["A2992"], row('MacBook Pro 14" M3 Pro/Max', "Mac"));
addModels(["A2991"], row('MacBook Pro 16" M3 Pro/Max', "Mac"));
addModels(["A2779"], row('MacBook Pro 14" M2 Pro/Max', "Mac"));
addModels(["A2780"], row('MacBook Pro 16" M2 Pro/Max', "Mac"));
addModels(["A2442"], row('MacBook Pro 14" M1 Pro/Max', "Mac"));
addModels(["A2485"], row('MacBook Pro 16" M1 Pro/Max', "Mac"));
addModels(["A2338"], row('MacBook Pro 13" M1/M2', "Mac"));
addModels(["A2289", "A2251", "A2159", "A1989"], row('MacBook Pro 13" Intel', "Mac"));
addModels(["A2141"], row('MacBook Pro 16" Intel', "Mac"));
addModels(["A1990"], row('MacBook Pro 15" Intel', "Mac"));

addModels(["A3063", "A3064", "A3065"], row("AirPods Pro 3", "AirPods", { websiteProductId: "airpods-pro-3", websiteVariantKey: "base" }));
addModels(["A3047", "A3048", "A3049", "A2931", "A2699", "A2698"], row("AirPods Pro 2", "AirPods", { websiteProductId: "airpods-pro-2", websiteVariantKey: "base" }));
addModels(["A3056", "A3055", "A3057"], row("AirPods 4 ANC", "AirPods", { websiteProductId: "airpods-4-anc", websiteVariantKey: "base" }));
addModels(["A3053", "A3050", "A3054"], row("AirPods 4", "AirPods", { websiteProductId: "airpods-4", websiteVariantKey: "base" }));
addModels(["A2565", "A2564"], row("AirPods (3rd gen)", "AirPods", { websiteProductId: "airpods-3", websiteVariantKey: "base" }));
addModels(["A3454"], row("AirPods Max 2026 USB-C", "AirPods", { websiteProductId: "airpods-max-2", websiteVariantKey: "base" }));
addModels(["A3184", "A2096"], row("AirPods Max", "AirPods"));

/** Apple's part numbers (first five characters, before the region code) for Macs. */
const appleMpnCatalog: Record<string, CatalogRow> = {};

function addMpns(codes: string, identity: CatalogRow) {
  for (const code of codes.split(" ")) appleMpnCatalog[code] = identity;
}

addMpns("MDV94 MDVA4 MDVC4 MDVD4 MDVE4 MDVF4 MDVH4 MDVK4 MDVN4 MDVQ4 MDVT4 MDVU4", row('MacBook Air 15" M5', "Mac"));
addMpns("MDH74 MDH84 MDHA4 MDHC4 MDHD4 MDHE4 MDHF4 MDHG4 MDHH4 MDHJ4 MDHK4", row('MacBook Air 13" M5', "Mac"));
addMpns("MC6J4 MC6K4 MC6L4 MC7A4 MC7C4 MC7D4 MDG34 MDG84 MDG94 MW1G3 MW1H3 MW1J3 MW1K3 MW1L3 MW1M3", row('MacBook Air 15" M4', "Mac"));
addMpns("MC654 MC6A4 MC6C4 MC6T4 MC6U4 MC6V4 MDG24 MDG54 MDG64 MW0W3 MW0X3 MW0Y3 MW103 MW123 MW133", row('MacBook Air 13" M4', "Mac"));
addMpns("MRYM3 MRYP3 MRYR3 MRYU3 MRYN3 MRYQ3 MRYT3 MRYV3 MXD13 MXD23 MXD33 MXD43", row('MacBook Air 15" M3', "Mac"));
addMpns("MRXN3 MRXQ3 MRXT3 MRXV3 MRXP3 MRXR3 MRXU3 MRXW3 MXCR3 MXCT3 MXCU3 MXCV3", row('MacBook Air 13" M3', "Mac"));
addMpns("MQKP3 MQKQ3 MQKR3 MQKT3 MQKU3 MQKV3 MQKW3 MQKX3", row('MacBook Air 15" M2', "Mac"));
addMpns("MLXW3 MLXX3 MLXY3 MLY03 MLY13 MLY23 MLY33 MLY43", row('MacBook Air 13" M2', "Mac"));
addMpns("MGN63 MGN93 MGND3 MGN73 MGNA3 MGNE3", row('MacBook Air 13" M1', "Mac"));
addMpns("MVH22 MVH42 MVH52 MWTJ2 MWTK2 MWTL2", row('MacBook Air 13" Intel (2020)', "Mac"));
addMpns("MVFH2 MVFJ2 MVFK2 MVFL2 MVFM2 MVFN2 MVH62 MVH82 MRE82 MREA2 MREE2 MRE92 MREC2 MREF2 MUQT2 MUQU2 MUQV2", row('MacBook Air 13" Intel (2018-2019)', "Mac"));
addMpns("MGDN4 MGDP4 MGDR4 MGDT4 MGDU4", row('MacBook Pro 14" M5 Pro/Max', "Mac"));
addMpns("MGE44 MGE64 MGE74 MGE94 MGEA4 MGEC4 MGED4 MGEE4", row('MacBook Pro 16" M5 Pro/Max', "Mac"));
addMpns("MDE04 MDE14 MDE34 MDE44 MDE54 MDE64", row('MacBook Pro 14" M5', "Mac"));
addMpns("MCX04 MCX14 MW2U3 MW2V3 MW2W3 MW2X3 MXCM3 MXCN3", row('MacBook Pro 14" M4', "Mac"));
addMpns("MXE63 MX2E3 MX2F3 MX2G3 MX2H3 MX2J3 MX2K3", row('MacBook Pro 14" M4 Pro/Max', "Mac"));
addMpns("MX2T3 MX2U3 MX2V3 MX2W3 MX2X3 MX2Y3 MX303 MX313", row('MacBook Pro 16" M4 Pro/Max', "Mac"));
addMpns("MR7J3 MR7K3 MRX23 MTL73 MTL83 MTLC3 MXE03 MXE13", row('MacBook Pro 14" M3', "Mac"));
addMpns("MRX33 MRX43 MRX53 MRX63 MRX73 MRX83", row('MacBook Pro 14" M3 Pro/Max', "Mac"));
addMpns("MRW13 MRW23 MRW33 MRW43 MRW63 MRW73 MUW63 MUW73", row('MacBook Pro 16" M3 Pro/Max', "Mac"));
addMpns("MPHE3 MPHF3 MPHG3 MPHH3 MPHJ3 MPHK3", row('MacBook Pro 14" M2 Pro/Max', "Mac"));
addMpns("MNWG3 MNW93 MNWK3 MNWD3 MNWF3 MNW83 MNWJ3 MNWC3", row('MacBook Pro 16" M2 Pro/Max', "Mac"));
addMpns("MNEH3 MNEJ3 MNEP3 MNEQ3", row('MacBook Pro 13" M2', "Mac"));
addMpns("MKGP3 MKGQ3 MKGR3 MKGT3", row('MacBook Pro 14" M1 Pro/Max', "Mac"));
addMpns("MK183 MK193 MK1A3 MK1E3 MK1F3 MK1H3", row('MacBook Pro 16" M1 Pro/Max', "Mac"));
addMpns("MYD83 MYD92 MYDA2 MYDC2", row('MacBook Pro 13" M1', "Mac"));
addMpns("MXK32 MXK52 MXK62 MXK72 MWP42 MWP52 MWP62 MWP72 MWP82 MUHN2 MUHP2 MUHQ2 MUHR2 MV962 MV972 MV982 MV992 MV9A2 MR9Q2 MR9R2 MR9T2 MR9U2 MR9V2", row('MacBook Pro 13" Intel', "Mac"));
addMpns("MVVJ2 MVVK2 MVVL2 MVVM2", row('MacBook Pro 16" Intel', "Mac"));
addMpns("MV902 MV912 MV922 MV932 MV942 MV952 MR932 MR942 MR952 MR962 MR972 MUQH2", row('MacBook Pro 15" Intel', "Mac"));
addMpns("MCR24 MD2P4 MD2Q4 MD2T4 MD2U4 MD2V4 MD2W4 MD2X4 MD2Y4 MD3A4 MD3D4 MD3E4 MD3F4 MD3G4 MD3H4 MWUU3 MWUV3 MWUW3 MWUX3 MWUY3 MWV03 MWV13 MWV33 MWV43 MWV53 MWV63 MWV73 MWV83 MWV93 MWVA3 MWVC3 MWVD3 MWVE3 MWVF3 MWVG3 MWVH3 MWVJ3 MWVK3 MWVL3 MWVN3 MWVP3 MWVQ3 MWVR3 MWUD3 MWUE3 MWUF3 MWUG3 MWUH3 MWUJ3 MWUK3 MWUL3 MWUN3 MWUQ3 MWUR3 MWUT3", row('iMac 24" M4', "Mac"));
addMpns("MQRJ3 MQRK3 MQRL3 MQRM3 MQRN3 MQRP3 MQRQ3 MQRR3 MQRT3 MQRU3 MQRV3 MQRW3 MQRX3 MQRY3 MQR93 MQRA3 MQRC3 MQRD3", row('iMac 24" M3', "Mac"));
addMpns("MGPC3 MGPD3 MGPF3 MGPG3 MGPH3 MGPJ3 MGPK3 MGPL3 MGPM3 MGPN3 MGPP3 MGPQ3 MGPR3 MGPT3 MGTF3 MJV83 MJV93 MJVA3", row('iMac 24" M1', "Mac"));
addMpns("MHQN4 MHQU4", row("Mac mini M5 Pro", "Mac"));
addMpns("MMFJ3 MMFK3", row("Mac mini M2", "Mac"));
addMpns("MNH73", row("Mac mini M2 Pro", "Mac"));
addMpns("MGNR3 MGNT3", row("Mac mini M1", "Mac"));

/**
 * Retail GTINs (EAN-13 / UPC-A) are not published by Apple. After a staff member
 * confirms the product on first receive, the scanned GTIN is stored on Product.gtin
 * and later scans match that stored code.
 */
const appleGtinCatalog: Record<string, CatalogRow> = {};

export function normalizeGtin(raw: string) {
  const digits = String(raw || "").replace(/\D/g, "");
  if (digits.length === 8 || digits.length === 12 || digits.length === 13 || digits.length === 14) {
    return digits.padStart(14, "0");
  }
  return "";
}

/** Apple marketing part number printed on the box, e.g. MG8G4ZA/A or MRY63LL/A. */
export function isAppleMpn(raw: string) {
  return /^[A-Z]{1,2}[A-Z0-9]{3,6}([A-Z]{1,2})?\/A$/i.test(String(raw || "").trim());
}

export function isAppleModelNumber(raw: string) {
  return /^A\d{4}$/i.test(String(raw || "").trim());
}

const NOT_A_SERIAL = /IPHONE|IPAD|MACBOOK|IMAC|AIRPOD|WATCH|CHARGER|CABLE|CASE|ADAPTER|PENCIL/;

/**
 * A code that is only an Apple serial: 10 to 12 letters and digits, with both present.
 * Box barcodes often prepend S, which Apple says is not part of the serial.
 */
export function appleSerialFromScan(raw: string) {
  const code = String(raw || "").trim().toUpperCase().replace(/^S(?=[A-Z0-9]{10}$|[A-Z0-9]{12}$)/, "");
  if (!/^[A-Z0-9]{10,12}$/.test(code) || !/\d/.test(code) || !/[A-Z]/.test(code)) return "";
  return isAppleModelNumber(code) || isAppleMpn(raw) || NOT_A_SERIAL.test(code) ? "" : code;
}

export function suggestedConditionFromMpn(mpn: string): "NEW" | "EX_UK" | null {
  const letter = mpn.trim().toUpperCase()[0];
  if (letter === "F") return "EX_UK";
  if (letter === "M") return "NEW";
  return null;
}

function toIdentity(catalog: CatalogRow, matchedBy: AppleDeviceIdentity["matchedBy"], modelNumber?: string): AppleDeviceIdentity {
  return {
    group: catalog.group,
    category: catalog.category,
    name: catalog.group,
    websiteProductId: catalog.websiteProductId,
    websiteVariantKey: catalog.websiteVariantKey,
    modelNumber,
    matchedBy,
  };
}

function appleMpnRow(mpn: string) {
  // Refurbished stock swaps the leading M for F; the rest of the part number is the same.
  return appleMpnCatalog[mpn.toUpperCase().replace(/^F/, "M").slice(0, 5)];
}

/** Fix a listing such as "M1/M2" or "M3 Pro/Max" when the scan itself says which chip it is. */
function refineChip(group: string, text: string) {
  if (!group.includes("/")) return group;
  const chip = readChip(text);
  if (!chip) return group;
  const options = group.match(/(M\d)(?:\/(M\d)| Pro\/Max)/);
  if (!options) return group;
  const fits = options[2] ? [options[1], options[2]].includes(chip) : chip === `${options[1]} Pro` || chip === `${options[1]} Max`;
  return fits ? group.replace(options[0], chip) : group;
}

export function lookupAppleIdentity(raw: string): AppleDeviceIdentity | null {
  const original = String(raw || "").trim();
  const upper = original.toUpperCase();
  if (!upper) return null;

  const model = upper.match(/(?<![A-Z0-9])A\d{4}(?!\d)/)?.[0];
  if (model && appleModelCatalog[model]) {
    const catalog = appleModelCatalog[model];
    return toIdentity({ ...catalog, group: refineChip(catalog.group, original) }, "model", model);
  }

  const mpn = upper.match(/(?<![A-Z0-9])([A-Z]{1,2}[A-Z0-9]{3,6}(?:[A-Z]{1,2})?\/A)(?![A-Z0-9])/)?.[1] || "";
  const mpnRow = mpn ? appleMpnRow(mpn) : undefined;
  if (mpnRow) return toIdentity({ ...mpnRow, group: refineChip(mpnRow.group, original) }, "mpn");

  const named = appleModelKey(original);
  if (named) {
    for (const [modelNumber, catalog] of Object.entries(appleModelCatalog)) {
      if (appleModelKey(catalog.group) === named) return toIdentity(catalog, "model", modelNumber);
    }
  }

  const fromName = identityFromName(original);
  if (fromName) return fromName;

  const gtin = normalizeGtin(upper.replace(/\s+/g, ""));
  if (gtin && appleGtinCatalog[gtin]) return toIdentity(appleGtinCatalog[gtin], "gtin");
  return null;
}

/**
 * The chip written on About or a box: "M2", "M2 Pro", "Core i5", "A16".
 * A four-digit model number such as A2337 is not a chip.
 */
function readChip(text: string) {
  const apple = text.match(/(?<![A-Z0-9])M([1-9])(?:[\s-]*(Pro|Max|Ultra))?(?![A-Z0-9])/i);
  if (apple) return `M${apple[1]}${apple[2] ? ` ${apple[2][0].toUpperCase()}${apple[2].slice(1).toLowerCase()}` : ""}`;
  const intel = text.match(/\bcore\s*i\s*([3579])\b/i);
  if (intel) return `Core i${intel[1]}`;
  const series = text.match(/(?<![A-Z0-9])A(1\d)(?:\s*(Pro))?(?!\d)/i);
  if (series) return `A${series[1]}${series[2] ? " Pro" : ""}`;
  return "";
}

/** Chip name for a Mac or iPad label, or "" when the text does not say one. */
export function readDeviceChip(text: string) {
  return readChip(text);
}

function readSize(text: string) {
  return text.match(/(?<![\d.])(\d{2}(?:\.\d)?)\s*(?:-?\s*inch(?:es)?|["″”]|in(?![a-z]))/i)?.[1]
    || text.match(/(?:macbook\s*(?:air|pro)|imac)\s+(13|14|15|16|24)(?![\d.])/i)?.[1]
    || text.match(/ipad\s*(?:pro|air)\s+(11|12\.9|13)(?![\d.])/i)?.[1]
    || "";
}

type ModelTraits = { family: string; category: AppleDeviceCategory; size: string; chip: string; generation: string };

const FAMILIES: [RegExp, string, AppleDeviceCategory][] = [
  [/macbook\s*air|(?<![a-z])mba(?![a-z])/i, "MacBook Air", "Mac"],
  [/macbook\s*pro|(?<![a-z])mbp(?![a-z])/i, "MacBook Pro", "Mac"],
  [/macbook/i, "MacBook", "Mac"],
  [/imac/i, "iMac", "Mac"],
  [/mac\s*mini/i, "Mac mini", "Mac"],
  [/mac\s*studio/i, "Mac Studio", "Mac"],
  [/ipad\s*pro/i, "iPad Pro", "iPad"],
  [/ipad\s*air/i, "iPad Air", "iPad"],
  [/ipad\s*mini/i, "iPad mini", "iPad"],
  [/ipad/i, "iPad", "iPad"],
];

/** What kind of Mac or iPad a label describes: family, screen size, and chip or generation. */
export function appleModelTraits(label: string): ModelTraits | null {
  const text = String(label || "");
  const family = FAMILIES.find(([pattern]) => pattern.test(text));
  if (!family) return null;
  const generation = text.match(/(\d{1,2})(?:st|nd|rd|th)\s*gen/i)?.[0].replace(/\s+/g, " ").toLowerCase() ?? "";
  return {
    family: family[1],
    category: family[2],
    size: readSize(text),
    chip: readChip(text),
    generation,
  };
}

function identityFromName(text: string): AppleDeviceIdentity | null {
  const traits = appleModelTraits(text);
  if (traits) {
    const size = traits.size ? `${traits.size}"` : "";
    const detail = traits.chip && !traits.chip.startsWith("A") ? traits.chip : traits.chip ? `(${traits.chip})` : traits.generation ? `(${traits.generation})` : "";
    const group = [traits.family, size, detail].filter(Boolean).join(" ");
    return { group, category: traits.category, name: group, matchedBy: "model" };
  }
  const airpods = text.match(/airpods(?:\s*(?:max|pro(?:\s*\d)?|\d(?:\s*anc)?))?/i)?.[0];
  if (airpods) {
    const group = airpods.replace(/\s+/g, " ").replace(/airpods/i, "AirPods").replace(/\b(max|pro)\b/i, (word) => `${word[0].toUpperCase()}${word.slice(1).toLowerCase()}`).replace(/anc/i, "ANC").trim();
    return { group, category: "AirPods", name: group, matchedBy: "model" };
  }
  const watch = text.match(/apple\s*watch(?:\s*(?:ultra(?:\s*\d)?|se(?:\s*\d)?|series\s*\d+))?/i)?.[0];
  if (watch) {
    const group = watch.replace(/\s+/g, " ").replace(/apple\s*watch/i, "Apple Watch").replace(/\bultra\b/i, "Ultra").replace(/\bse\b/i, "SE").replace(/\bseries\b/i, "Series").trim();
    return { group, category: "Apple Watch", name: group, matchedBy: "model" };
  }
  return null;
}

/** Listed models of one product type, newest first, for picking a model by hand. */
export function appleModelsFor(category: string) {
  const rows = [...Object.values(appleModelCatalog), ...Object.values(appleMpnCatalog)].filter((catalog) => catalog.category === category);
  return [...new Set(rows.map((catalog) => catalog.group))];
}

const IPHONE_MODEL = /iphone(?:\s+se(?:\s*\((?:2nd|3rd)\s*gen\))?|\s+air|\s+duo|\s+xs\s+max|\s+xs|\s+xr|\s+x|\s+\d+[a-z]?(?:\s+pro\s+max|\s+pro|\s+plus|\s+mini|e)?)/i;
const siblingSuffix = /^(pro max|pro|plus|mini|air|anc|usb-c|max)\b/i;

export function appleModelKey(label: string) {
  const n = String(label || "").toLowerCase().replace(/\s+/g, " ").trim();
  const found = n.match(IPHONE_MODEL);
  return found ? found[0].replace(/\s+/g, " ").trim() : "";
}

export function nameMatchesAppleGroup(name: string, group: string) {
  const n = String(name || "").trim().toLowerCase().replace(/\s+/g, " ");
  const g = String(group || "").trim().toLowerCase().replace(/\s+/g, " ");
  if (!n || !g) return false;
  // Macs and iPads compare by family, then size and chip wherever both sides state them.
  const nameTraits = appleModelTraits(n);
  const groupTraits = appleModelTraits(g);
  if (nameTraits || groupTraits) {
    if (!nameTraits || !groupTraits || nameTraits.family !== groupTraits.family) return false;
    if (nameTraits.size && groupTraits.size && nameTraits.size !== groupTraits.size) return false;
    if (nameTraits.generation && groupTraits.generation && nameTraits.generation !== groupTraits.generation) return false;
    if (!nameTraits.chip || !groupTraits.chip) return true;
    return nameTraits.chip === groupTraits.chip || g.includes(`${nameTraits.chip.split(" ")[0].toLowerCase()}/`) || g.includes(`/${nameTraits.chip.toLowerCase()}`) || (g.includes(`${nameTraits.chip.split(" ")[0].toLowerCase()} pro/max`) && nameTraits.chip.includes(" "));
  }
  const nameKey = appleModelKey(n);
  const groupKey = appleModelKey(g);
  if (nameKey && groupKey) return nameKey === groupKey;
  if (n === g) return true;
  if (!n.startsWith(`${g} `) && !n.startsWith(`${g}(`) && !n.startsWith(`${g} (`)) return false;
  const rest = n.slice(g.length).replace(/^[\s(\-]+/, "");
  if (siblingSuffix.test(rest) && !siblingSuffix.test(g.split(" ").slice(-2).join(" ")) && !siblingSuffix.test(g.split(" ").pop() || "")) return false;
  return true;
}

export type CatalogMatchable = {
  name: string;
  category: string;
  condition: string;
  productGroup?: string | null;
  websiteProductId?: string | null;
  websiteVariantKey?: string | null;
};

export function productMatchesAppleIdentity<T extends CatalogMatchable>(product: T, identity: AppleDeviceIdentity, condition?: string) {
  if (condition && product.condition !== condition) return false;
  if (identity.websiteProductId && product.websiteProductId === identity.websiteProductId) {
    if (!identity.websiteVariantKey || product.websiteVariantKey === identity.websiteVariantKey) return true;
  }
  if (product.productGroup && product.productGroup === identity.group) return true;
  return nameMatchesAppleGroup(product.name, identity.group) && (!product.category || product.category === identity.category || identity.category === "iPhone");
}

export function appleCatalogHint(identity: AppleDeviceIdentity | null) {
  if (!identity) return null;
  return {
    group: identity.group,
    category: identity.category,
    name: identity.name,
    websiteProductId: identity.websiteProductId ?? null,
    websiteVariantKey: identity.websiteVariantKey ?? null,
    modelNumber: identity.modelNumber ?? null,
    matchedBy: identity.matchedBy,
  };
}
