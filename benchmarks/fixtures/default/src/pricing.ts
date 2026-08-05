export function calculateDiscount(price: number, discountPercent: number): number {
  return price - (price * (discountPercent / 100));
}
