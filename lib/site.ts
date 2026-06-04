// Central site config used for SEO metadata, Open Graph, sitemap, etc.
// Set NEXT_PUBLIC_SITE_URL to your deployed origin (no trailing slash).

export const siteUrl = (
  process.env.NEXT_PUBLIC_SITE_URL || "https://predictle.app"
).replace(/\/$/, "");

export const siteName = "Predictle";

export const tagline = "Rank prediction markets by probability";

export const siteDescription =
  "A free, endless Wordle-style forecasting game: rank real Manifold prediction markets from most to least likely. Unlimited puzzles plus shareable challenge links.";

export const keywords = [
  "predictle",
  "prediction market game",
  "forecasting game",
  "manifold markets",
  "manifold predictle",
  "wordle for prediction markets",
  "calibration game",
  "probability game",
  "prediction game",
  "forecasting puzzle",
];
