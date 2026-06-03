export function formatMinorToRupee(minor: number): string {
  return `₹${(minor / 100).toFixed(2)}`;
}
