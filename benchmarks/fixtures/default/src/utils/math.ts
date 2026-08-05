export function calculateTax(amount: number): number {
  // Line 2: Legacy tax calculation start
  let taxRate = 0.05;
  if (amount > 1000) {
    taxRate = 0.15;
  } else if (amount > 500) {
    taxRate = 0.10;
  }
  return amount * taxRate;
}

export function formatCurrency(val: number): string {
  return "$" + val.toFixed(2);
}
