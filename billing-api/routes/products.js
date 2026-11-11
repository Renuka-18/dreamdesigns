
const express = require("express");
const mongoose = require("mongoose");
const Product = require("../models/Product");

const router = express.Router();

const VALID_PRODUCT_TYPES = ["Retail", "Wholesale", "Empty Frames"];

// GET: List active products
router.get("/", async (req, res) => {
  try {
    const products = await Product.find({ isActive: true })
      .sort({ name: 1 })
      .lean();

    res.json(products);
  } catch (error) {
    console.error("Load products error:", error);
    res.status(500).json({
      message: "Failed to load products.",
    });
  }
});

// POST: Add a product
router.post("/", async (req, res) => {
  try {
    const {
      name,
      productType = "Retail",
      retailPrice,
      wholesalePrice,
      emptyframesPrice,
      gstRate = 0,
    } = req.body;

    if (typeof name !== "string" || !name.trim()) {
      return res.status(400).json({
        message: "Product name is required.",
      });
    }

    if (!VALID_PRODUCT_TYPES.includes(productType)) {
      return res.status(400).json({
        message: "Select Retail, Wholesale, or Empty Frames.",
      });
    }

    // Read the price corresponding to the selected product type.
    const selectedPrice =
      productType === "Retail"
        ? retailPrice
        : productType === "Wholesale"
          ? wholesalePrice
          : emptyframesPrice;

    if (
      selectedPrice === undefined ||
      selectedPrice === null ||
      selectedPrice === ""
    ) {
      return res.status(400).json({
        message: "Price is required for the selected product type.",
      });
    }

    const price = Number(selectedPrice);
    const gst = Number(gstRate);

    if (!Number.isFinite(price) || price < 0) {
      return res.status(400).json({
        message: "Enter a valid price greater than or equal to zero.",
      });
    }

    if (!Number.isFinite(gst) || gst < 0 || gst > 100) {
      return res.status(400).json({
        message: "GST must be between 0 and 100.",
      });
    }

    const product = await Product.create({
      // Generated automatically; not entered by the user.
      productCode: `PROD-${new mongoose.Types.ObjectId()}`,
      name: name.trim(),
      productType,
      retailPrice: productType === "Retail" ? price : 0,
      wholesalePrice: productType === "Wholesale" ? price : 0,
      emptyframesPrice: productType === "Empty Frames" ? price : 0,
      gstRate: gst,
    });

    res.status(201).json(product);
  } catch (error) {
    console.error("Create product error:", error);

    if (error.code === 11000) {
      return res.status(409).json({
        message: "Duplicate product code. Please try again.",
      });
    }

    if (
      error.name === "ValidationError" ||
      error.name === "CastError"
    ) {
      return res.status(400).json({
        message: error.message,
      });
    }

    res.status(500).json({
      message: "Failed to create product.",
    });
  }
});

// PUT: Update a product
router.put("/:id", async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({
        message: "Invalid product ID.",
      });
    }

    const existingProduct = await Product.findById(req.params.id);

    if (!existingProduct) {
      return res.status(404).json({
        message: "Product not found.",
      });
    }

    const {
      name,
      productType,
      retailPrice,
      wholesalePrice,
      emptyframesPrice,
      gstRate,
    } = req.body;

    const updates = {};

    if (name !== undefined) {
      if (typeof name !== "string" || !name.trim()) {
        return res.status(400).json({
          message: "Product name is required.",
        });
      }

      updates.name = name.trim();
    }

    const finalType =
      productType ?? existingProduct.productType ?? "Retail";

    if (!VALID_PRODUCT_TYPES.includes(finalType)) {
      return res.status(400).json({
        message: "Select Retail, Wholesale, or Empty Frames.",
      });
    }

    // Only validate/update price when a price was supplied or
    // the product type is being changed.
    const typeChanged = finalType !== existingProduct.productType;

    const priceWasProvided =
      finalType === "Retail"
        ? retailPrice !== undefined
        : finalType === "Wholesale"
          ? wholesalePrice !== undefined
          : emptyframesPrice !== undefined;

    if (typeChanged && !priceWasProvided) {
      return res.status(400).json({
        message: "Enter a price for the selected product type.",
      });
    }

    if (priceWasProvided) {
      const selectedPrice =
        finalType === "Retail"
          ? retailPrice
          : finalType === "Wholesale"
            ? wholesalePrice
            : emptyframesPrice;

      if (selectedPrice === "" || selectedPrice === null) {
        return res.status(400).json({
          message: "Enter a valid price.",
        });
      }

      const price = Number(selectedPrice);

      if (!Number.isFinite(price) || price < 0) {
        return res.status(400).json({
          message: "Price must be greater than or equal to zero.",
        });
      }

      updates.retailPrice = finalType === "Retail" ? price : 0;
      updates.wholesalePrice =
        finalType === "Wholesale" ? price : 0;
      updates.emptyframesPrice =
        finalType === "Empty Frames" ? price : 0;
    } else if (!typeChanged) {
      // Preserve the existing selected price if the request
      // changes only the name or GST.
    }

    updates.productType = finalType;

    if (gstRate !== undefined) {
      const gst = Number(gstRate);

      if (!Number.isFinite(gst) || gst < 0 || gst > 100) {
        return res.status(400).json({
          message: "GST must be between 0 and 100.",
        });
      }

      updates.gstRate = gst;
    }

    const product = await Product.findByIdAndUpdate(
      req.params.id,
      { $set: updates },
      {
        new: true,
        runValidators: true,
      }
    );

    res.json(product);
  } catch (error) {
    console.error("Update product error:", error);

    if (
      error.name === "ValidationError" ||
      error.name === "CastError"
    ) {
      return res.status(400).json({
        message: error.message,
      });
    }

    res.status(500).json({
      message: "Failed to update product.",
    });
  }
});

// DELETE: Soft-delete a product
router.delete("/:id", async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({
        message: "Invalid product ID.",
      });
    }

    const product = await Product.findByIdAndUpdate(
      req.params.id,
      { $set: { isActive: false } },
      { new: true }
    );

    if (!product) {
      return res.status(404).json({
        message: "Product not found.",
      });
    }

    res.json({
      message: "Product deactivated successfully.",
    });
  } catch (error) {
    console.error("Deactivate product error:", error);

    res.status(500).json({
      message: "Failed to deactivate product.",
    });
  }
});

module.exports = router;
