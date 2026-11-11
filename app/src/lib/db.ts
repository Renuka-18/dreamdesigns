
import { openDB, type IDBPDatabase } from "idb";

export type PaymentStatus = "Paid" | "Partially Paid" | "Unpaid";

export type SavedInvoice = {
  id: string;
  customerName: string;
  phone: string;
  saleType: string;
  items: { name: string; quantity: number; price: number }[];
  subtotal: number;
  gst: number;
  total: number;
  createdAt: string;
  syncStatus: "pending" | "synced";
  amountPaid?: number;
  balanceDue?: number;
  changeToReturn?: number;
  paymentStatus?: PaymentStatus;
};

export type PaymentMethod =
  | "Cash"
  | "UPI"
  | "Card"
  | "Bank Transfer"
  | "Other";

export type SavedPayment = {
  transactionId: string;
  invoiceNumber: string;
  amount: number;
  paymentMethod: PaymentMethod;
  paidAt: string;
  notes: string;
  syncStatus: "pending" | "synced";
};

type InvoiceBackup = {
  app: "Dream Designs s Billing";
  formatVersion: 1;
  exportedAt: string;
  invoices: SavedInvoice[];
};

const DB_NAME = "dream-billing";
const DB_VERSION = 2;
const INVOICES = "invoices";
const PAYMENTS = "payments";

let dbPromise: Promise<IDBPDatabase> | null = null;

function getDatabase(): Promise<IDBPDatabase> {
  if (typeof window === "undefined" || !("indexedDB" in window)) {
    return Promise.reject(new Error("IndexedDB is unavailable."));
  }

  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db, oldVersion) {
        if (!db.objectStoreNames.contains(INVOICES)) {
          db.createObjectStore(INVOICES, { keyPath: "id" });
        }

        if (!db.objectStoreNames.contains(PAYMENTS)) {
          db.createObjectStore(PAYMENTS, {
            keyPath: "transactionId",
          });
        }

        // Existing invoices are retained when the database version changes.
        console.info("Dream Designs s Billing database upgraded from", oldVersion);
      },
    }).catch((error) => {
      dbPromise = null;
      throw error;
    });
  }

  return dbPromise;
}

export async function saveInvoice(invoice: SavedInvoice): Promise<void> {
  const db = await getDatabase();
  await db.put(INVOICES, invoice);
}

export async function getInvoices(): Promise<SavedInvoice[]> {
  const db = await getDatabase();
  const invoices = (await db.getAll(INVOICES)) as SavedInvoice[];

  return invoices.sort(
    (a, b) =>
      new Date(b.createdAt).getTime() -
      new Date(a.createdAt).getTime()
  );
}

export async function getPendingInvoices(): Promise<SavedInvoice[]> {
  return (await getInvoices()).filter(
    (invoice) => invoice.syncStatus === "pending"
  );
}

export async function markInvoiceSynced(id: string): Promise<void> {
  const db = await getDatabase();
  const invoice = (await db.get(INVOICES, id)) as
    | SavedInvoice
    | undefined;

  if (invoice) {
    invoice.syncStatus = "synced";
    await db.put(INVOICES, invoice);
  }
}

export async function savePayment(
  payment: SavedPayment
): Promise<void> {
  const db = await getDatabase();
  await db.put(PAYMENTS, payment);
}

export async function getPayments(
  invoiceNumber?: string
): Promise<SavedPayment[]> {
  const db = await getDatabase();
  const payments = (await db.getAll(PAYMENTS)) as SavedPayment[];

  return payments
    .filter(
      (payment) =>
        !invoiceNumber || payment.invoiceNumber === invoiceNumber
    )
    .sort(
      (a, b) =>
        new Date(a.paidAt).getTime() - new Date(b.paidAt).getTime()
    );
}

export async function getPendingPayments(): Promise<SavedPayment[]> {
  return (await getPayments()).filter(
    (payment) => payment.syncStatus === "pending"
  );
}

export async function markPaymentSynced(
  transactionId: string
): Promise<void> {
  const db = await getDatabase();
  const payment = (await db.get(PAYMENTS, transactionId)) as
    | SavedPayment
    | undefined;

  if (payment) {
    payment.syncStatus = "synced";
    await db.put(PAYMENTS, payment);
  }
}

export async function exportInvoicesBackup(): Promise<void> {
  const invoices = await getInvoices();
  const payments = await getPayments();

  const backup = {
    app: "Dream Designs s Billing",
    formatVersion: 1,
    exportedAt: new Date().toISOString(),
    invoices,
    payments,
  };

  const blob = new Blob([JSON.stringify(backup, null, 2)], {
    type: "application/json",
  });

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `dream-billing-backup-${new Date()
    .toISOString()
    .slice(0, 10)}.json`;

  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function restoreInvoicesBackup(
  file: File
): Promise<{ imported: number; totalInBackup: number }> {
  if (!file.name.toLowerCase().endsWith(".json")) {
    throw new Error("Choose a Dream Designs s Billing JSON backup.");
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(await file.text());
  } catch {
    throw new Error("The backup file is not valid JSON.");
  }

  if (!parsed || typeof parsed !== "object") {
    throw new Error("Invalid backup.");
  }

  const backup = parsed as Partial<InvoiceBackup> & {
    payments?: SavedPayment[];
  };

  if (
    backup.app !== "Dream Designs s Billing" ||
    backup.formatVersion !== 1 ||
    !Array.isArray(backup.invoices)
  ) {
    throw new Error("Unsupported Dream Designs s Billing backup format.");
  }

  for (const invoice of backup.invoices) {
    if (
      !invoice ||
      typeof invoice.id !== "string" ||
      !invoice.id.trim() ||
      typeof invoice.customerName !== "string" ||
      !Array.isArray(invoice.items) ||
      !Number.isFinite(invoice.total) ||
      !Number.isFinite(invoice.subtotal) ||
      !Number.isFinite(invoice.gst)
    ) {
      throw new Error("Backup contains invalid invoice data.");
    }
  }

  const payments = backup.payments ?? [];

  for (const payment of payments) {
    if (
      !payment ||
      typeof payment.transactionId !== "string" ||
      !payment.transactionId.trim() ||
      typeof payment.invoiceNumber !== "string" ||
      !Number.isFinite(payment.amount) ||
      payment.amount <= 0
    ) {
      throw new Error("Backup contains invalid payment data.");
    }
  }

  const db = await getDatabase();
  const tx = db.transaction([INVOICES, PAYMENTS], "readwrite");

  try {
    for (const invoice of backup.invoices) {
      await tx.objectStore(INVOICES).put(invoice);
    }

    for (const payment of payments) {
      await tx.objectStore(PAYMENTS).put(payment);
    }

    await tx.done;
  } catch (error) {
    try {
      tx.abort();
    } catch {
      // Transaction may already have aborted.
    }
    throw error;
  }

  return {
    imported: backup.invoices.length,
    totalInBackup: backup.invoices.length,
  };
}

function csvCell(value: unknown): string {
  let text = String(value ?? "");

  if (/^[\s]*[=+\-@]/.test(text)) {
    text = `'${text}`;
  }

  return `"${text.replace(/"/g, '""')}"`;
}

export async function exportInvoicesCsv(): Promise<void> {
  const invoices = await getInvoices();
  const payments = await getPayments();

  const headers = [
    "Invoice Number",
    "Date",
    "Customer Name",
    "Phone",
    "Sale Type",
    "Product",
    "Quantity",
    "Unit Price",
    "Subtotal",
    "GST",
    "Total",
    "Amount Paid",
    "Balance Due",
    "Payment Status",
    "Payment Transactions",
  ];

  const rows: unknown[][] = [];

  for (const invoice of invoices) {
    const paid = Number(invoice.amountPaid ?? 0);
    const balance = Math.max(
      0,
      Number(invoice.total ?? 0) - paid
    );

    const status: PaymentStatus =
      paid >= Number(invoice.total)
        ? "Paid"
        : paid > 0
          ? "Partially Paid"
          : "Unpaid";

    const invoicePayments = payments.filter(
      (payment) => payment.invoiceNumber === invoice.id
    );

    for (const item of invoice.items) {
      rows.push([
        invoice.id,
        new Date(invoice.createdAt).toLocaleString("en-IN"),
        invoice.customerName,
        invoice.phone,
        invoice.saleType,
        item.name,
        item.quantity,
        item.price,
        invoice.subtotal,
        invoice.gst,
        invoice.total,
        paid,
        balance,
        status,
        invoicePayments.length,
      ]);
    }
  }

  const csv = [
    headers.map(csvCell).join(","),
    ...rows.map((row) => row.map(csvCell).join(",")),
  ].join("\r\n");

  const blob = new Blob(["\uFEFF", csv], {
    type: "text/csv;charset=utf-8;",
  });

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `dream-billing-invoices-${new Date()
    .toISOString()
    .slice(0, 10)}.csv`;

  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
