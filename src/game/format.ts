// "$1,234" style money for integer dollars; negatives as "-$54".
export function formatMoney(amount: number): string {
  const sign = amount < 0 ? "-" : "";
  const digits = Math.abs(amount).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${sign}$${digits}`;
}
