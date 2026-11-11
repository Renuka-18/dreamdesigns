"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  exportInvoicesBackup,
  exportInvoicesCsv,
  getInvoices,
  getPendingInvoices,
  getPendingPayments,
  markInvoiceSynced,
  markPaymentSynced,
  restoreInvoicesBackup,
  saveInvoice,
  savePayment,
  type PaymentMethod,
  type PaymentStatus,
  type SavedInvoice,
  type SavedPayment,
} from "../src/lib/db";
import InvoicePrint from "../components/Invoiceprint";

type InvoiceWithPayment = SavedInvoice & {
  amountPaid?: number;
  balanceDue?: number;
  changeToReturn?: number;
  paymentStatus?: PaymentStatus;
};

const API_BASE =
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/+$/, "") ||
  "http://localhost:5000/api";

const PAYMENT_METHODS: PaymentMethod[] = [
  "Cash",
  "UPI",
  "Card",
  "Bank Transfer",
  "Other",
];

const money = (amount: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(amount);

function getPaymentStatus(invoice: InvoiceWithPayment): PaymentStatus {
  const paid = Number(invoice.amountPaid ?? 0);
  const total = Number(invoice.total ?? 0);

  if (total > 0 && paid >= total) return "Paid";
  if (paid > 0) return "Partially Paid";
  return "Unpaid";
}

function getBalance(invoice: InvoiceWithPayment) {
  return Math.max(
    Number(invoice.total ?? 0) - Number(invoice.amountPaid ?? 0),
    0
  );
}

function getStatusClasses(status: PaymentStatus) {
  if (status === "Paid") return "bg-green-100 text-green-800";
  if (status === "Partially Paid") return "bg-amber-100 text-amber-800";
  return "bg-red-100 text-red-800";
}

function makeTransactionId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `PAY-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}

async function readResponse(response: Response) {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(
      typeof data?.message === "string"
        ? data.message
        : `Request failed (${response.status}).`
    );
  }
  return data;
}

function getServerInvoiceNumber(invoice: InvoiceWithPayment) {
  // The Express API uses invoiceNumber. Local invoice IDs are generated
  // as invoice numbers (for example DD-006), so id is the fallback.
  return invoice.id;
}
async function fetchAndMergeServerInvoices(): Promise<InvoiceWithPayment[]> {
  const response = await fetch(`${API_BASE}/invoices`, {
    cache: "no-store",
  });

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(data?.message || "Could not fetch cloud invoices.");
  }

  if (!Array.isArray(data)) {
    throw new Error("Invalid response from invoices API.");
  }

  const localInvoices = (await getInvoices()) as InvoiceWithPayment[];

  const localById = new Map(
    localInvoices.map((invoice) => [invoice.id, invoice])
  );

  for (const serverInvoice of data) {
    const invoiceNumber = serverInvoice.invoiceNumber;

    if (!invoiceNumber) continue;

    const localInvoice = localById.get(invoiceNumber);

    // Never overwrite an unsynced local invoice with older server data.
    if (localInvoice?.syncStatus === "pending") continue;

    const syncedInvoice: InvoiceWithPayment = {
      id: invoiceNumber,
      customerName: serverInvoice.customerName,
      phone: serverInvoice.phone || "",
      saleType: serverInvoice.saleType,
      items: serverInvoice.items || [],
      subtotal: Number(serverInvoice.subtotal || 0),
      gst: Number(serverInvoice.gst || 0),
      total: Number(serverInvoice.total || 0),
      amountPaid: Number(serverInvoice.amountPaid || 0),
      balanceDue: Number(serverInvoice.balanceDue || 0),
      changeToReturn: Number(serverInvoice.changeToReturn || 0),
      paymentStatus: serverInvoice.paymentStatus || "Unpaid",
      createdAt:
        serverInvoice.deviceCreatedAt ||
        serverInvoice.createdAt ||
        new Date().toISOString(),
      syncStatus: "synced",
    };

    await saveInvoice(syncedInvoice);
  }

  return (await getInvoices()) as InvoiceWithPayment[];
}
export default function InvoiceHistoryPage() {
  const [invoices, setInvoices] = useState<InvoiceWithPayment[]>([]);
  const [search, setSearch] = useState("");
  const [selectedInvoice, setSelectedInvoice] =
    useState<InvoiceWithPayment | null>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [backupBusy, setBackupBusy] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("Cash");
  const [paymentNotes, setPaymentNotes] = useState("");
  const [paymentSaving, setPaymentSaving] = useState(false);
  const [syncBusy, setSyncBusy] = useState(false);
  const [online, setOnline] = useState(true);
  const fileInputRef = useRef<HTMLInputElement>(null);

 const refreshInvoices = useCallback(async () => {
  let result: InvoiceWithPayment[];

  try {
    result = await fetchAndMergeServerInvoices();
  } catch (error) {
    console.error("Cloud invoice fetch failed:", error);
    result = (await getInvoices()) as InvoiceWithPayment[];
  }

  setInvoices(result);

  setSelectedInvoice((current) => {
    if (!current) return null;

    return result.find((invoice) => invoice.id === current.id) ?? current;
  });
}, []);

  useEffect(() => {
    let active = true;

    async function loadInvoices() {
      try {
        const result = await fetchAndMergeServerInvoices();
        if (active) setInvoices(result as InvoiceWithPayment[]);
      } catch (err) {
        console.error("Could not load invoice history:", err);
        if (active) setError("Could not load invoices from local storage.");
      } finally {
        if (active) setLoading(false);
      }
    }

    void loadInvoices();

    const updateOnline = () => setOnline(navigator.onLine);
    updateOnline();
    window.addEventListener("online", updateOnline);
    window.addEventListener("offline", updateOnline);

    return () => {
      active = false;
      window.removeEventListener("online", updateOnline);
      window.removeEventListener("offline", updateOnline);
    };
  }, []);

  const filteredInvoices = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return invoices;

    return invoices.filter((invoice) =>
      [invoice.id, invoice.customerName, invoice.phone, invoice.saleType].some(
        (value) => String(value ?? "").toLowerCase().includes(term)
      )
    );
  }, [invoices, search]);

  async function handleExportBackup() {
    setBackupBusy(true);
    setError("");
    setNotice("");
    try {
      await exportInvoicesBackup();
      setNotice("JSON backup exported. Keep the downloaded file somewhere safe.");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not export the backup."
      );
    } finally {
      setBackupBusy(false);
    }
  }

  async function handleExportCsv() {
    setBackupBusy(true);
    setError("");
    setNotice("");
    try {
      await exportInvoicesCsv();
      setNotice("CSV exported successfully. You can open it in Excel.");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not export invoices."
      );
    } finally {
      setBackupBusy(false);
    }
  }

  async function handleRestoreBackup(file?: File) {
    if (!file) return;
    setBackupBusy(true);
    setError("");
    setNotice("");

    try {
      const result = await restoreInvoicesBackup(file);
      await refreshInvoices();
      setNotice(
        `Backup restored. ${result.imported} invoice(s) processed. Existing matching IDs were updated.`
      );
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not restore the backup."
      );
    } finally {
      setBackupBusy(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  /**
   * Push a locally saved invoice to the backend before sending its payments.
   * The backend /sync route must preserve payment totals for existing invoices.
   */
  async function syncInvoiceToServer(
    invoice: InvoiceWithPayment,
    paidBeforePendingPayments?: number
  ) {
    const amountPaidForSync =
      paidBeforePendingPayments ?? Number(invoice.amountPaid ?? 0);

    const payload = {
      id: invoice.id,
      invoiceNumber: getServerInvoiceNumber(invoice),
      customerName: invoice.customerName,
      phone: invoice.phone || "",
      saleType: invoice.saleType,
      items: invoice.items,
      subtotal: Number(invoice.subtotal),
      gst: Number(invoice.gst),
      total: Number(invoice.total),
      createdAt: invoice.createdAt,
      // Never import queued transactions as historical paid money;
      // they will be posted individually below using transactionId.
      amountPaid: Math.max(0, Math.min(Number(invoice.total), amountPaidForSync)),
      balanceDue: Math.max(0, Number(invoice.total) - amountPaidForSync),
      changeToReturn: 0,
    };

    const response = await fetch(`${API_BASE}/invoices/sync`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    await readResponse(response);
    await markInvoiceSynced(invoice.id);
  }

  /**
   * Retry queued transactions with the SAME transactionId. The server's
   * payment route must enforce transactionId idempotency.
   */
  async function syncPendingData() {
    if (!navigator.onLine) {
      throw new Error("You are offline. Payments are saved locally and can sync later.");
    }

    setSyncBusy(true);
    setError("");
    setNotice("");

    let syncedPayments = 0;
    let failedPayments = 0;

    try {
      const pendingInvoices = (await getPendingInvoices()) as InvoiceWithPayment[];
      const pendingPayments = (await getPendingPayments()) as SavedPayment[];

      // Local amountPaid already includes queued payments. Subtract them before
      // syncing an invoice, otherwise the server would count them twice.
      const queuedAmountByInvoice = new Map<string, number>();
      for (const payment of pendingPayments) {
        queuedAmountByInvoice.set(
          payment.invoiceNumber,
          (queuedAmountByInvoice.get(payment.invoiceNumber) ?? 0) + payment.amount
        );
      }

      for (const invoice of pendingInvoices) {
        try {
          const basePaid =
            Number(invoice.amountPaid ?? 0) -
            (queuedAmountByInvoice.get(invoice.id) ?? 0);
          await syncInvoiceToServer(invoice, Math.max(0, basePaid));
        } catch (err) {
          console.error("Invoice sync failed:", invoice.id, err);
          // A payment for this invoice must not be sent until invoice sync works.
        }
      }

      for (const payment of pendingPayments) {
        try {
          const invoice = invoices.find(
            (item) => item.id === payment.invoiceNumber
          ) ?? (await getInvoices()).find(
            (item) => item.id === payment.invoiceNumber
          ) as InvoiceWithPayment | undefined;

          if (!invoice) {
            throw new Error(`Invoice ${payment.invoiceNumber} is not available locally.`);
          }

          // Ensure invoice exists on server with only payments already recorded
          // there; pending local transactions are posted separately below.
          const basePaid =
            Number(invoice.amountPaid ?? 0) -
            (queuedAmountByInvoice.get(invoice.id) ?? 0);
          await syncInvoiceToServer(invoice, Math.max(0, basePaid));

          const response = await fetch(
            `${API_BASE}/invoices/${encodeURIComponent(payment.invoiceNumber)}/payments`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                transactionId: payment.transactionId,
                amount: payment.amount,
                paymentMethod: payment.paymentMethod,
                paidAt: payment.paidAt,
                notes: payment.notes,
              }),
            }
          );

          const data = await readResponse(response);
          await markPaymentSynced(payment.transactionId);

          if (data.invoice) {
            const serverInvoice = data.invoice;
            const updated: InvoiceWithPayment = {
              ...invoice,
              amountPaid: Number(serverInvoice.amountPaid ?? invoice.amountPaid ?? 0),
              balanceDue: Number(serverInvoice.balanceDue ?? 0),
              changeToReturn: Number(serverInvoice.changeToReturn ?? 0),
              paymentStatus: serverInvoice.paymentStatus ?? getPaymentStatus(invoice),
              syncStatus: "synced",
            };

            await saveInvoice(updated);
          }

          syncedPayments += 1;
        } catch (err) {
          failedPayments += 1;
          console.error("Payment sync failed:", payment.transactionId, err);
        }
      }

      await refreshInvoices();

      if (failedPayments > 0) {
        setNotice(
          `${syncedPayments} payment(s) synced. ${failedPayments} payment(s) remain pending; check the API and retry.`
        );
      } else {
        setNotice(
          syncedPayments > 0
            ? `${syncedPayments} pending payment(s) synced successfully.`
            : "Sync completed. No pending payments were found."
        );
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not sync pending data."
      );
    } finally {
      setSyncBusy(false);
    }
  }

  async function handleCollectPayment() {
    if (!selectedInvoice) return;
    setError("");
    setNotice("");

    const amount = Number(paymentAmount);
    const total = Number(selectedInvoice.total ?? 0);
    const alreadyPaid = Number(selectedInvoice.amountPaid ?? 0);
    const balance = getBalance(selectedInvoice);

    if (!Number.isFinite(amount) || amount <= 0) {
      setError("Enter a payment amount greater than zero.");
      return;
    }
    if (balance <= 0) {
      setError("This invoice is already fully paid.");
      return;
    }
    if (amount > balance + 0.000001) {
      setError(`Payment cannot exceed the remaining balance of ${money(balance)}.`);
      return;
    }

    setPaymentSaving(true);

    const transactionId = makeTransactionId();
    const payment: SavedPayment = {
      transactionId,
      invoiceNumber: getServerInvoiceNumber(selectedInvoice),
      amount,
      paymentMethod,
      paidAt: new Date().toISOString(),
      notes: paymentNotes.trim(),
      syncStatus: "pending",
    };

    const updatedPaid = Math.min(alreadyPaid + amount, total);
    const updatedBalance = Math.max(total - updatedPaid, 0);
    const updatedStatus: PaymentStatus =
      updatedBalance <= 0
        ? "Paid"
        : updatedPaid > 0
          ? "Partially Paid"
          : "Unpaid";

    const updatedInvoice: InvoiceWithPayment = {
      ...selectedInvoice,
      amountPaid: updatedPaid,
      balanceDue: updatedBalance,
      changeToReturn: 0,
      paymentStatus: updatedStatus,
      syncStatus: "pending",
    };

    try {
      // Save both locally first, so the sale is not lost if the network fails.
      await savePayment(payment);
      await saveInvoice(updatedInvoice);

      setSelectedInvoice(updatedInvoice);
      setInvoices((previous) =>
        previous.map((invoice) =>
          invoice.id === updatedInvoice.id ? updatedInvoice : invoice
        )
      );
      setPaymentAmount("");
      setPaymentNotes("");

      if (!navigator.onLine) {
        setNotice(
          `Payment saved offline. ${money(updatedBalance)} remains due. It will sync when you're online.`
        );
        return;
      }

      try {
        // Create/find the invoice first, then record the unique payment.
        await syncInvoiceToServer({
          ...selectedInvoice,
          // Send the pre-payment amountPaid to avoid importing this new
          // payment as historical money before its transaction is posted.
          amountPaid: alreadyPaid,
          balanceDue: Math.max(total - alreadyPaid, 0),
        });

        const response = await fetch(
          `${API_BASE}/invoices/${encodeURIComponent(payment.invoiceNumber)}/payments`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              transactionId,
              amount,
              paymentMethod,
              paidAt: payment.paidAt,
              notes: payment.notes,
            }),
          }
        );

        const data = await readResponse(response);
        await markPaymentSynced(transactionId);

        if (data.invoice) {
          const serverInvoice = data.invoice;
          const finalInvoice: InvoiceWithPayment = {
            ...updatedInvoice,
            amountPaid: Number(serverInvoice.amountPaid ?? updatedPaid),
            balanceDue: Number(serverInvoice.balanceDue ?? updatedBalance),
            changeToReturn: Number(serverInvoice.changeToReturn ?? 0),
            paymentStatus: serverInvoice.paymentStatus ?? updatedStatus,
            syncStatus: "synced",
          };

          await saveInvoice(finalInvoice);
          setSelectedInvoice(finalInvoice);
          setInvoices((previous) =>
            previous.map((invoice) =>
              invoice.id === finalInvoice.id ? finalInvoice : invoice
            )
          );
        }

        setNotice(
          updatedStatus === "Paid"
            ? "Payment recorded. This invoice is now Paid."
            : `Payment recorded. Remaining balance: ${money(updatedBalance)}.`
        );
      } catch (syncErr) {
        // Local payment remains pending; a retry reuses its transaction ID.
        console.error("Payment saved locally but server sync failed:", syncErr);
        setNotice(
          `Payment saved on this device but could not sync to the server. Remaining balance: ${money(updatedBalance)}. Use Sync Pending Data when the API is available.`
        );
      }
    } catch (err) {
      console.error("Could not save payment locally:", err);
      setError(
        err instanceof Error
          ? err.message
          : "Could not save the payment. Please try again."
      );
    } finally {
      setPaymentSaving(false);
    }
  }

  if (selectedInvoice) {
    const received = Number(selectedInvoice.amountPaid ?? 0);
    const balance = getBalance(selectedInvoice);
    const paymentStatus = getPaymentStatus(selectedInvoice);

    return (
      <div className="space-y-5">
        <div className="no-print flex flex-wrap items-center justify-between gap-3 print:hidden">
          <button
            type="button"
            onClick={() => {
              setSelectedInvoice(null);
              setPaymentAmount("");
              setError("");
              setNotice("");
            }}
            className="rounded-lg border border-slate-300 bg-white px-4 py-3 font-semibold hover:bg-slate-50"
          >
            ← Back to history
          </button>

          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-blue-50 px-4 py-2 text-sm font-medium text-blue-700">
              Invoice {selectedInvoice.id}
            </span>
            <span className={`rounded-full px-3 py-2 text-sm font-semibold ${getStatusClasses(paymentStatus)}`}>
              {paymentStatus}
            </span>
          </div>
        </div>

        <section className="no-print rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6 print:hidden">
          <h2 className="text-lg font-bold text-slate-900">Collect Payment</h2>
          <p className="mt-1 text-sm text-slate-500">
            Record the next payment. Enter the remaining balance to mark this invoice Paid.
          </p>

          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="rounded-xl bg-slate-50 p-3">
              <p className="text-sm text-slate-500">Invoice Total</p>
              <p className="mt-1 font-bold text-slate-900">{money(Number(selectedInvoice.total ?? 0))}</p>
            </div>
            <div className="rounded-xl bg-green-50 p-3">
              <p className="text-sm text-green-700">Already Paid</p>
              <p className="mt-1 font-bold text-green-800">{money(received)}</p>
            </div>
            <div className="rounded-xl bg-red-50 p-3">
              <p className="text-sm text-red-700">Balance Due</p>
              <p className="mt-1 font-bold text-red-800">{money(balance)}</p>
            </div>
          </div>

          {error && <p role="alert" className="mt-4 break-words rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
          {notice && <p role="status" className="mt-4 break-words rounded-lg bg-blue-50 p-3 text-sm text-blue-800">{notice}</p>}

          {paymentStatus === "Paid" ? (
            <p className="mt-4 font-semibold text-green-700">✓ This invoice is fully paid. No balance remains.</p>
          ) : (
            <form
              className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2"
              onSubmit={(event) => {
                event.preventDefault();
                void handleCollectPayment();
              }}
            >
              <label className="text-sm font-medium text-slate-700">
                Amount received (₹)
                <input
                  type="number"
                  min="0.01"
                  max={balance}
                  step="0.01"
                  required
                  value={paymentAmount}
                  onChange={(event) => setPaymentAmount(event.target.value)}
                  placeholder="Enter amount received"
                  className="mt-2 w-full rounded-xl border border-slate-300 p-3 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
                />
                <span className="mt-1 block text-xs font-normal text-slate-500">Maximum: {money(balance)}</span>
              </label>

              <label className="text-sm font-medium text-slate-700">
                Payment method
                <select
                  value={paymentMethod}
                  onChange={(event) => setPaymentMethod(event.target.value as PaymentMethod)}
                  className="mt-2 w-full rounded-xl border border-slate-300 bg-white p-3 outline-none focus:border-blue-600"
                >
                  {PAYMENT_METHODS.map((method) => <option key={method} value={method}>{method}</option>)}
                </select>
              </label>

              <label className="text-sm font-medium text-slate-700 sm:col-span-2">
                Notes (optional)
                <input
                  value={paymentNotes}
                  onChange={(event) => setPaymentNotes(event.target.value)}
                  placeholder="Payment reference or note"
                  className="mt-2 w-full rounded-xl border border-slate-300 p-3 outline-none focus:border-blue-600"
                />
              </label>

              <button
                type="submit"
                disabled={paymentSaving || balance <= 0}
                className="rounded-xl bg-blue-700 px-5 py-3 font-semibold text-white hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-50 sm:col-span-2"
              >
                {paymentSaving ? "Saving payment..." : "Save Payment"}
              </button>
            </form>
          )}
        </section>

        <InvoicePrint invoice={selectedInvoice} received={received} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <header>
        <p className="text-sm font-semibold uppercase tracking-widest text-blue-700">Billing workspace</p>
        <h1 className="mt-1 text-2xl font-bold sm:text-3xl">Invoice History</h1>
        <p className="mt-2 text-sm text-slate-500">
          Search invoices, collect outstanding payments, export reports, and print bills.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
          <span className={`rounded-full px-3 py-1 font-medium ${online ? "bg-green-100 text-green-800" : "bg-amber-100 text-amber-800"}`}>
            {online ? "Online" : "Offline — payments saved on this device"}
          </span>
          <button
            type="button"
            onClick={() => void syncPendingData()}
            disabled={!online || syncBusy}
            className="rounded-lg bg-indigo-700 px-4 py-2 font-semibold text-white hover:bg-indigo-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {syncBusy ? "Syncing..." : "Sync Pending Data"}
          </button>
        </div>
      </header>

      {error && <p role="alert" className="break-words rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {notice && <p role="status" className="break-words rounded-lg bg-blue-50 p-3 text-sm text-blue-800">{notice}</p>}

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
        <div className="flex flex-col gap-4">
          <div>
            <h2 className="font-bold text-slate-900">Data export and recovery</h2>
            <p className="mt-1 text-sm leading-5 text-slate-500">Export CSV for Excel, or JSON to back up and restore invoices and locally saved payment transactions.</p>
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
            <button type="button" onClick={() => void handleExportCsv()} disabled={backupBusy || loading} className="rounded-xl bg-green-700 px-4 py-3 text-sm font-semibold text-white hover:bg-green-800 disabled:opacity-50">
              {backupBusy ? "Please wait..." : "↓ Export CSV"}
            </button>
            <button type="button" onClick={() => void handleExportBackup()} disabled={backupBusy || loading} className="rounded-xl bg-blue-700 px-4 py-3 text-sm font-semibold text-white hover:bg-blue-800 disabled:opacity-50">
              {backupBusy ? "Please wait..." : "↓ Export JSON Backup"}
            </button>
            <button type="button" onClick={() => { setError(""); setNotice(""); fileInputRef.current?.click(); }} disabled={backupBusy} className="rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50">
              ↑ Restore JSON Backup
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".json,application/json"
              className="hidden"
              aria-label="Choose a Dream Designs s Billing JSON backup"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void handleRestoreBackup(file);
              }}
            />
          </div>
          <p className="text-xs leading-5 text-slate-500">
            Restoring merges invoices and payment transactions by their IDs; it does not delete other local records.
          </p>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
        <label className="block text-sm font-medium">
          Search invoices
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Invoice number, customer name or phone"
            className="mt-2 w-full rounded-xl border border-slate-300 p-3 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
          />
        </label>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-sm text-slate-500">
          <span>{filteredInvoices.length} invoice(s) found</span>
          <span>Stored on this device</span>
        </div>
      </section>

      {loading ? (
        <div className="rounded-2xl bg-white p-8 text-center text-slate-500">Loading invoices...</div>
      ) : filteredInvoices.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center">
          <div className="text-3xl">▤</div>
          <h2 className="mt-3 font-semibold">No invoices found</h2>
          <p className="mt-1 text-sm text-slate-500">{search ? "Try a different search term." : "Create your first bill to see it here."}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredInvoices.map((invoice) => {
            const status = getPaymentStatus(invoice);
            const paid = Number(invoice.amountPaid ?? 0);
            const balance = getBalance(invoice);

            return (
              <button
                type="button"
                key={invoice.id}
                onClick={() => {
                  setSelectedInvoice(invoice);
                  setPaymentAmount("");
                  setPaymentMethod("Cash");
                  setPaymentNotes("");
                  setError("");
                  setNotice("");
                }}
                className="flex w-full flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:border-blue-300 hover:shadow-md sm:flex-row sm:items-center sm:justify-between sm:p-5"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-bold text-slate-900">{invoice.id}</span>
                    <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-600">{invoice.saleType}</span>
                    <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${getStatusClasses(status)}`}>{status}</span>
                    <span className={`rounded-full px-2.5 py-1 text-xs ${invoice.syncStatus === "synced" ? "bg-green-50 text-green-700" : "bg-slate-100 text-slate-600"}`}>
                      {invoice.syncStatus === "synced" ? "Synced" : "Pending sync"}
                    </span>
                  </div>
                  <p className="mt-2 break-words font-medium">{invoice.customerName}</p>
                  <p className="mt-1 text-sm text-slate-500">{invoice.phone}</p>
                  <p className="mt-1 text-xs text-slate-400">{new Date(invoice.createdAt).toLocaleString("en-IN")}</p>
                </div>
                <div className="flex items-center justify-between gap-4 sm:justify-end">
                  <div className="text-left sm:text-right">
                    <p className="text-lg font-bold">{money(Number(invoice.total))}</p>
                    <p className="mt-1 text-xs text-green-700">Paid: {money(paid)}</p>
                    <p className="mt-1 text-xs text-red-600">Balance: {money(balance)}</p>
                    <p className="mt-1 text-xs text-slate-500">{invoice.items.length} item(s)</p>
                  </div>
                  <span className="text-sm font-semibold text-blue-700">View →</span>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
