
const COUNTER_KEY = "dream-billing-invoice-counter";

export function generateInvoiceNumber(): string {
  if (typeof window === "undefined") {
    throw new Error("Invoice numbers must be generated in the browser.");
  }

  const current = Number(
    window.localStorage.getItem(COUNTER_KEY) || "0"
  );

  const next = current + 1;

  window.localStorage.setItem(COUNTER_KEY, String(next));

  return `DD-${String(next).padStart(3, "0")}`;
}
