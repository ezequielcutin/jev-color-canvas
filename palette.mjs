// Named swatches the model may choose. It never invents hex values.
// The original 16 keep their hexes. The rest fill the gaps between them
// (dusty lights against candy brights) so "Wes Anderson" and "Miami" can
// pick different cells of the same hue.
//
// ORDER is the shader's fixed slot order: a hue path, light to deep inside
// each family, neutrals at the ends. Only weights change, so one answer
// eases into the next.

const SWATCHES = [
  ["white", "#fcfcfc", "pure white"],
  ["ivory", "#f6edd6", "warm white"],
  ["cream", "#e4decc", "pale warm yellow"],
  ["sand", "#e4c89a", "light warm beige"],
  ["tan", "#c6a36e", "medium tan"],
  ["lemon", "#f4f06a", "bright pale yellow"],
  ["yellow", "#fccc00", "vivid yellow"],
  ["gold", "#e0a818", "deep golden yellow"],
  ["mustard", "#c4a000", "muted dark yellow"],
  ["ochre", "#c47c2a", "earthy yellow-orange"],
  ["amber", "#ffb000", "clear orange-yellow"],
  ["orange", "#f67800", "vivid orange"],
  ["peach", "#ffb59a", "pale orange"],
  ["terracotta", "#c4623a", "burnt clay"],
  ["rust", "#8e3010", "dark reddish orange"],
  ["copper", "#e09455", "orange-brown metal"],
  ["brown", "#964e00", "warm mid brown"],
  ["umber", "#6b3a22", "dark neutral brown"],
  ["coral", "#ff6b5a", "pinkish orange"],
  ["red", "#d81806", "vivid red"],
  ["wine", "#a45c68", "muted red"],
  ["crimson", "#a01038", "deep cool red"],
  ["burgundy", "#6e1632", "dark red"],
  ["blush", "#f0b7c0", "dusty pale pink"],
  ["rose", "#d47888", "muted medium pink"],
  ["pink", "#fc84cc", "candy pink"],
  ["hot-pink", "#ff2d8a", "neon pink"],
  ["magenta", "#c4006a", "vivid pink-purple"],
  ["lilac", "#fcb4fc", "pale pink-purple"],
  ["lavender", "#c4b4e4", "soft light purple"],
  ["mauve", "#a888a0", "dusty purple"],
  ["purple", "#7818ae", "vivid purple"],
  ["plum", "#6a3058", "dark muted purple"],
  ["violet", "#7a4ad4", "bright blue-purple"],
  ["periwinkle", "#8e96e0", "pale blue-purple"],
  ["sky", "#7ec8f0", "light sky blue"],
  ["ice", "#c6eef4", "very pale cyan"],
  ["blue", "#0078f6", "vivid blue"],
  ["cobalt", "#0047ab", "deep pure blue"],
  ["indigo", "#2a3cd2", "blue-purple"],
  ["navy", "#0c1f5c", "dark blue"],
  ["denim", "#3d5a80", "muted medium blue"],
  ["ink", "#14182a", "near-black blue"],
  ["aqua", "#3ee0dc", "bright light cyan"],
  ["cyan", "#00c8dc", "vivid cyan"],
  ["turquoise", "#14b4b8", "blue-green"],
  ["teal", "#00c09c", "bright blue-green"],
  ["deep-teal", "#004254", "dark blue-green"],
  ["mint", "#7ee0a8", "pale green"],
  ["lime", "#b6e000", "bright yellow-green"],
  ["chartreuse", "#d6e24a", "vivid yellow-green"],
  ["green", "#009624", "vivid green"],
  ["emerald", "#0c8a58", "rich mid green"],
  ["sage", "#9aaf88", "dusty gray-green"],
  ["olive", "#6e7030", "muted yellow-green"],
  ["moss", "#4a6834", "dark muted green"],
  ["forest", "#1a4d30", "deep green"],
  ["pine", "#1a5c58", "deep blue-green"],
  ["khaki", "#8a8440", "dusty yellow-green"],
  ["slate", "#5c6b7a", "cool gray-blue"],
  ["warm-gray", "#8d7568", "brownish gray"],
  ["gray", "#969696", "neutral gray"],
  ["charcoal", "#3a3a3a", "near-black gray"],
  ["black", "#000000", "pure black"],
];

export const ORDER = SWATCHES.map(([name]) => name);
export const PALETTE = Object.fromEntries(SWATCHES.map(([name, hex]) => [name, hex]));
export const GLOSS = Object.fromEntries(SWATCHES.map(([name, , gloss]) => [name, gloss]));
export const COLOR_NAMES = ORDER;

// What a Choice question shows for each swatch: the name, a plain gloss, and the hex.
export function colourCriteria() {
  return Object.fromEntries(ORDER.map((name) => [name, `${name} (${GLOSS[name]}, ${PALETTE[name]})`]));
}
