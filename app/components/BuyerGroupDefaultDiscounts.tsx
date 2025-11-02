import { Plus, Trash2 } from "lucide-react";
import { useState, useEffect } from "react";
import type { Tier } from "~/models/BuyerGroup";

interface Props {
  formData: FormData;
  updateFormData: (
    field: keyof FormData | "priceConfig",
    value: string,
  ) => void;
  showValidationErrors?: boolean;
}
interface FormData {
  tiers: Tier[];
  priceConfig?: string;
}

function coerceMaxQty(val: any): number | "" {
  if (val === "" || val === undefined || val === null) return "";
  const num = Number(val);
  return isNaN(num) ? "" : num;
}

function BuyerDefaultDiscounts({ formData, updateFormData, showValidationErrors }: Props) {
  const [tiers, setTiers] = useState<Tier[]>(formData.tiers || []);
  const [tier, setTier] = useState<Tier>(
    formData.tiers && formData.tiers[0]
      ? {
          ...formData.tiers[0],
          maxQty: coerceMaxQty(formData.tiers[0].maxQty),
        }
      : {
          discountPercent: "",
          minQty: 1,
          maxQty: "",
          increments: 1,
        },
  );
  const [discountError, setDiscountError] = useState<string>("");
  const [maxQtyError, setMaxQtyError] = useState<string>("");
  const [incrementsError, setIncrementsError] = useState<string>("");
  const [priceConfigArr, setPriceConfigArr] = useState<
    { quantity: number; value: number }[]
  >([]);
  const [priceBreakErrors, setPriceBreakErrors] = useState<{
    [key: number]: string;
  }>({});

  useEffect(() => {
    let arr: { quantity: number; value: number }[] = [];
    try {
      arr = Array.isArray(formData.priceConfig)
        ? formData.priceConfig.map((pb: any) => ({
            quantity: Number(pb.quantity),
            value: Number(pb.value),
          }))
        : formData.priceConfig
          ? JSON.parse(formData.priceConfig).map((pb: any) => ({
              quantity: Number(pb.quantity),
              value: Number(pb.value),
            }))
          : [];
      if (!Array.isArray(arr)) arr = [];
    } catch {
      arr = [];
    }
    setPriceConfigArr(arr);
  }, [formData.priceConfig]);

  // Ensure priceConfig is always set in parent form state on mount (edit mode)
  useEffect(() => {
    if (formData.priceConfig) {
      let arr: { quantity: number; value: number }[] = [];
      try {
        arr = Array.isArray(formData.priceConfig)
          ? formData.priceConfig.map((pb: any) => ({
              quantity: Number(pb.quantity),
              value: Number(pb.value),
            }))
          : JSON.parse(formData.priceConfig).map((pb: any) => ({
              quantity: Number(pb.quantity),
              value: Number(pb.value),
            }));
      } catch {
        arr = [];
      }
      updateFormData("priceConfig", JSON.stringify(arr));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Validate discount field on mount and when tier changes
  useEffect(() => {
    if (tier.discountPercent === "") {
      setDiscountError("Discount % is required");
    } else if (tier.discountPercent && !validateDiscountPercent(tier.discountPercent)) {
      setDiscountError("Discount % must be a valid number between 0 and 100");
    } else {
      setDiscountError("");
    }
  }, [tier.discountPercent]);

  // Show validation errors when triggered from parent
  useEffect(() => {
    if (showValidationErrors) {
      if (tier.discountPercent === "") {
        setDiscountError("Discount % is required");
      } else if (tier.discountPercent && !validateDiscountPercent(tier.discountPercent)) {
        setDiscountError("Discount % must be a valid number between 0 and 100");
      }
    }
  }, [showValidationErrors, tier.discountPercent]);

  function handleAddPrice(e: any): void {
    e.preventDefault();
    
    // Validate required discount field first
    if (!tier.discountPercent || !validateDiscountPercent(tier.discountPercent)) {
      setDiscountError("Discount % is required");
      return;
    }
    
    if (
      tier.minQty &&
      (tier.maxQty || tier.maxQty === 0 || tier.maxQty === "") &&
      tier.increments
    ) {
      // Calculate the quantity for the new price break
      let newQuantity = tier.minQty;
      if (priceConfigArr.length > 0) {
        const prev = priceConfigArr[priceConfigArr.length - 1];
        newQuantity = prev.quantity + tier.increments;
      }

      // Validate that new quantity doesn't exceed max quantity from Default Discount & Quantity Rules
      if (
        tier.maxQty !== "" &&
        typeof tier.maxQty === "number" &&
        newQuantity > tier.maxQty
      ) {
        setPriceBreakErrors((prev) => ({
          ...prev,
          [priceConfigArr.length]: `Quantity ${newQuantity} exceeds maximum quantity ${tier.maxQty} from Default Discount & Quantity Rules.`,
        }));
        return;
      }

      // Clear any existing errors for this index
      setPriceBreakErrors((prev) => {
        const newErrors = { ...prev };
        delete newErrors[priceConfigArr.length];
        return newErrors;
      });

      // Add the new price break
      const newPriceBreak = {
        quantity: newQuantity,
        value: parseInt(tier.discountPercent) || 0,
      };
      const updatedPriceConfig = [...priceConfigArr, newPriceBreak];
      setPriceConfigArr(updatedPriceConfig);
      updateFormData("priceConfig", JSON.stringify(updatedPriceConfig));
      // Optionally reset tier fields if you want
    } else {
      alert("All fields must be filled out correctly.");
    }
  }

  function handleTierChange(
    index: number,
    field: keyof Tier,
    value: string | number,
  ): void {
    const updatedTiers = tiers.map((t, i) => {
      if (i === index) {
        return { ...t, [field]: value };
      }
      return t;
    });
    setTiers(updatedTiers);
    // Update parent form data
    updateFormData("tiers", JSON.stringify(updatedTiers));
  }

  function validateDiscountPercent(value: string): boolean {
    // Check if empty first (required field)
    if (value === "" || value === null || value === undefined) {
      return false;
    }
    
    const num = Number(value);
    if (
      isNaN(num) ||
      /[^0-9.]/.test(value) ||
      num < 0 ||
      num > 100
    ) {
      return false;
    }
    return true;
  }

  function validatePriceBreakQuantity(quantity: number): boolean {
    // Check if quantity exceeds max quantity from Default Discount & Quantity Rules
    if (
      tier.maxQty !== "" &&
      typeof tier.maxQty === "number" &&
      quantity > tier.maxQty
    ) {
      return false;
    }
    return true;
  }

  function handleDefaultTierChange(field: keyof Tier, value: string | number) {
    if (field === "discountPercent") {
      setTier({ ...tier, [field]: String(value) });
      if (String(value) === "") {
        setDiscountError("Discount % is required");
        return;
      }
      if (!validateDiscountPercent(String(value))) {
        setDiscountError("Discount % must be a number between 0 and 100.");
        return;
      } else {
        setDiscountError("");
      }
      const updatedTier: Tier = {
        ...tier,
        [field]: String(value),
        minQty: Number(tier.minQty),
        maxQty: tier.maxQty === "" ? "" : Number(tier.maxQty),
        increments: Number(tier.increments),
      };
      updateFormData("tiers", JSON.stringify([updatedTier]));
      return;
    }
    // Handle minQty and increments defaulting to 1 if empty
    if (field === "minQty") {
      const minQtyVal = value === "" ? 1 : Number(value);
      const updatedTier: Tier = {
        ...tier,
        minQty: minQtyVal,
        discountPercent: String(tier.discountPercent),
        maxQty: tier.maxQty === "" ? "" : Number(tier.maxQty),
        increments: Number(tier.increments),
      };
      setTier(updatedTier);
      // Also revalidate maxQty if it has a value
      if (
        tier.maxQty !== "" &&
        typeof tier.maxQty === "number" &&
        tier.maxQty <= minQtyVal
      ) {
        setMaxQtyError("Max quantity must be greater than min quantity.");
      } else {
        setMaxQtyError("");
      }
      // Also revalidate increments if maxQty is set
      if (
        tier.maxQty !== "" &&
        typeof tier.maxQty === "number" &&
        tier.increments > tier.maxQty
      ) {
        setIncrementsError("Increments must not exceed max quantity.");
      } else {
        setIncrementsError("");
      }
      updateFormData("tiers", JSON.stringify([updatedTier]));
      return;
    }
    if (field === "increments") {
      const incrementsVal = value === "" ? 1 : Number(value);
      if (
        tier.maxQty !== "" &&
        typeof tier.maxQty === "number" &&
        incrementsVal > tier.maxQty - tier.minQty
      ) {
        setIncrementsError(
          "Increments must not exceed the difference between max and min quantity.",
        );
        setTier({ ...tier, increments: incrementsVal });
        return;
      } else {
        setIncrementsError("");
      }
      const updatedTier: Tier = {
        ...tier,
        increments: incrementsVal,
        discountPercent: String(tier.discountPercent),
        minQty: Number(tier.minQty),
        maxQty: tier.maxQty === "" ? "" : Number(tier.maxQty),
      };
      setTier(updatedTier);
      updateFormData("tiers", JSON.stringify([updatedTier]));
      return;
    }
    if (field === "maxQty") {
      let maxQtyVal: number | "" = value === "" ? "" : Number(value);
      if (maxQtyVal !== "" && isNaN(maxQtyVal)) {
        setMaxQtyError("Max quantity must be a number.");
        maxQtyVal = "";
      } else if (maxQtyVal !== "" && maxQtyVal <= tier.minQty) {
        setMaxQtyError("Max quantity must be greater than min quantity.");
      } else {
        setMaxQtyError("");
      }
      if (maxQtyVal !== "" && tier.increments > maxQtyVal) {
        setIncrementsError("Increments must not exceed max quantity.");
      } else {
        setIncrementsError("");
      }
      const updatedTier: Tier = {
        ...tier,
        maxQty: maxQtyVal,
        discountPercent: String(tier.discountPercent),
        minQty: Number(tier.minQty),
        increments: Number(tier.increments),
      };
      setTier(updatedTier);
      updateFormData("tiers", JSON.stringify([updatedTier]));
      return;
    }

    const updatedTier: Tier = {
      ...tier,
      [field]: value,
      discountPercent: String(tier.discountPercent),
      minQty: Number(tier.minQty),
      maxQty: tier.maxQty === "" ? "" : Number(tier.maxQty),
      increments: Number(tier.increments),
    };
    setTier(updatedTier);
    updateFormData("tiers", JSON.stringify([updatedTier]));
  }
  // hello this is test
  function handleRemoveTier(index: number): void {
    const updatedTiers = tiers.filter((_, i) => i !== index);
    setTiers(updatedTiers);
    // Update parent form data
    updateFormData("tiers", JSON.stringify(updatedTiers));
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[25%,1fr,1fr] gap-6">
      <div className="lg:col-span-1 space-y-6">
        <div className=" rounded-lg p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-2">
            Default Discount & Qty Rules
          </h2>
          <p className="text-sm mb-4">
            Applies to all products for buyers in this group. You can override
            each of these settings in the next step for specific collections,
            products, or variants.
          </p>
        </div>
      </div>
      <div className="lg:col-span-2 space-y-6">
        <div className="bg-white rounded-lg p-6">
          <div className="flex items-center gap-2 mb-6">
            <h3 className="text-lg font-medium text-gray-900">
              Default Discount & Quantity Rules
            </h3>
          </div>

          <div className="grid grid-cols-4 gap-4 mb-6">
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700">
                Discount (%) <span className="text-red-500">*</span> <span className="text-xs text-gray-500">(Required)</span>
              </label>
              <input
                type="text"
                value={tier.discountPercent}
                onChange={(e) =>
                  handleDefaultTierChange("discountPercent", e.target.value)
                }
                onBlur={(e) => {
                  if (!e.target.value.trim()) {
                    setDiscountError("Discount % is required");
                  } else if (!validateDiscountPercent(e.target.value)) {
                    setDiscountError("Discount % must be a valid number between 0 and 100");
                  } else {
                    setDiscountError("");
                  }
                }}
                className={`w-full px-3 py-2 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
                  discountError
                    ? "border-red-300 focus:ring-red-500 focus:border-red-500"
                    : "border-gray-300"
                }`}
                placeholder="Enter discount percentage"
              />
              {discountError && (
                <p className="mt-1 text-sm text-red-600">{discountError}</p>
              )}
              <p className="text-xs text-gray-500">% off full retail price</p>
            </div>

            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700">
                Minimum Qty
              </label>
              <input
                type="text"
                value={tier.minQty}
                onChange={(e) =>
                  handleDefaultTierChange(
                    "minQty",
                    parseInt(e.target.value) || 1,
                  )
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
              <p className="text-xs text-gray-500">
                Defaults to 1 if left blank
              </p>
            </div>

            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700">
                Maximum Qty
              </label>
              <input
                type="text"
                value={tier.maxQty}
                onChange={(e) =>
                  handleDefaultTierChange(
                    "maxQty",
                    e.target.value === "" ? "" : parseInt(e.target.value),
                  )
                }
                className={`w-full px-3 py-2 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
                  maxQtyError
                    ? "border-red-300 focus:ring-red-500 focus:border-red-500"
                    : "border-gray-300"
                }`}
              />
              {maxQtyError && (
                <p className="mt-1 text-sm text-red-600">{maxQtyError}</p>
              )}
              <p className="text-xs text-gray-500">No maximum if left blank</p>
            </div>

            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700">
                Increments
              </label>
              <input
                type="text"
                value={tier.increments}
                onChange={(e) =>
                  handleDefaultTierChange(
                    "increments",
                    parseInt(e.target.value) || 1,
                  )
                }
                className={`w-full px-3 py-2 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
                  incrementsError
                    ? "border-red-300 focus:ring-red-500 focus:border-red-500"
                    : "border-gray-300"
                }`}
              />
              {incrementsError && (
                <p className="mt-1 text-sm text-red-600">{incrementsError}</p>
              )}
              <p className="text-xs text-gray-500">
                Defaults to 1 if left blank
              </p>
            </div>
          </div>

          {/* Tiered Price Breaks */}
          <div className="border-t pt-6">
            <div className="flex items-center gap-2 mb-4">
              <h4 className="text-base font-medium text-gray-900">
                Tiered Price Breaks
              </h4>
            </div>

            {/* Price Breaks List Styled Like Tiers */}
            {priceConfigArr.length > 0 ? (
              <div className="space-y-4 mb-6 bg-[rgb(249,250,251)] p-4 rounded-md">
                {/* Header */}
                <div className="grid grid-cols-4 gap-4 text-sm font-medium text-gray-700 pb-2 border-b border-gray-200">
                  <div>Tier Name</div>
                  <div>Minimum Qty</div>
                  <div>Discount (%)</div>
                  <div>Actions</div>
                </div>
                {/* Price Break Rows */}
                {priceConfigArr.map((pb, index) => (
                  <div
                    key={index}
                    className="grid grid-cols-4 gap-4 items-center"
                  >
                    <div className="text-sm font-medium text-gray-900">
                      Tier {index + 1}
                    </div>
                    <div>
                      <input
                        type="text"
                        value={pb.quantity}
                        onChange={(e) => {
                          const newQuantity = Number(e.target.value);
                          if (!validatePriceBreakQuantity(newQuantity)) {
                            setPriceBreakErrors((prev) => ({
                              ...prev,
                              [index]: `Quantity ${newQuantity} exceeds maximum quantity ${tier.maxQty} from Default Discount & Quantity Rules.`,
                            }));
                            return;
                          }

                          // Clear error for this index if validation passes
                          setPriceBreakErrors((prev) => {
                            const newErrors = { ...prev };
                            delete newErrors[index];
                            return newErrors;
                          });

                          const updated = priceConfigArr.map((item, i) =>
                            i === index
                              ? { ...item, quantity: newQuantity }
                              : item,
                          );
                          setPriceConfigArr(updated);
                          updateFormData(
                            "priceConfig",
                            JSON.stringify(updated),
                          );
                        }}
                        className={`w-full px-2 py-1 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                          priceBreakErrors[index]
                            ? "border-red-300 focus:ring-red-500 focus:border-red-500"
                            : "border-gray-300"
                        }`}
                      />
                      {priceBreakErrors[index] && (
                        <p className="mt-1 text-sm text-red-600">
                          {priceBreakErrors[index]}
                        </p>
                      )}
                    </div>
                    <div>
                      <input
                        type="text"
                        value={pb.value}
                        onChange={(e) => {
                          const updated = priceConfigArr.map((item, i) =>
                            i === index
                              ? { ...item, value: Number(e.target.value) }
                              : item,
                          );
                          setPriceConfigArr(updated);
                          updateFormData(
                            "priceConfig",
                            JSON.stringify(updated),
                          );
                        }}
                        className="w-full px-2 py-1 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <button
                        type="button"
                        onClick={() => {
                          const updated = priceConfigArr.filter(
                            (_, i) => i !== index,
                          );
                          setPriceConfigArr(updated);
                          updateFormData(
                            "priceConfig",
                            JSON.stringify(updated),
                          );

                          // Clear error for the removed price break
                          setPriceBreakErrors((prev) => {
                            const newErrors = { ...prev };
                            delete newErrors[index];
                            return newErrors;
                          });
                        }}
                        className="p-1 text-gray-400 hover:text-red-500"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="bg-gray-50 rounded-lg p-4 text-center mb-6">
                <p className="text-sm text-gray-500 mb-2">
                  No tiered price breaks set up.
                </p>
                <p className="text-xs text-gray-400">
                  Products assigned to this override will be excluded from
                  tiered pricing rules set at the default (intermediate) level.
                </p>
              </div>
            )}
          </div>

          {/* Error display for Add Price Break */}
          {Object.keys(priceBreakErrors).length > 0 && (
            <div className="mb-2">
              {Object.entries(priceBreakErrors).map(([index, error]) => (
                <p key={index} className="text-sm text-red-600">
                  {error}
                </p>
              ))}
            </div>
          )}

          <div className="flex justify-end my-4">
            <button
              type="button"
              onClick={handleAddPrice}
              disabled={!tier.discountPercent || !validateDiscountPercent(tier.discountPercent)}
              className={`inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md focus:outline-none focus:ring-2 focus:ring-offset-2 ${
                !tier.discountPercent || !validateDiscountPercent(tier.discountPercent)
                  ? 'text-gray-400 bg-gray-100 border border-gray-200 cursor-not-allowed'
                  : 'text-blue-600 bg-white border border-gray-300 hover:bg-gray-50 focus:ring-blue-500'
              }`}
            >
              <Plus className="w-4 h-4" />
              Add Price Break
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default BuyerDefaultDiscounts;
