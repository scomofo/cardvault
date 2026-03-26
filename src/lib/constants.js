export const CONDITIONS = [
  { v: "gem_mint", l: "Gem Mint 10", s: "GM", c: "#c9a96e" },
  { v: "mint", l: "Mint 9", s: "M", c: "#5a9e6f" },
  { v: "near_mint", l: "Near Mint 8", s: "NM", c: "#5a9e8f" },
  { v: "excellent", l: "Excellent 7", s: "EX", c: "#6b8cae" },
  { v: "very_good", l: "Very Good 6", s: "VG", c: "#9b7fb8" },
  { v: "good", l: "Good 5", s: "G", c: "#c89040" },
  { v: "fair", l: "Fair 4", s: "F", c: "#b87048" },
  { v: "poor", l: "Poor", s: "P", c: "#c7453b" },
];

export const TYPES = [
  { v: "sports", l: "Sports", i: "\u26be" },
  { v: "pokemon", l: "Pok\u00e9mon", i: "\u26a1" },
  { v: "mtg", l: "MTG", i: "\ud83e\uddd9" },
  { v: "yugioh", l: "Yu-Gi-Oh!", i: "\ud83d\udc41\ufe0f" },
  { v: "one_piece", l: "One Piece", i: "\ud83c\udff4\u200d\u2620\ufe0f" },
  { v: "lorcana", l: "Lorcana", i: "\u2728" },
  { v: "other", l: "Other", i: "\ud83c\udccf" },
];

export const PLATFORMS = [
  { v: "ebay", l: "eBay" },
  { v: "tcgplayer", l: "TCGplayer" },
  { v: "mercari", l: "Mercari" },
  { v: "facebook", l: "FB Mkt" },
  { v: "collx", l: "CollX" },
  { v: "poshmark", l: "Poshmark" },
  { v: "comc", l: "COMC" },
  { v: "alt", l: "Alt" },
  { v: "goldin", l: "Goldin" },
  { v: "shopify", l: "Shopify" },
];

export const SHIP_CA = [
  { l: "Canada Post Lettermail", p: "$1.44", w: "\u226430g", t: "2-4 days", track: false },
  { l: "Canada Post Tracked Packet", p: "~$13", w: "\u22642kg", t: "4-7 days", track: true },
  { l: "Canada Post Xpresspost", p: "~$16+", w: "\u226430kg", t: "1-2 days", track: true },
  { l: "Canada Post Small Packet USA", p: "~$8-12", w: "\u22642kg", t: "5-8 days", track: false },
  { l: "Canada Post Tracked Packet USA", p: "~$13-28", w: "\u22642kg", t: "4-7 days", track: true },
];

export const EMPTY_CARD = {
  name: "", set: "", year: "", number: "", type: "sports",
  rarity: "", condition: "near_mint", notes: "", parallel: "",
  binder: "", costBasis: "", status: "inventory", listedOn: [],
};

export const EMPTY_LISTING = {
  platform: "ebay", price: "", title: "", description: "", shipping: "4.99",
};
