// Preserve alphanumeric catalogue numbers in the existing identity field.
// Numeric entries remain numbers; a supplied suffix is significant for matching.
export const parseCatalogueNumber = value => {
  const match = String(value ?? '').match(/^(\d+)([a-z]?)$/i)
  return { number: match ? Number(match[1]) : null, suffix: match?.[2].toLowerCase() || '' }
}
