/**
 * Spell out an amount for receipts, e.g. 12500.5 → "Twelve thousand five
 * hundred and 50/100". Uses the international short scale (thousand,
 * million, billion) which reads correctly for every supported currency.
 */

const ONES = [
  "zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten",
  "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen",
];
const TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];
const SCALES = ["", "thousand", "million", "billion"];

function belowThousand(n: number): string {
  const parts: string[] = [];
  const hundreds = Math.floor(n / 100);
  const rest = n % 100;
  if (hundreds) parts.push(`${ONES[hundreds]} hundred`);
  if (rest) {
    if (rest < 20) parts.push(ONES[rest]!);
    else parts.push(TENS[Math.floor(rest / 10)]! + (rest % 10 ? `-${ONES[rest % 10]}` : ""));
  }
  return parts.join(" ");
}

export function amountInWords(amount: number): string {
  if (!Number.isFinite(amount)) return "";
  const abs = Math.abs(amount);
  let whole = Math.floor(abs + 1e-9);
  const cents = Math.round((abs - whole) * 100);
  if (whole > 999_999_999_999) return "";

  let words: string;
  if (whole === 0) words = "zero";
  else {
    const chunks: string[] = [];
    let scale = 0;
    while (whole > 0) {
      const chunk = whole % 1000;
      if (chunk) chunks.unshift(`${belowThousand(chunk)}${SCALES[scale] ? ` ${SCALES[scale]}` : ""}`);
      whole = Math.floor(whole / 1000);
      scale += 1;
    }
    words = chunks.join(" ");
  }
  const text = cents ? `${words} and ${String(cents).padStart(2, "0")}/100` : `${words} only`;
  const full = (amount < 0 ? "minus " : "") + text;
  return full.charAt(0).toUpperCase() + full.slice(1);
}
