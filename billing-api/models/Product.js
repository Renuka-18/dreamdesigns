const mongoose = require("mongoose");

const productSchema = new mongoose.Schema(
  {
    // Generated automatically by the backend; not shown in the form.
    productCode: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },

    name: {
      type: String,
      required: true,
      trim: true,
    },

    // Retained for compatibility with existing records.
    category: {
      type: String,
      default: "",
      trim: true,
    },

    productType: {
      type: String,
      enum: ["Retail", "Wholesale","Empty Frames"],
      required: true,
      default: "Retail",
    },

    retailPrice: {
      type: Number,
      default: 0,
      min: 0,
    },

    wholesalePrice: {
      type: Number,
      default: 0,
      min: 0,
    },
 emptyframesPrice: {
      type: Number,
      default: 0,
      min: 0,
    },
    // Retained for compatibility; not used in the product form.
    stockQuantity: {
      type: Number,
      default: 0,
      min: 0,
    },

    gstRate: {
      type: Number,
      default: 0,
      min: 0,
      max: 100,
    },

    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Product", productSchema);