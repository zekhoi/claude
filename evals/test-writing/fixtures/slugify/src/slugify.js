/**
 * Converts text into a URL slug: lowercase ASCII letters and digits separated by single hyphens,
 * with no leading or trailing hyphens. Throws a TypeError for non-string input.
 */
export function slugify(text) {
  if (typeof text !== "string") throw new TypeError("text must be a string");
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
