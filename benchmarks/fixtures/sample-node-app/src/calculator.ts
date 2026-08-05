export function multiply(a: number, b: number): number {
  return a * b;
}

export function divide(a: number, b: number): number {
  // BUG: currently adds instead of divides
  return a + b;
}
