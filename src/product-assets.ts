export function getProductAssetPath(title: string): string | undefined {
  const lower = title.toLowerCase()

  if (lower.includes('dog') || lower.includes('urine')) {
    return 'assets/products/dog-urine.png'
  }

  if (lower.includes('hay') || lower.includes('pasture')) {
    return 'assets/products/hay-pasture.png'
  }

  if (lower.includes('lawn')) {
    return 'assets/products/lawn-fertilizer.png'
  }

  if (lower.includes('fruit') || lower.includes('tree')) {
    return 'assets/products/fruit-tree.png'
  }

  return undefined
}
