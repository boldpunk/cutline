// Draws the demo salon's illustrations (hero, barber portraits, gallery of cuts)
// as flat vector art and saves them as WebP next to this file.
// All images are original drawings made by this script — no photos, no stock.
// Run: node scripts/demo-art/generate.mjs  (needs the bundled Chromium + sharp)
import { chromium } from "@playwright/test";
import path from "node:path";
import { writeFileSync } from "node:fs";
import sharp from "sharp";

const OUT = path.dirname(new URL(import.meta.url).pathname);

const C = {
  ink: "#141a2e",
  ink2: "#1d2540",
  paper: "#f2f1ed",
  red: "#c8261f",
  blue: "#2c47c9",
  brass: "#d9a441",
  sky: "#dfe5f6",
  blush: "#f4dcd6",
  sand: "#efe3cf",
};

const SKIN = { light: ["#f1c9a5", "#dcae88"], mid: ["#d9a27a", "#c08560"], tan: ["#b97d55", "#9c6440"] };
const HAIR = { black: "#1b1714", dark: "#2e2119", brown: "#5a3b26" };

/** Diagonal barber-pole stripes clipped to a shape id. */
function stripes(id, w, h, a = C.red, b = C.paper, c = C.blue, size = 36) {
  return `<pattern id="${id}" width="${size * 4}" height="${size * 4}" patternUnits="userSpaceOnUse" patternTransform="rotate(-35)">
    <rect width="${size * 4}" height="${size * 4}" fill="${b}"/>
    <rect width="${size}" height="${size * 4}" fill="${a}"/>
    <rect x="${size * 2}" width="${size}" height="${size * 4}" fill="${c}"/>
  </pattern>`;
}

/** Hair styles drawn over a head centred at (cx, cy) with radii (rx, ry). */
function hair(style, cx, cy, rx, ry, color, skin) {
  const top = cy - ry;
  const L = cx - rx;
  const R = cx + rx;
  const fadeId = `fade-${style}-${cx}`;
  const fade = `<linearGradient id="${fadeId}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${color}"/><stop offset="0.55" stop-color="${color}" stop-opacity="0.55"/><stop offset="1" stop-color="${skin}" stop-opacity="0"/></linearGradient>`;
  switch (style) {
    case "part": // classic side part
      return `<path d="M${L - 4} ${cy - 10} C ${L - 10} ${top + 40}, ${cx - 70} ${top - 26}, ${cx + 10} ${top - 18}
        C ${cx + 90} ${top - 12}, ${R + 14} ${top + 50}, ${R + 4} ${cy - 6}
        C ${R - 14} ${cy - 70}, ${cx + 60} ${top + 52}, ${cx - 26} ${top + 46}
        C ${cx - 70} ${top + 44}, ${L + 16} ${cy - 70}, ${L - 4} ${cy - 10} Z" fill="${color}"/>
        <path d="M${cx - 30} ${top + 4} C ${cx - 10} ${top + 30}, ${cx + 40} ${top + 34}, ${cx + 96} ${top + 30}" stroke="${skin}" stroke-opacity=".35" stroke-width="5" fill="none"/>`;
    case "fade": // skin fade with a textured top
      return `<defs>${fade}</defs>
        <path d="M${L + 2} ${cy + 20} C ${L - 6} ${top + 60}, ${cx - 70} ${top + 6}, ${cx} ${top + 4} C ${cx + 70} ${top + 6}, ${R + 6} ${top + 60}, ${R - 2} ${cy + 20} Z" fill="url(#${fadeId})"/>
        <path d="M${L + 14} ${top + 78} C ${L + 10} ${top - 6}, ${cx - 40} ${top - 40}, ${cx + 6} ${top - 34}
          C ${cx + 40} ${top - 52}, ${cx + 60} ${top - 20}, ${cx + 82} ${top - 30} C ${R} ${top - 10}, ${R - 6} ${top + 40}, ${R - 14} ${top + 78}
          C ${cx + 40} ${top + 50}, ${cx - 40} ${top + 50}, ${L + 14} ${top + 78} Z" fill="${color}"/>
        <path d="M${cx - 60} ${top - 4} l 22 -26 M${cx - 18} ${top - 14} l 18 -30 M${cx + 26} ${top - 16} l 20 -26" stroke="${C.ink}" stroke-opacity=".25" stroke-width="6" stroke-linecap="round"/>`;
    case "buzz": // short even buzz cut
      return `<path d="M${L + 4} ${cy - 4} C ${L - 2} ${top + 30}, ${cx - 70} ${top - 4}, ${cx} ${top - 4} C ${cx + 70} ${top - 4}, ${R + 2} ${top + 30}, ${R - 4} ${cy - 4}
        C ${R - 18} ${cy - 50}, ${cx + 70} ${top + 26}, ${cx} ${top + 26} C ${cx - 70} ${top + 26}, ${L + 18} ${cy - 50}, ${L + 4} ${cy - 4} Z" fill="${color}" fill-opacity=".85"/>`;
    case "crop": // textured french crop with a blunt fringe
      return `<defs>${fade}</defs>
        <path d="M${L + 2} ${cy + 10} C ${L - 4} ${top + 60}, ${cx - 70} ${top}, ${cx} ${top} C ${cx + 70} ${top}, ${R + 4} ${top + 60}, ${R - 2} ${cy + 10} Z" fill="url(#${fadeId})"/>
        <path d="M${L + 6} ${top + 92} C ${L} ${top + 10}, ${cx - 60} ${top - 30}, ${cx} ${top - 30} C ${cx + 60} ${top - 30}, ${R} ${top + 10}, ${R - 6} ${top + 92}
          L ${R - 30} ${top + 84} L ${cx + 60} ${top + 96} L ${cx + 10} ${top + 88} L ${cx - 40} ${top + 98} L ${L + 30} ${top + 86} Z" fill="${color}"/>`;
    case "undercut": // long top slicked back, shaved sides
      return `<path d="M${L + 2} ${cy - 6} C ${L - 4} ${top + 90}, ${L + 14} ${top + 64}, ${L + 44} ${top + 60} L ${L + 26} ${cy - 40} Z M${R - 2} ${cy - 6} C ${R + 4} ${top + 90}, ${R - 14} ${top + 64}, ${R - 44} ${top + 60} L ${R - 26} ${cy - 40} Z" fill="${color}" fill-opacity=".35"/>
        <path d="M${L + 20} ${top + 70} C ${L - 10} ${top - 20}, ${cx - 30} ${top - 70}, ${cx + 40} ${top - 56} C ${R + 10} ${top - 44}, ${R + 10} ${top + 20}, ${R - 20} ${top + 70}
          C ${cx + 40} ${top + 40}, ${cx - 40} ${top + 40}, ${L + 20} ${top + 70} Z" fill="${color}"/>
        <path d="M${cx - 50} ${top - 10} C ${cx} ${top - 40}, ${cx + 60} ${top - 40}, ${cx + 100} ${top - 10}" stroke="${C.paper}" stroke-opacity=".18" stroke-width="7" fill="none"/>`;
    case "kid": // soft rounded kid's cut with a fringe
      return `<path d="M${L - 2} ${cy + 6} C ${L - 14} ${top + 20}, ${cx - 60} ${top - 30}, ${cx} ${top - 30} C ${cx + 60} ${top - 30}, ${R + 14} ${top + 20}, ${R + 2} ${cy + 6}
        C ${R - 10} ${top + 90}, ${cx + 40} ${top + 70}, ${cx + 20} ${top + 96} C ${cx} ${top + 70}, ${cx - 40} ${top + 100}, ${cx - 60} ${top + 80}
        C ${L + 20} ${top + 90}, ${L + 6} ${cy - 40}, ${L - 2} ${cy + 6} Z" fill="${color}"/>`;
    default:
      return "";
  }
}

const moustache = (cx, jaw, color) =>
  `<path d="M${cx} ${jaw + 16} C ${cx - 22} ${jaw + 4}, ${cx - 52} ${jaw + 8}, ${cx - 64} ${jaw + 36} C ${cx - 42} ${jaw + 26}, ${cx - 20} ${jaw + 30}, ${cx} ${jaw + 28}
    C ${cx + 20} ${jaw + 30}, ${cx + 42} ${jaw + 26}, ${cx + 64} ${jaw + 36} C ${cx + 52} ${jaw + 8}, ${cx + 22} ${jaw + 4}, ${cx} ${jaw + 16} Z" fill="${color}"/>`;

function beard(style, cx, cy, rx, ry, color) {
  const jaw = cy + ry * 0.2;
  const chin = cy + ry + 8;
  switch (style) {
    case "full":
      return `<path d="M${cx - rx + 4} ${cy - 6} C ${cx - rx + 2} ${chin - 40}, ${cx - 60} ${chin + 40}, ${cx} ${chin + 44} C ${cx + 60} ${chin + 40}, ${cx + rx - 2} ${chin - 40}, ${cx + rx - 4} ${cy - 6}
        C ${cx + rx - 24} ${jaw + 30}, ${cx + 50} ${jaw + 46}, ${cx} ${jaw + 40} C ${cx - 50} ${jaw + 46}, ${cx - rx + 24} ${jaw + 30}, ${cx - rx + 4} ${cy - 6} Z" fill="${color}"/>
        <path d="M${cx - 54} ${jaw + 22} C ${cx - 30} ${jaw + 6}, ${cx + 30} ${jaw + 6}, ${cx + 54} ${jaw + 22} C ${cx + 30} ${jaw + 20}, ${cx - 30} ${jaw + 20}, ${cx - 54} ${jaw + 22} Z" fill="${color}"/>`;
    case "short":
      return `<path d="M${cx - rx + 10} ${cy + 10} C ${cx - rx + 14} ${chin - 20}, ${cx - 50} ${chin + 14}, ${cx} ${chin + 16} C ${cx + 50} ${chin + 14}, ${cx + rx - 14} ${chin - 20}, ${cx + rx - 10} ${cy + 10}
        C ${cx + rx - 30} ${jaw + 50}, ${cx + 40} ${jaw + 60}, ${cx} ${jaw + 56} C ${cx - 40} ${jaw + 60}, ${cx - rx + 30} ${jaw + 50}, ${cx - rx + 10} ${cy + 10} Z" fill="${color}" fill-opacity=".8"/>
        ${moustache(cx, jaw, color)}`;
    case "moustache":
      return moustache(cx, jaw, color);
    default:
      return "";
  }
}

/** Front-facing, faceless figure. */
function figure({ cx = 600, cy = 400, rx = 128, ry = 158, skin, hairStyle, hairColor, beardStyle, shirt, apron = true, collar = C.paper }) {
  const [s, s2] = skin;
  return `
  <path d="M${cx - 330} 1000 C ${cx - 310} ${cy + 330}, ${cx - 170} ${cy + 250}, ${cx} ${cy + 250} C ${cx + 170} ${cy + 250}, ${cx + 310} ${cy + 330}, ${cx + 330} 1000 Z" fill="${shirt}"/>
  <path d="M${cx - 70} ${cy + 250} L ${cx} ${cy + 330} L ${cx + 70} ${cy + 250} Z" fill="${collar}"/>
  ${apron ? `<path d="M${cx - 150} ${cy + 290} L ${cx - 120} 1000 M${cx + 150} ${cy + 290} L ${cx + 120} 1000" stroke="${C.ink}" stroke-opacity=".55" stroke-width="16"/>` : ""}
  <rect x="${cx - 58}" y="${cy + 110}" width="116" height="160" rx="50" fill="${s2}"/>
  <ellipse cx="${cx - rx + 2}" cy="${cy + 20}" rx="24" ry="38" fill="${s2}"/>
  <ellipse cx="${cx + rx - 2}" cy="${cy + 20}" rx="24" ry="38" fill="${s2}"/>
  <ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="${s}"/>
  ${beard(beardStyle, cx, cy, rx, ry, hairColor)}
  ${hair(hairStyle, cx, cy, rx, ry, hairColor, s)}`;
}

const scissors = (x, y, k, color) => `<g transform="translate(${x} ${y}) scale(${k})" fill="none" stroke="${color}" stroke-width="7" stroke-linecap="round">
  <circle cx="58" cy="152" r="24"/><circle cx="142" cy="152" r="24"/><path d="M74 134 L156 22"/><path d="M126 134 L44 22"/></g>`;
const comb = (x, y, k, color) => `<g transform="translate(${x} ${y}) scale(${k})"><rect x="0" y="0" width="280" height="26" rx="8" fill="${color}"/>
  ${Array.from({ length: 17 }, (_, i) => `<rect x="${10 + i * 16}" y="22" width="7" height="${i < 9 ? 52 : 40}" rx="3" fill="${color}"/>`).join("")}</g>`;
const razor = (x, y, k) => `<g transform="translate(${x} ${y}) scale(${k})"><path d="M8 40 L118 22 L132 40 L118 58 Z" fill="${C.paper}"/>
  <path d="M118 22 L190 30 L190 50 L118 58" fill="none" stroke="${C.brass}" stroke-width="6" stroke-linejoin="round"/></g>`;

function hero() {
  const W = 1000, H = 1250;
  return { name: "hero", w: W, h: H, svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>${stripes("p1", 0, 0)}
    <radialGradient id="glow" cx="0.5" cy="0.38" r="0.6"><stop offset="0" stop-color="#2a3866"/><stop offset="1" stop-color="${C.ink}"/></radialGradient>
    <linearGradient id="shade" x1="0" x2="1"><stop offset="0" stop-color="#000" stop-opacity=".35"/><stop offset=".35" stop-color="#fff" stop-opacity=".18"/><stop offset=".6" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".4"/></linearGradient>
    <linearGradient id="brass" x1="0" x2="1"><stop offset="0" stop-color="#9b6b1f"/><stop offset=".45" stop-color="#f3cf7a"/><stop offset="1" stop-color="#8a5c17"/></linearGradient>
    <clipPath id="tube"><rect x="420" y="250" width="160" height="640" rx="80"/></clipPath></defs>
  <rect width="${W}" height="${H}" fill="url(#glow)"/>
  <circle cx="500" cy="560" r="330" fill="${C.ink2}"/>
  <circle cx="500" cy="560" r="330" fill="none" stroke="${C.paper}" stroke-opacity=".08" stroke-width="2"/>
  <g clip-path="url(#tube)"><rect x="420" y="250" width="160" height="640" fill="url(#p1)"/><rect x="420" y="250" width="160" height="640" fill="url(#shade)"/></g>
  <rect x="400" y="200" width="200" height="70" rx="16" fill="url(#brass)"/>
  <ellipse cx="500" cy="190" rx="70" ry="40" fill="url(#brass)"/>
  <rect x="400" y="870" width="200" height="70" rx="16" fill="url(#brass)"/>
  <rect x="470" y="940" width="60" height="70" fill="url(#brass)"/>
  ${scissors(110, 690, 1.25, C.brass)}
  ${comb(640, 330, 0.95, C.paper)}
  ${razor(650, 760, 1.6)}
  <g fill="${C.paper}" fill-opacity=".5">${Array.from({ length: 18 }, (_, i) => `<circle cx="${80 + ((i * 137) % 860)}" cy="${80 + ((i * 251) % 1100)}" r="${2 + (i % 3)}"/>`).join("")}</g>
  <rect x="0" y="${H - 18}" width="${W}" height="18" fill="url(#p1)"/>
</svg>` };
}

function portrait(name, opts, bg, accent) {
  const W = 1200, H = 900;
  return { name, w: W, h: H, svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>${stripes(`s-${name}`, 0, 0, C.red, C.paper, C.blue, 22)}</defs>
  <rect width="${W}" height="${H}" fill="${bg}"/>
  <circle cx="600" cy="420" r="300" fill="${accent}"/>
  <rect x="${W - 70}" y="0" width="70" height="${H}" fill="url(#s-${name})"/>
  <g transform="translate(0 30)">${figure(opts)}</g>
  ${scissors(70, 640, 0.9, bg === C.ink ? C.brass : C.ink)}
</svg>` };
}

function work(name, opts, bg, accent) {
  const W = 1000, H = 1000;
  return { name, w: W, h: H, svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="${bg}"/>
  <circle cx="500" cy="430" r="330" fill="${accent}"/>
  <g transform="translate(-100 70) scale(1)">${figure({ cx: 600, cy: 380, ...opts })}</g>
</svg>` };
}

const art = [
  hero(),
  portrait("barber-timur", { skin: SKIN.light, hairStyle: "part", hairColor: HAIR.brown, beardStyle: "moustache", shirt: C.blue }, C.sky, "#c7d1f0"),
  portrait("barber-alisher", { skin: SKIN.mid, hairStyle: "fade", hairColor: HAIR.black, beardStyle: "full", shirt: C.ink }, C.blush, "#ecc3b9"),
  portrait("barber-dmitry", { skin: SKIN.light, hairStyle: "buzz", hairColor: HAIR.dark, beardStyle: "short", shirt: C.red, collar: C.ink }, C.sand, "#e3d1b4"),
  work("work-fade", { skin: SKIN.mid, hairStyle: "fade", hairColor: HAIR.black, beardStyle: "", shirt: C.ink, apron: false }, C.ink, C.ink2),
  work("work-crop", { skin: SKIN.light, hairStyle: "crop", hairColor: HAIR.brown, beardStyle: "", shirt: C.red, apron: false }, C.paper, C.sky),
  work("work-beard", { skin: SKIN.tan, hairStyle: "buzz", hairColor: HAIR.black, beardStyle: "full", shirt: C.blue, apron: false }, C.blush, "#ecc3b9"),
  work("work-classic", { skin: SKIN.light, hairStyle: "part", hairColor: HAIR.dark, beardStyle: "", shirt: C.ink, apron: false }, C.sand, "#e3d1b4"),
  work("work-undercut", { skin: SKIN.mid, hairStyle: "undercut", hairColor: HAIR.dark, beardStyle: "short", shirt: C.red, apron: false }, C.ink, "#2a3866"),
  work("work-taper", { skin: SKIN.tan, hairStyle: "crop", hairColor: HAIR.black, beardStyle: "short", shirt: C.paper, collar: C.ink, apron: false }, C.blue, "#3d58d4"),
  work("work-shave", { skin: SKIN.light, hairStyle: "buzz", hairColor: HAIR.brown, beardStyle: "moustache", shirt: C.ink, apron: false }, C.paper, C.blush),
  work("work-gentleman", { skin: SKIN.mid, hairStyle: "part", hairColor: HAIR.black, beardStyle: "full", shirt: C.brass, apron: false }, C.ink, C.ink2),
  work("work-kid", { skin: SKIN.light, hairStyle: "kid", hairColor: HAIR.brown, beardStyle: "", shirt: C.brass, apron: false, rx: 118, ry: 140 }, C.sky, "#c7d1f0"),
];

const browser = await chromium.launch();
const page = await browser.newPage();
for (const a of art) {
  await page.setViewportSize({ width: a.w, height: a.h });
  await page.setContent(`<html><body style="margin:0">${a.svg}</body></html>`);
  const png = await page.locator("svg").screenshot();
  const webp = await sharp(png).webp({ quality: 86 }).toBuffer();
  writeFileSync(path.join(OUT, `${a.name}.webp`), webp);
  console.log(a.name, webp.length);
}
await browser.close();
