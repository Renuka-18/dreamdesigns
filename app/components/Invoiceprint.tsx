
"use client";

import { businessDetails } from "../src/lib/business";

type PaymentStatus = "Paid" | "Partially Paid" | "Unpaid";

export type PrintableInvoice = {
  id: string;
  customerName: string;
  phone: string;
  saleType: string;
  items: {
    name: string;
    quantity: number;
    price: number;
  }[];
  subtotal: number;
  gst: number;
  total: number;
  createdAt: string;
  amountPaid?: number;
  balanceDue?: number;
  changeToReturn?: number;
  paymentStatus?: PaymentStatus;
};

type Props = {
  invoice: PrintableInvoice;
  received?: number;
};

const money = (amount: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
  }).format(amount);

export default function InvoicePrint({ invoice, received }: Props) {
  const paid = Math.max(
    0,
    Number(invoice.amountPaid ?? received ?? 0) || 0
  );

  const balance = Math.max(
    0,
    Number(
      invoice.balanceDue ?? Math.max(invoice.total - paid, 0)
    ) || 0
  );

  const change = Math.max(
    0,
    Number(
      invoice.changeToReturn ?? Math.max(paid - invoice.total, 0)
    ) || 0
  );

  const paymentStatus: PaymentStatus =
    invoice.paymentStatus ??
    (paid >= invoice.total
      ? "Paid"
      : paid > 0
        ? "Partially Paid"
        : "Unpaid");

  return (
    <div className="invoice-wrapper">
      <style jsx>{`
        .invoice-wrapper {
          color: #111827;
          font-family: Arial, Helvetica, sans-serif;
        }

        .invoice-page {
          box-sizing: border-box;
          width: 100%;
          max-width: 794px;
          min-height: 1123px;
          margin: 0 auto;
          padding: 36px;
          background: #ffffff;
          border: 1px solid #d1d5db;
        }

        .business-header {
          display: flex;
          align-items: center;
          gap: 18px;
          padding-bottom: 20px;
          border-bottom: 2px solid #111827;
        }

        .business-logo {
          width: 90px;
          height: 90px;
          object-fit: contain;
          flex-shrink: 0;
        }

        .business-name {
          font-size: 24px;
          font-weight: 700;
          overflow-wrap: anywhere;
        }

        .muted {
          color: #4b5563;
          font-size: 12px;
          line-height: 1.7;
          overflow-wrap: anywhere;
        }

        .invoice-title {
          margin: 24px 0 28px;
          text-align: center;
          font-size: 21px;
          font-weight: 700;
          text-transform: uppercase;
        }

        .details {
          display: grid;
          grid-template-columns: 1fr 1fr;
          column-gap: 28px;
          margin-bottom: 30px;
          font-size: 13px;
          line-height: 1.9;
        }

        .details > div {
          min-width: 0;
          overflow-wrap: anywhere;
        }

        .details > div:last-child {
          margin-left: 140px;
        }

        .items {
          width: 100%;
          border-collapse: collapse;
          table-layout: fixed;
          font-size: 12px;
        }

        .items th,
        .items td {
          border: 1px solid #9ca3af;
          padding: 10px 8px;
          text-align: left;
          overflow-wrap: anywhere;
        }

        .items th {
          background: #f3f4f6;
          font-weight: 700;
        }

        .items .number {
          text-align: right;
          white-space: nowrap;
        }

        .summary {
          width: 310px;
          max-width: 100%;
          margin: 28px 0 0 auto;
          font-size: 13px;
        }

        .summary-row {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 16px;
          padding: 9px 0;
        }

        .summary-row span:first-child {
          flex: 1;
        }

        .summary-row span:last-child,
        .summary-row strong {
          text-align: right;
          white-space: nowrap;
        }

        .grand-total {
          margin-top: 3px;
          padding-top: 12px;
          padding-bottom: 12px;
          border-top: 2px solid #111827;
          font-size: 17px;
          font-weight: 700;
        }

        .payment-status {
          margin-top: 12px;
          padding: 12px 0;
          border-top: 1px solid #d1d5db;
          font-weight: 700;
        }

        .signature {
          margin-top: 85px;
          text-align: right;
          font-size: 13px;
          line-height: 1.6;
        }

        .signature p {
          margin: 0;
        }

        .signature-space {
          height: 44px;
        }

        .print-button {
          display: block;
          margin: 16px auto;
          padding: 12px 22px;
          border: none;
          border-radius: 8px;
          background: #1d4ed8;
          color: #ffffff;
          font-weight: 600;
          cursor: pointer;
        }

        @page {
          size: A4 portrait;
          margin: 12mm;
        }

        @media print {
          .no-print {
            display: none !important;
          }

          .invoice-page {
            width: 100%;
            max-width: none;
            min-height: auto;
            margin: 0;
            padding: 0;
            border: none;
          }

          .invoice-wrapper {
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }

          .items tr {
            break-inside: avoid;
          }

          .summary,
          .signature {
            break-inside: avoid;
          }
        }

        @media screen and (max-width: 600px) {
          .invoice-page {
            width: 100%;
            min-height: auto;
            padding: 18px;
          }

          .business-header {
            gap: 12px;
            padding-bottom: 16px;
          }

          .business-logo {
            width: 65px;
            height: 65px;
          }

          .business-name {
            font-size: 19px;
          }

          .muted {
            font-size: 11px;
          }

          .invoice-title {
            margin: 22px 0;
            font-size: 19px;
          }

          .details {
            grid-template-columns: 1fr;
            row-gap: 14px;
            margin-bottom: 22px;
          }

          .details > div:last-child {
            margin-left: 0;
          }

          .items {
            font-size: 10px;
          }

          .items th,
          .items td {
            padding: 7px 4px;
          }

          .items .number {
            white-space: normal;
            overflow-wrap: anywhere;
          }

          .summary {
            width: 100%;
            margin-top: 22px;
          }

          .summary-row {
            gap: 10px;
            padding: 8px 0;
          }

          .grand-total {
            font-size: 16px;
          }

          .signature {
            margin-top: 45px;
          }
        }
      `}</style>

      <button
        type="button"
        className="print-button no-print"
        onClick={() => window.print()}
      >
        Print A4 Invoice
      </button>

      <article className="invoice-page">
        <header className="business-header">
          <img
            src={businessDetails.logo}
            alt="Business logo"
            className="business-logo"
          />

          <div>
            <div className="business-name">
              {businessDetails.name}
            </div>

            <div className="muted">
              {businessDetails.address}
            </div>

            <div className="muted">
              Phone: {businessDetails.phone}
            </div>

            {businessDetails.gstin && (
              <div className="muted">
                GSTIN: {businessDetails.gstin}
              </div>
            )}
          </div>
        </header>

        <h2 className="invoice-title">Tax Invoice</h2>

        <section className="details">
          <div>
            <strong>Bill To</strong>
            <br />
            {invoice.customerName}
            <br />
            Phone: {invoice.phone}
            <br />
            Sale type: {invoice.saleType}
          </div>

          <div>
            <strong>Invoice details</strong>
            <br />
            Invoice No: {invoice.id}
            <br />
            Date:{" "}
            {new Date(invoice.createdAt).toLocaleDateString("en-IN")}
            <br />
            Time:{" "}
            {new Date(invoice.createdAt).toLocaleTimeString("en-IN")}
          </div>
        </section>

        <table className="items">
          <colgroup>
            <col style={{ width: "8%" }} />
            <col style={{ width: "40%" }} />
            <col style={{ width: "12%" }} />
            <col style={{ width: "18%" }} />
            <col style={{ width: "22%" }} />
          </colgroup>

          <thead>
            <tr>
              <th>No.</th>
              <th>Product description</th>
              <th className="number">Qty</th>
              <th className="number">Unit price</th>
              <th className="number">Amount</th>
            </tr>
          </thead>

          <tbody>
            {invoice.items.map((item, index) => (
              <tr key={`${item.name}-${index}`}>
                <td>{index + 1}</td>
                <td>{item.name}</td>
                <td className="number">{item.quantity}</td>
                <td className="number">{money(item.price)}</td>
                <td className="number">
                  {money(item.quantity * item.price)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <section className="summary">
          <div className="summary-row">
            <span>Subtotal</span>
            <strong>{money(invoice.subtotal)}</strong>
          </div>

          {invoice.gst > 0 && (
            <div className="summary-row">
              <span>GST</span>
              <strong>{money(invoice.gst)}</strong>
            </div>
          )}

          <div className="summary-row grand-total">
            <span>Grand Total</span>
            <span>{money(invoice.total)}</span>
          </div>

          <div className="summary-row">
            <span>Amount Paid / Received</span>
            <strong>{money(paid)}</strong>
          </div>

          <div className="summary-row">
            <span>Balance Due</span>
            <strong>{money(balance)}</strong>
          </div>

          {change > 0 && (
            <div className="summary-row">
              <span>Change to Return</span>
              <strong>{money(change)}</strong>
            </div>
          )}

          <div className="summary-row payment-status">
            <span>Payment Status</span>
            <span>{paymentStatus}</span>
          </div>
        </section>

        <footer className="signature">
          <p>For {businessDetails.name}</p>
          <div className="signature-space" />
          <p>Authorized Signatory</p>
        </footer>
      </article>
    </div>
  );
}
