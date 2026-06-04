// Copied verbatim from the Manifold repo (common/src/envs/constants.ts), with
// nested spreads resolved, so Predictle excludes exactly the same groups.

const RATING_GROUP_SLUGS = ["nonpredictive", "unsubsidized"];
const DESTINY_GROUP_SLUG = "destinygg";
const PROD_MANIFOLD_LOVE_GROUP_SLUG = "manifoldlove-relationships";

const GROUP_SLUGS_TO_IGNORE_IN_MARKETS_EMAIL = [
  "manifold-6748e065087e",
  "manifold-features-25bad7c7792e",
  "bugs",
  "manifold-leagues",
  ...RATING_GROUP_SLUGS,
  DESTINY_GROUP_SLUG,
  PROD_MANIFOLD_LOVE_GROUP_SLUG,
];

export const HIDE_FROM_NEW_USER_SLUGS = [
  "fun",
  "selfresolving",
  "experimental",
  "trading-bots",
  "gambling",
  "free-money",
  "mana",
  "whale-watching",
  "spam",
  "test",
  "no-resolution",
  "eto",
  "friend-stocks",
  "ancient-markets",
  "jokes",
  "planecrash",
  "glowfic",
  "all-stonks",
  "the-market",
  "nonpredictive-profits",
  "personal-goals",
  "personal",
  "rationalussy",
  "nsfw",
  "manifold-6748e065087e",
  "bugs",
  "new-years-resolutions-2024",
  "metamarkets",
  "metaforecasting",
  "death-markets",
  ...GROUP_SLUGS_TO_IGNORE_IN_MARKETS_EMAIL,
];
