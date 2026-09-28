// Fixed 16-swatch palette, sampled from the reference video.
// The model only picks names + weights; it never invents hex values.
export const PALETTE = {
  black: "#000000",
  white: "#fcfcfc",
  gray: "#969696",
  cream: "#e4decc",
  brown: "#964e00",
  red: "#d81806",
  orange: "#f67800",
  yellow: "#fccc00",
  green: "#009624",
  teal: "#00c09c",
  "deep-teal": "#004254",
  blue: "#0078f6",
  indigo: "#2a3cd2",
  purple: "#7818ae",
  pink: "#fc84cc",
  lilac: "#fcb4fc",
};

export const COLOR_NAMES = Object.keys(PALETTE);
