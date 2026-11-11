
"use client";

import { useCallback, useEffect, useState } from "react";
import { saveInvoice, type SavedInvoice, markInvoiceSynced } from "../app/src/lib/db";
import { generateInvoiceNumber } from "../app/src/lib/invoicenumber";
import { businessDetails } from "../app/src/lib/business";

type ProductType = "Retail" | "Wholesale" | "Empty Frames";

type Product = {
  _id: string;
  name: string;
  productType?: ProductType;
  retailPrice: number;
  wholesalePrice: number;
  emptyframesPrice: number;
  gstRate?: number;
  isActive?: boolean;
};

type InvoiceItem = {
  id: number;
  productId: string;
  name: string;
  quantity: number;
  price: number;
};

type PaymentStatus = "Paid" | "Partially Paid" | "Unpaid";

const API_URL =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000/api";

const GST_RATE = 18;

const money = (amount: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
  }).format(amount);

export default function Home() {
  const [customerName, setCustomerName] = useState("");
  const [phone, setPhone] = useState("");
  const [saleType, setSaleType] = useState<ProductType>("Retail");

  const [products, setProducts] = useState<Product[]>([]);
  const [productId, setProductId] = useState("");
  const [price, setPrice] = useState("");
  const [quantity, setQuantity] = useState("1");

  const [gstEnabled, setGstEnabled] = useState(true);
  const [amountPaid, setAmountPaid] = useState("");

  const [items, setItems] = useState<InvoiceItem[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [lastInvoiceNumber, setLastInvoiceNumber] = useState("");

  const loadProducts = useCallback(async () => {
    setLoadingProducts(true);

    try {
      const response = await fetch(`${API_URL}/products`);
      const data = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(data?.message || "Unable to load products.");
      }

      if (!Array.isArray(data)) {
        throw new Error("Unexpected response from the Products API.");
      }

      setProducts(data);
    } catch (error) {
      console.error("Product loading failed:", error);
      setMessage(
        error instanceof Error
          ? error.message
          : "Unable to connect to the products backend."
      );
    } finally {
      setLoadingProducts(false);
    }
  }, []);

  useEffect(() => {
    void loadProducts();
  }, [loadProducts]);

  // Older products without productType are treated as Retail.
  const availableProducts = products.filter((product) => {
    const type = product.productType ?? "Retail";
    return type === saleType && product.isActive !== false;
  });

  const selectedProduct = availableProducts.find(
    (product) => product._id === productId
  );

  const selectedProductPrice = selectedProduct
    ? saleType === "Retail"
      ? selectedProduct.retailPrice
      : saleType === "Wholesale"
        ? selectedProduct.wholesalePrice
        : selectedProduct.emptyframesPrice
    : undefined;

  function selectProduct(id: string) {
    setProductId(id);

    const product = availableProducts.find((item) => item._id === id);

    if (product) {
      const productPrice =
        saleType === "Retail"
          ? product.retailPrice
          : saleType === "Wholesale"
            ? product.wholesalePrice
            : product.emptyframesPrice;

      setPrice(String(productPrice ?? ""));
    } else {
      setPrice("");
    }
  }

  function changeSaleType(type: ProductType) {
    setSaleType(type);
    setProductId("");
    setPrice("");
    setMessage("");
  }

  function addItem() {
    const product = availableProducts.find(
      (item) => item._id === productId
    );

    const unitPrice = Number(price);
    const qty = Number(quantity);

    if (!product) {
      setMessage("Please select a product for the chosen sale type.");
      return;
    }

    if (
      price.trim() === "" ||
      !Number.isFinite(unitPrice) ||
      unitPrice < 0
    ) {
      setMessage("Enter a valid price.");
      return;
    }

    if (
      quantity.trim() === "" ||
      !Number.isInteger(qty) ||
      qty < 1
    ) {
      setMessage("Quantity must be a whole number greater than zero.");
      return;
    }

    setItems((current) => [
      ...current,
      {
        id: Date.now() + Math.floor(Math.random() * 100000),
        productId: product._id,
        name: product.name,
        quantity: qty,
        price: unitPrice,
      },
    ]);

    setQuantity("1");
    setMessage("");
  }

  const subtotal = items.reduce(
    (sum, item) => sum + item.quantity * item.price,
    0
  );

  const gst = gstEnabled ? (subtotal * GST_RATE) / 100 : 0;
  const total = subtotal + gst;

  const paid = amountPaid.trim() === "" ? 0 : Number(amountPaid);
  const validPayment = Number.isFinite(paid) && paid >= 0;

  const balanceDue = validPayment ? Math.max(total - paid, 0) : total;
  const changeToReturn = validPayment ? Math.max(paid - total, 0) : 0;

  const paymentStatus: PaymentStatus =
    paid >= total && validPayment
      ? "Paid"
      : paid > 0 && validPayment
        ? "Partially Paid"
        : "Unpaid";

  async function createInvoice() {
    if (saving) return;

    if (!customerName.trim() || !phone.trim() || items.length === 0) {
      setMessage("Enter customer details and add at least one item.");
      return;
    }

    if (!/^[6-9]\d{9}$/.test(phone.trim())) {
      setMessage("Enter a valid 10-digit Indian mobile number.");
      return;
    }

    if (
      amountPaid.trim() !== "" &&
      (!Number.isFinite(paid) || paid < 0)
    ) {
      setMessage("Enter a valid amount paid.");
      return;
    }

    setSaving(true);
    setMessage("");

    try {
      const invoiceNumber = generateInvoiceNumber();

      const invoice: SavedInvoice & {
        amountPaid: number;
        balanceDue: number;
        changeToReturn: number;
        paymentStatus: PaymentStatus;
      } = {
        id: invoiceNumber,
        customerName: customerName.trim(),
        phone: phone.trim(),
        saleType,
        items: items.map((item) => ({
          name: item.name,
          quantity: item.quantity,
          price: item.price,
        })),
        subtotal,
        gst,
        total,
        amountPaid: paid,
        balanceDue,
        changeToReturn,
        paymentStatus,
        createdAt: new Date().toISOString(),
        syncStatus: "pending",
      };

      // Save locally first, so offline billing continues to work.
await saveInvoice(invoice);

setLastInvoiceNumber(invoiceNumber);

try {
  const response = await fetch(`${API_URL}/invoices/sync`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      ...invoice,
      invoiceNumber: invoice.id,
    }),
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.message || "Server sync failed.");
  }

  await markInvoiceSynced(invoice.id);

  setMessage(
    `${invoiceNumber} saved and synced successfully.`
  );
} catch (syncError) {
  console.error("Invoice cloud sync failed:", syncError);

  setMessage(
    `${invoiceNumber} saved on this device. Cloud sync is pending. Open Invoice History and retry Sync Pending Data.`
  );
}

      setCustomerName("");
      setPhone("");
      setSaleType("Retail");
      setItems([]);
      setGstEnabled(true);
      setProductId("");
      setPrice("");
      setQuantity("1");
      setAmountPaid("");
    } catch (error) {
      console.error("Invoice save failed:", error);
      setMessage("Invoice could not be saved. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Page heading */}
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          <img
            src={businessDetails.logo}
            alt="Business logo"
            className="h-14 w-14 shrink-0 rounded-xl border border-slate-200 bg-white object-contain p-1"
          />

          <div className="min-w-0">
            <p className="text-sm font-semibold uppercase tracking-widest text-blue-700">
              Billing workspace
            </p>
            <h1 className="break-words text-2xl font-bold sm:text-3xl">
              Create Bill
            </h1>
            <p className="mt-1 break-words text-sm text-slate-500">
              {businessDetails.name}
            </p>
          </div>
        </div>

        <span className="rounded-full bg-blue-50 px-4 py-2 text-sm font-medium text-blue-700">
          New invoice
        </span>
      </header>

      {/* Responsive billing layout */}
      <div className="grid min-w-0 grid-cols-1 items-start gap-5 sm:gap-6 lg:grid-cols-[minmax(0,1fr)_320px] xl:grid-cols-[minmax(0,1fr)_350px]">
        {/* Left: customer, products and current bill */}
        <div className="min-w-0 space-y-5 sm:space-y-6">
          {/* Customer details */}
          <section className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
            <div className="mb-5">
              <h2 className="text-lg font-bold">Customer details</h2>
              <p className="mt-1 text-sm text-slate-500">
                Enter the customer&apos;s billing information.
              </p>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <label className="min-w-0 text-sm font-medium">
                Customer name
                <input
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  placeholder="Enter customer name"
                  autoComplete="name"
                  className="mt-2 min-h-11 w-full min-w-0 rounded-lg border border-slate-300 p-3 font-normal outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
                />
              </label>

              <label className="min-w-0 text-sm font-medium">
                Phone number
                <input
                  type="tel"
                  inputMode="numeric"
                  autoComplete="tel"
                  maxLength={10}
                  value={phone}
                  onChange={(e) =>
                    setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))
                  }
                  placeholder="10-digit mobile number"
                  className="mt-2 min-h-11 w-full min-w-0 rounded-lg border border-slate-300 p-3 font-normal outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
                />
              </label>
            </div>

            <label className="mt-4 block text-sm font-medium sm:max-w-sm">
              Sale type
              <select
                value={saleType}
                onChange={(e) =>
                  changeSaleType(e.target.value as ProductType)
                }
                className="mt-2 min-h-11 w-full rounded-lg border border-slate-300 bg-white p-3"
              >
                <option value="Retail">Retail</option>
                <option value="Wholesale">Wholesale</option>
                <option value="Empty Frames">Empty Frames</option>
              </select>
            </label>
          </section>

          {/* Products */}
          <section className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
            <div className="mb-5">
              <h2 className="text-lg font-bold">Products</h2>
              <p className="mt-1 text-sm text-slate-500">
                Products are loaded from your backend.
              </p>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <label className="min-w-0 text-sm font-medium sm:col-span-2">
                Product
                <select
                  value={productId}
                  onChange={(e) => selectProduct(e.target.value)}
                  disabled={loadingProducts || availableProducts.length === 0}
                  className="mt-2 min-h-11 w-full min-w-0 rounded-lg border border-slate-300 bg-white p-3 disabled:bg-slate-100"
                >
                  <option value="">
                    {loadingProducts
                      ? "Loading products..."
                      : availableProducts.length === 0
                        ? `No ${saleType.toLowerCase()} products available`
                        : "Select a product"}
                  </option>

                  {availableProducts.map((product) => (
                    <option key={product._id} value={product._id}>
                      {product.name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="min-w-0 text-sm font-medium">
                Price per unit (₹)
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  inputMode="decimal"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  className="mt-2 min-h-11 w-full min-w-0 rounded-lg border border-slate-300 p-3"
                />
                {selectedProduct && (
                  <span className="mt-1 block break-words text-xs text-slate-500">
                    Saved {saleType.toLowerCase()} price:{" "}
                    {money(Number(selectedProductPrice ?? 0))}
                  </span>
                )}
              </label>

              <label className="min-w-0 text-sm font-medium">
                Quantity
                <input
                  type="number"
                  min="1"
                  step="1"
                  inputMode="numeric"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  className="mt-2 min-h-11 w-full min-w-0 rounded-lg border border-slate-300 p-3"
                />
              </label>
            </div>

            <button
              type="button"
              onClick={addItem}
              disabled={loadingProducts || availableProducts.length === 0}
              className="mt-5 min-h-11 w-full rounded-lg bg-blue-700 px-5 py-3 font-semibold text-white hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
            >
              + Add item
            </button>

            {!loadingProducts && products.length === 0 && (
              <p className="mt-3 text-sm text-amber-700">
                No products found. Add products in Product Management first.
              </p>
            )}
          </section>

          {/* Current bill */}
          <section className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold">Current bill</h2>
                <p className="mt-1 text-sm text-slate-500">
                  {items.length} item(s) added
                </p>
              </div>

              <span className="shrink-0 rounded-full bg-slate-100 px-3 py-1 text-sm font-medium">
                {items.reduce((sum, item) => sum + item.quantity, 0)} units
              </span>
            </div>

            {items.length === 0 ? (
              <p className="rounded-xl bg-slate-50 p-5 text-center text-sm text-slate-500 sm:p-6">
                Add a product to start this bill.
              </p>
            ) : (
              <div className="space-y-3">
                {items.map((item) => (
                  <div
                    key={item.id}
                    className="flex min-w-0 flex-col gap-3 rounded-xl border border-slate-200 p-3 sm:flex-row sm:items-center sm:justify-between sm:p-4"
                  >
                    <div className="min-w-0">
                      <p className="break-words font-semibold">{item.name}</p>
                      <p className="mt-1 text-sm text-slate-500">
                        {item.quantity} × {money(item.price)}
                      </p>
                    </div>

                    <div className="flex items-center justify-between gap-4 sm:justify-end">
                      <p className="font-bold">
                        {money(item.quantity * item.price)}
                      </p>
                      <button
                        type="button"
                        onClick={() =>
                          setItems((current) =>
                            current.filter((value) => value.id !== item.id)
                          )
                        }
                        className="min-h-10 rounded-md px-2 text-sm font-medium text-red-600 hover:bg-red-50 hover:text-red-800"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>

        {/* Right: bill summary and payment */}
        <aside className="h-fit min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6 lg:sticky lg:top-6">
          <h2 className="text-lg font-bold">Bill summary</h2>
          <p className="mt-1 text-sm text-slate-500">
            Review the amount before saving.
          </p>

          <label className="mt-5 flex min-h-12 items-center gap-3 rounded-xl bg-slate-50 p-3 text-sm">
            <input
              type="checkbox"
              checked={gstEnabled}
              onChange={(e) => setGstEnabled(e.target.checked)}
              className="h-5 w-5 shrink-0 accent-blue-700"
            />
            Apply GST (18%)
          </label>

          <div className="mt-5 space-y-4 text-sm">
            <div className="flex justify-between gap-3">
              <span className="text-slate-500">Sale type</span>
              <span className="text-right font-medium">{saleType}</span>
            </div>

            <div className="flex justify-between gap-3">
              <span className="text-slate-500">Subtotal</span>
              <span className="text-right">{money(subtotal)}</span>
            </div>

            {gstEnabled && (
              <div className="flex justify-between gap-3">
                <span className="text-slate-500">GST (18%)</span>
                <span className="text-right">{money(gst)}</span>
              </div>
            )}

            <div className="border-t border-slate-200 pt-4">
              <div className="flex items-start justify-between gap-3 text-lg font-bold">
                <span>Grand Total</span>
                <span className="text-right">{money(total)}</span>
              </div>
            </div>
          </div>

          {/* Payment details */}
          <div className="mt-5 space-y-4 border-t border-slate-200 pt-5">
            <label className="block text-sm font-medium">
              Amount Paid (₹)
              <input
                type="number"
                min="0"
                step="0.01"
                inputMode="decimal"
                value={amountPaid}
                onChange={(e) => setAmountPaid(e.target.value)}
                placeholder="Enter amount received"
                className="mt-2 min-h-11 w-full min-w-0 rounded-lg border border-slate-300 p-3 font-normal outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
              />
            </label>

            <div className="flex justify-between gap-3 text-sm">
              <span className="text-slate-500">Balance Due</span>
              <span className="text-right font-semibold text-red-600">
                {money(balanceDue)}
              </span>
            </div>

            <div className="flex justify-between gap-3 text-sm">
              <span className="text-slate-500">Change to Return</span>
              <span className="text-right font-semibold text-green-700">
                {money(changeToReturn)}
              </span>
            </div>

            <div className="flex justify-between gap-3 border-t border-slate-200 pt-3 text-sm">
              <span className="text-slate-500">Payment Status</span>
              <span
                className={`text-right font-semibold ${
                  paymentStatus === "Paid"
                    ? "text-green-700"
                    : paymentStatus === "Partially Paid"
                      ? "text-amber-700"
                      : "text-red-600"
                }`}
              >
                {paymentStatus}
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={createInvoice}
            disabled={saving}
            className="mt-6 min-h-12 w-full rounded-xl bg-blue-700 px-5 py-3.5 font-semibold text-white hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? "Saving invoice..." : "Save invoice"}
          </button>

          {message && (
            <p
              role="status"
              className="mt-4 break-words rounded-lg bg-blue-50 p-3 text-sm text-blue-800"
            >
              {message}
            </p>
          )}

          {lastInvoiceNumber && (
            <p className="mt-3 break-words text-sm text-slate-600">
              Last saved: <strong>{lastInvoiceNumber}</strong>
            </p>
          )}

          <p className="mt-4 text-xs leading-5 text-slate-500">
            Saved invoices are available from Invoice History. Cloud
            synchronization is not connected yet.
          </p>
        </aside>
      </div>
    </div>
  );
}
