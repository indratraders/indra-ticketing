export { cn } from "./cn";
export * from "./date";

/** Queue display number: 1 … 50 (no letter prefix) */
export function formatDisplayToken(sequence: number): string {
  return String(sequence);
}

/** Unique customer code: C0001, C0002, … */
export function formatCustomerCode(prefix: string, sequence: number): string {
  const clean = (prefix || "C").toUpperCase().replace(/[^A-Z]/g, "") || "C";
  return `${clean}${String(sequence).padStart(4, "0")}`;
}

/** @deprecated Use formatDisplayToken — kept for older call sites */
export function formatTokenNumber(_prefix: string, sequence: number): string {
  return formatDisplayToken(sequence);
}

export function vehicleDisplayName(brand: string, model: string): string {
  if (brand.toLowerCase() === "other") return model;
  return `${brand} ${model}`;
}

export function speakTokenNumber(tokenNumber: string): string {
  // "12" -> "Token twelve" / "1" -> "Token one"
  // Also supports legacy "A-012" if present
  const raw = tokenNumber.includes("-")
    ? (tokenNumber.split("-")[1] ?? tokenNumber)
    : tokenNumber;
  const n = Number(raw);
  if (!Number.isFinite(n)) return `Token ${tokenNumber}`;

  const ones = [
    "zero",
    "one",
    "two",
    "three",
    "four",
    "five",
    "six",
    "seven",
    "eight",
    "nine",
    "ten",
    "eleven",
    "twelve",
    "thirteen",
    "fourteen",
    "fifteen",
    "sixteen",
    "seventeen",
    "eighteen",
    "nineteen",
  ];
  const tens = [
    "",
    "",
    "twenty",
    "thirty",
    "forty",
    "fifty",
    "sixty",
    "seventy",
    "eighty",
    "ninety",
  ];

  let spoken: string;
  if (n < 20) spoken = ones[n] ?? String(n);
  else if (n < 100) {
    const t = Math.floor(n / 10);
    const o = n % 10;
    spoken = o === 0 ? tens[t] : `${tens[t]} ${ones[o]}`;
  } else {
    spoken = String(n);
  }

  return `Token ${spoken}`;
}

export function sanitizeString(value: string): string {
  return value.replace(/[<>]/g, "").trim();
}
