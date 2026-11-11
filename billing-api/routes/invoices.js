const express = require("express");
const mongoose = require("mongoose");

const Invoice = require("../models/Invoice");
const Payment = require("../models/Payment");

const router = express.Router();

function getStatus(total, paid) {
  if (paid >= total) return "Paid";
  if (paid > 0) return "Partially Paid";
  return "Unpaid";
}

// GET all invoices from MongoDB
router.get("/", async (req, res) => {
  try {
    const invoices = await Invoice.find().sort({ createdAt: -1 }).lean();

    return res.status(200).json(invoices);
  } catch (error) {
    console.error("Fetch invoices failed:", error);

    return res.status(500).json({
      message: "Could not fetch invoices.",
    });
  }
});

router.post("/sync", async (req, res) => {
  try {
    const {
      id,
      invoiceNumber,
      customerName,
      phone = "",
      saleType,
      items,
      subtotal,
      gst,
      total,
      createdAt,
      amountPaid = 0,
      balanceDue,
      changeToReturn = 0,
    } = req.body;

    const number = invoiceNumber || id;

    if (
      typeof number !== "string" ||
      !number.trim() ||
      typeof customerName !== "string" ||
      !customerName.trim() ||
      typeof saleType !== "string" ||
      !Array.isArray(items) ||
      items.length === 0 ||
      !Number.isFinite(subtotal) ||
      !Number.isFinite(gst) ||
      !Number.isFinite(total) ||
      !Number.isFinite(amountPaid) ||
      !Number.isFinite(changeToReturn) ||
      subtotal < 0 ||
      gst < 0 ||
      total < 0 ||
      amountPaid < 0 ||
      amountPaid > total ||
      changeToReturn < 0
    ) {
      return res.status(400).json({
        message: "Invalid invoice data for sync.",
      });
    }

    const validItems = items.every(
      (item) =>
        item &&
        typeof item.name === "string" &&
        item.name.trim() &&
        Number.isFinite(item.quantity) &&
        item.quantity > 0 &&
        Number.isFinite(item.price) &&
        item.price >= 0
    );

    if (!validItems) {
      return res.status(400).json({
        message: "One or more invoice items are invalid.",
      });
    }

    const invoiceNumberValue = number.trim();

    let invoice = await Invoice.findOne({
      invoiceNumber: invoiceNumberValue,
    });

    if (invoice) {
      // Update invoice details only.
      // Do not overwrite server-side payment totals or status.
      invoice.customerName = customerName.trim();
      invoice.phone = String(phone);
      invoice.saleType = saleType;
      invoice.items = items;
      invoice.subtotal = subtotal;
      invoice.gst = gst;
      invoice.total = total;

      await invoice.save();

      return res.json({
        invoice,
        synced: true,
        existing: true,
      });
    }

    // First sync: import the locally saved invoice and its current
    // payment summary. Historical payments are not individual
    // transaction records; new payments will be recorded separately.
    const paid = amountPaid;
    const balance = Math.max(total - paid, 0);

    invoice = await Invoice.create({
      invoiceNumber: invoiceNumberValue,
      customerName: customerName.trim(),
      phone: String(phone),
      saleType,
      items,
      subtotal,
      gst,
      total,
      amountPaid: paid,
      balanceDue: balanceDue === undefined
        ? balance
        : balance,
      changeToReturn,
      paymentStatus:
        paid >= total
          ? "Paid"
          : paid > 0
            ? "Partially Paid"
            : "Unpaid",
      deviceCreatedAt: createdAt ? new Date(createdAt) : undefined,
    });

    return res.status(201).json({
      invoice,
      synced: true,
      existing: false,
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({
        message: "Invoice was created concurrently. Retry the sync.",
      });
    }

    console.error("Invoice sync failed:", error);

    return res.status(500).json({
      message: "Could not sync invoice.",
    });
  }
});

router.post("/:invoiceNumber/payments", async (req, res) => {
  const {
    transactionId,
    amount,
    paymentMethod = "Cash",
    paidAt,
    notes = "",
  } = req.body;

  const allowedMethods = [
    "Cash",
    "UPI",
    "Card",
    "Bank Transfer",
    "Other",
  ];

  if (
    typeof transactionId !== "string" ||
    !transactionId.trim() ||
    !Number.isFinite(amount) ||
    amount <= 0 ||
    !allowedMethods.includes(paymentMethod) ||
    typeof notes !== "string" ||
    (paidAt !== undefined && !Number.isFinite(Date.parse(paidAt)))
  ) {
    return res.status(400).json({ message: "Invalid payment data." });
  }

  try {
    // Prevent the same payment from being recorded twice.
    const existing = await Payment.findOne({
      transactionId: transactionId.trim(),
    });

    if (existing) {
      if (
        existing.invoiceNumber !== req.params.invoiceNumber ||
        Number(existing.amount) !== amount
      ) {
        return res.status(409).json({
          message: "Transaction ID already used for another payment.",
        });
      }

      const existingInvoice = await Invoice.findOne({
        invoiceNumber: existing.invoiceNumber,
      });

      return res.json({
        invoice: existingInvoice,
        payment: existing,
        duplicate: true,
      });
    }

    const invoice = await Invoice.findOne({
      invoiceNumber: req.params.invoiceNumber,
    });

    if (!invoice) {
      return res.status(404).json({ message: "Invoice not found." });
    }

    const alreadyPaid = Number(invoice.amountPaid || 0);
    const balance = Math.max(Number(invoice.total) - alreadyPaid, 0);

    if (balance <= 0) {
      return res.status(400).json({
        message: "This invoice is already fully paid.",
      });
    }

    if (amount > balance) {
      return res.status(400).json({
        message: `Payment exceeds the remaining balance of ${balance}.`,
      });
    }

    const payment = await Payment.create({
      transactionId: transactionId.trim(),
      invoiceNumber: invoice.invoiceNumber,
      amount,
      paymentMethod,
      paidAt: paidAt ? new Date(paidAt) : new Date(),
      notes,
    });

    const newPaid = alreadyPaid + amount;
    const newBalance = Math.max(Number(invoice.total) - newPaid, 0);

    invoice.amountPaid = newPaid;
    invoice.balanceDue = newBalance;
    invoice.paymentStatus =
      newBalance <= 0
        ? "Paid"
        : newPaid > 0
          ? "Partially Paid"
          : "Unpaid";
    invoice.changeToReturn = 0;

    await invoice.save();

    return res.status(200).json({
      invoice,
      payment,
      duplicate: false,
    });
  } catch (error) {
    console.error("Collect payment failed:", error);
    return res.status(500).json({
      message: "Could not record payment.",
    });
  }
});

module.exports = router;