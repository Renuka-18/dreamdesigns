
"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";

type ProductType = "Retail" | "Wholesale" | "Empty Frames";

type Product = {
  _id: string;
  name: string;
  productType?: ProductType;
  retailPrice?: number;
  wholesalePrice?: number;
  emptyframesPrice?: number;
  gstRate?: number;
  isActive?: boolean;
};

type ProductForm = {
  name: string;
  productType: ProductType;
  price: string;
  gstRate: string;
};

const API_URL = (
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000/api"
).replace(/\/+$/, "");

const PAGE_SIZE = 10;

const emptyForm: ProductForm = {
  name: "",
  productType: "Retail",
  price: "",
  gstRate: "18",
};

function getProductType(value?: string): ProductType {
  if (value === "Wholesale" || value === "Empty Frames") {
    return value;
  }
  return "Retail";
}

function getProductPrice(product: Product, type: ProductType): number {
  if (type === "Wholesale") {
    return Number(product.wholesalePrice ?? 0);
  }

  if (type === "Empty Frames") {
    return Number(product.emptyframesPrice ?? 0);
  }

  return Number(product.retailPrice ?? 0);
}

function formatPrice(amount: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(amount);
}

export default function ProductsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [form, setForm] = useState<ProductForm>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [currentPage, setCurrentPage] = useState(1);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const loadProducts = useCallback(async () => {
    setLoading(true);
    setError("");

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
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to connect to the backend."
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadProducts();
  }, [loadProducts]);

  function updateField<K extends keyof ProductForm>(
    key: K,
    value: ProductForm[K]
  ) {
    setForm((previous) => ({ ...previous, [key]: value }));
  }

  function resetForm() {
    setForm(emptyForm);
    setEditingId(null);
    setError("");
    setMessage("");
  }

  function editProduct(product: Product) {
    const productType = getProductType(product.productType);
    const price = getProductPrice(product, productType);

    setForm({
      name: product.name,
      productType,
      price: String(price),
      gstRate: String(product.gstRate ?? 18),
    });

    setEditingId(product._id);
    setError("");
    setMessage("");

    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (saving) return;

    setSaving(true);
    setError("");
    setMessage("");

    const name = form.name.trim();
    const price = Number(form.price);
    const gstRate = Number(form.gstRate);

    if (!name || form.price.trim() === "" || form.gstRate.trim() === "") {
      setError("Please fill in the product name, price and GST rate.");
      setSaving(false);
      return;
    }

    if (!Number.isFinite(price) || price < 0) {
      setError("Please enter a valid price.");
      setSaving(false);
      return;
    }

    if (!Number.isFinite(gstRate) || gstRate < 0 || gstRate > 100) {
      setError("GST must be between 0 and 100.");
      setSaving(false);
      return;
    }

    const payload = {
      name,
      productType: form.productType,
      retailPrice: form.productType === "Retail" ? price : 0,
      wholesalePrice: form.productType === "Wholesale" ? price : 0,
      emptyframesPrice:
        form.productType === "Empty Frames" ? price : 0,
      gstRate,
    };

    try {
      const response = await fetch(
        editingId
          ? `${API_URL}/products/${editingId}`
          : `${API_URL}/products`,
        {
          method: editingId ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      );

      const data = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(data?.message || "Unable to save product.");
      }

      setMessage(
        editingId
          ? "Product updated successfully."
          : "Product added successfully."
      );

      setForm(emptyForm);
      setEditingId(null);
      setCurrentPage(1);

      await loadProducts();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Unable to save product."
      );
    } finally {
      setSaving(false);
    }
  }

  async function deactivateProduct(product: Product) {
    const confirmed = window.confirm(
      `Deactivate "${product.name}"? It will no longer appear in the active product list.`
    );

    if (!confirmed) return;

    setError("");
    setMessage("");

    try {
      const response = await fetch(
        `${API_URL}/products/${product._id}`,
        {
          method: "DELETE",
        }
      );

      const data = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(data?.message || "Unable to deactivate product.");
      }

      if (editingId === product._id) {
        setForm(emptyForm);
        setEditingId(null);
      }

      setMessage("Product deactivated successfully.");
      await loadProducts();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to deactivate product."
      );
    }
  }

  // Search and pagination
  const filteredProducts = useMemo(() => {
    const term = search.trim().toLowerCase();

    return products.filter((product) =>
      product.name.toLowerCase().includes(term)
    );
  }, [products, search]);

  const totalPages = Math.max(
    1,
    Math.ceil(filteredProducts.length / PAGE_SIZE)
  );

  const paginatedProducts = useMemo(() => {
    const startIndex = (currentPage - 1) * PAGE_SIZE;

    return filteredProducts.slice(
      startIndex,
      startIndex + PAGE_SIZE
    );
  }, [filteredProducts, currentPage]);

  // Keep the selected page valid when products are removed.
  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  const startItem =
    filteredProducts.length === 0
      ? 0
      : (currentPage - 1) * PAGE_SIZE + 1;

  const endItem = Math.min(
    currentPage * PAGE_SIZE,
    filteredProducts.length
  );

  return (
    <main className="mx-auto w-full max-w-7xl space-y-6 p-4 sm:p-6 lg:p-8">
      {/* Page heading */}
      <header>
        <p className="text-sm font-medium text-blue-600">
          Dream Designs Billing
        </p>

        <h1 className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">
          Product Management
        </h1>

        <p className="mt-2 text-sm text-gray-500">
          Add and manage products with selling type, price and GST rate.
        </p>
      </header>

      {/* Alerts */}
      {error && (
        <div
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700"
        >
          {error}
        </div>
      )}

      {message && (
        <div
          role="status"
          className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-700"
        >
          {message}
        </div>
      )}

      {/* Add / Edit Product Form */}
      <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm sm:p-6">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">
            {editingId ? "Edit Product" : "Add New Product"}
          </h2>

          {editingId && (
            <button
              type="button"
              onClick={resetForm}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium hover:bg-gray-50"
            >
              Cancel Edit
            </button>
          )}
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-gray-700">
                Product Name *
              </span>

              <input
                value={form.name}
                onChange={(e) => updateField("name", e.target.value)}
                required
                placeholder="Enter product name"
                className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              />
            </label>

            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-gray-700">
                Product Type *
              </span>

              <select
                value={form.productType}
                onChange={(e) => {
                  const type = e.target.value as ProductType;

                  setForm((previous) => ({
                    ...previous,
                    productType: type,
                    price: "",
                  }));
                }}
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              >
                <option value="Retail">Retail</option>
                <option value="Wholesale">Wholesale</option>
                <option value="Empty Frames">Empty Frames</option>
              </select>
            </label>

            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-gray-700">
                {form.productType} Price (₹) *
              </span>

              <input
                type="number"
                min="0"
                step="0.01"
                required
                value={form.price}
                onChange={(e) => updateField("price", e.target.value)}
                placeholder="Enter price"
                className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              />
            </label>

            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-gray-700">
                GST Rate (%) *
              </span>

              <input
                type="number"
                min="0"
                max="100"
                step="0.01"
                required
                value={form.gstRate}
                onChange={(e) => updateField("gstRate", e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              />
            </label>
          </div>

          <p className="text-xs text-gray-500">
            Each product has one selected type and one price. GST defaults
            to 18%, but you can change it for an individual product.
          </p>

          <button
            type="submit"
            disabled={saving}
            className="w-full rounded-lg bg-blue-600 px-5 py-3 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
          >
            {saving
              ? "Saving..."
              : editingId
                ? "Update Product"
                : "Save Product"}
          </button>
        </form>
      </section>

      {/* Product Table */}
      <section className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">
              Your Products
            </h2>

            <p className="text-sm text-gray-500">
              {products.length} active product
              {products.length === 1 ? "" : "s"}
            </p>
          </div>

          <input
            type="search"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setCurrentPage(1);
            }}
            placeholder="Search by product name..."
            aria-label="Search products"
            className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 sm:max-w-sm"
          />
        </div>

        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
          {loading ? (
            <div className="p-10 text-center text-sm text-gray-500">
              Loading products...
            </div>
          ) : filteredProducts.length === 0 ? (
            <div className="p-10 text-center">
              <div className="text-3xl">📦</div>

              <h3 className="mt-3 font-semibold text-gray-900">
                {search ? "No matching products" : "No products added yet"}
              </h3>

              <p className="mt-1 text-sm text-gray-500">
                {search
                  ? "Try another product name."
                  : "Use the form above to add your first product."}
              </p>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px] border-collapse text-left">
                  <thead>
                    <tr className="border-b border-gray-200 bg-gray-50">
                      <th className="px-5 py-3.5 text-xs font-semibold uppercase tracking-wide text-gray-500">
                        #
                      </th>

                      <th className="px-5 py-3.5 text-xs font-semibold uppercase tracking-wide text-gray-500">
                        Product Name
                      </th>

                      <th className="px-5 py-3.5 text-xs font-semibold uppercase tracking-wide text-gray-500">
                        Product Type
                      </th>

                      <th className="px-5 py-3.5 text-right text-xs font-semibold uppercase tracking-wide text-gray-500">
                        Price
                      </th>

                      <th className="px-5 py-3.5 text-center text-xs font-semibold uppercase tracking-wide text-gray-500">
                        GST
                      </th>

                      <th className="px-5 py-3.5 text-center text-xs font-semibold uppercase tracking-wide text-gray-500">
                        Actions
                      </th>
                    </tr>
                  </thead>

                  <tbody className="divide-y divide-gray-100">
                    {paginatedProducts.map((product, index) => {
                      const type = getProductType(product.productType);
                      const price = getProductPrice(product, type);

                      return (
                        <tr
                          key={product._id}
                          className="transition hover:bg-blue-50/40"
                        >
                          <td className="px-5 py-4 text-sm text-gray-400">
                            {(currentPage - 1) * PAGE_SIZE + index + 1}
                          </td>

                          <td className="px-5 py-4">
                            <span className="font-medium text-gray-900">
                              {product.name}
                            </span>
                          </td>

                          <td className="px-5 py-4">
                            <span className="inline-flex rounded-full bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700">
                              {type}
                            </span>
                          </td>

                          <td className="px-5 py-4 text-right text-sm font-semibold text-gray-900">
                            {formatPrice(price)}
                          </td>

                          <td className="px-5 py-4 text-center text-sm text-gray-600">
                            {Number(product.gstRate ?? 18)}%
                          </td>

                          <td className="px-5 py-4">
                            <div className="flex items-center justify-center gap-2">
                              <button
                                type="button"
                                onClick={() => editProduct(product)}
                                aria-label={`Edit ${product.name}`}
                                className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 transition hover:border-blue-400 hover:bg-blue-50 hover:text-blue-700"
                              >
                                Edit
                              </button>

                              <button
                                type="button"
                                onClick={() => void deactivateProduct(product)}
                                aria-label={`Deactivate ${product.name}`}
                                className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 transition hover:bg-red-50"
                              >
                                Deactivate
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              <div className="flex flex-col gap-3 border-t border-gray-200 bg-white px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
                <p className="text-sm text-gray-500">
                  Showing{" "}
                  <span className="font-semibold text-gray-800">
                    {startItem}-{endItem}
                  </span>{" "}
                  of{" "}
                  <span className="font-semibold text-gray-800">
                    {filteredProducts.length}
                  </span>{" "}
                  products
                </p>

                <div className="flex flex-wrap items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() =>
                      setCurrentPage((page) => Math.max(1, page - 1))
                    }
                    disabled={currentPage === 1}
                    className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Previous
                  </button>

                  {Array.from(
                    { length: totalPages },
                    (_, index) => index + 1
                  ).map((page) => (
                    <button
                      key={page}
                      type="button"
                      onClick={() => setCurrentPage(page)}
                      aria-current={
                        currentPage === page ? "page" : undefined
                      }
                      className={`min-w-9 rounded-lg px-3 py-2 text-sm font-medium transition ${
                        currentPage === page
                          ? "bg-blue-600 text-white shadow-sm"
                          : "border border-gray-300 text-gray-700 hover:bg-gray-50"
                      }`}
                    >
                      {page}
                    </button>
                  ))}

                  <button
                    type="button"
                    onClick={() =>
                      setCurrentPage((page) =>
                        Math.min(totalPages, page + 1)
                      )
                    }
                    disabled={currentPage === totalPages}
                    className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Next
                  </button>
                </div>
              </div>
            </>
          )}
        </div>

        <p className="text-xs text-gray-400">
          Showing up to {PAGE_SIZE} products per page.
        </p>
      </section>
    </main>
  );
}
