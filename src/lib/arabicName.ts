/**
 * Normalizes an Arabic (or mixed) name for fuzzy matching.
 *
 * - Trims and collapses whitespace
 * - Strips Arabic diacritics (tashkeel)
 * - Unifies common letter variants (alef forms, yaa / alef maksura, taa
 *   marbuta vs haa, hamza variants)
 * - Lowercases (for any Latin part)
 *
 * Two names that look "the same" to a human but were typed slightly
 * differently should produce the same normalized string here.
 */
export function normalizeArabicName(input: string): string {
  return input
    .trim()
    .replace(/\s+/g, " ")
    // Strip Arabic diacritics (fathah, kasrah, dammah, sukoon, shadda, etc.)
    .replace(/[ً-ْٰـ]/g, "")
    // Alef variants -> bare alef
    .replace(/[آأإٱ]/g, "ا")
    // Alef maksura -> yaa
    .replace(/ى/g, "ي")
    // Taa marbuta -> haa (so "مدرسة" matches "مدرسه")
    .replace(/ة/g, "ه")
    // Hamza on waw / yaa
    .replace(/ؤ/g, "و")
    .replace(/ئ/g, "ي")
    .toLowerCase();
}
