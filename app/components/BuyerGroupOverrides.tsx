import { Plus, Search, X, Edit, ChevronDown } from "lucide-react";
import React, {
  useState,
  useEffect,
  useImperativeHandle,
  forwardRef,
} from "react";
import PortalModal from "./PortalModal";

interface FormData {
  netTermsEnabled: boolean;
  overrides?: string;
}

type OverrideItem = {
  type: string;
  id: string;
  discount_type: string;
  volumeConfig: {
    increments: number | null;
    maximum: number | null;
    minimum: number | null;
  };
  priceConfig: Array<{ quantity: number; value: number }>;
  // Optional fields for enriched data
  image?: string;
  title?: string;
  variantTitle?: string | null;
  price?: string;
  appliesTo?: string;
  discountValue?: number; // <-- add this for grouping and display
};

interface Props {
  formData: FormData;
  updateFormData: (field: keyof FormData, value: string) => void;
  productOverrides?: OverrideItem[];
  collectionOverrides?: OverrideItem[];
  onOverridesChange?: () => void;
}

interface ProductResource {
  id: string;
  title: string;
  handle: string;
  images: Array<{
    originalSrc: string;
    altText?: string;
  }>;
  variants: Array<{
    id: string;
    title: string;
    price: string;
    displayName: string;
  }>;
  totalVariants: number;
}

interface ListItem {
  id: string;
  type: "product" | "variant" | "collection";
  productId: string;
  variantId?: string;
  title: string;
  variantTitle?: string;
  price?: string;
  image?: string;
  imageAlt?: string;
  // Override specific fields
  appliesTo: "products" | "collections";
  discountType?: "percentage" | "fixed";
  discount_type?: "percentage" | "fixed";
  discountValue?: number;
  minQuantity?: number | null | undefined;
  maxQuantity?: number | "" | null | undefined;
  increments?: number | null | undefined;
  tieredBreaks?: Array<{
    quantity: number;
    discountValue: number;
    tierName: string;
  }>;
  priceConfig?: Array<{ quantity: number; value: number; tierName?: string }>;
  volumeConfig?: {
    minimum: number | null;
    maximum: number | null;
    increments: number | null;
  };
}

interface OverrideFormData {
  appliesTo: "products" | "collections";
  selectedResources: Array<{
    id: string;
    title: string;
    image?: string;
    variantId?: string;
    variantTitle?: string;
    price?: string;
    productId?: string;
  }>;
  discountType: "percentage" | "fixed";
  discountValue: number;
  minQuantity: number | "";
  maxQuantity: number | "";
  increments: number | "";
  tieredBreaks: Array<{
    quantity: number;
    discountValue: number;
    tierName: string;
  }>;
}

const BuyerGroupOverrides = forwardRef(function BuyerGroupOverrides(
  {
    productOverrides = [],
    collectionOverrides = [],
    updateFormData,
    onOverridesChange,
  }: Props,
  ref,
) {
  // Pagination constant - must be declared before any usage
  const itemsPerPage = 10;

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);

  const [selectedItems, setSelectedItems] = useState<ListItem[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [editingItem, setEditingItem] = useState<ListItem | null>(null);
  const [activeTab, setActiveTab] = useState<
    "all" | "products" | "collections"
  >("all");
  const [overrideForm, setOverrideForm] = useState<OverrideFormData>({
    appliesTo: "products",
    selectedResources: [],
    discountType: "percentage",
    discountValue: 40,
    minQuantity: 1,
    maxQuantity: "",
    increments: 1,
    tieredBreaks: [],
  });
  const [localTieredBreaks, setLocalTieredBreaks] = useState<
    { quantity: number; discountValue: number; tierName: string }[]
  >([]);

  // Search functionality state
  const [searchQuery, setSearchQuery] = useState<string>("");

  // Validation state variables
  const [discountError, setDiscountError] = useState<string>("");
  const [maxQtyError, setMaxQtyError] = useState<string>("");
  const [incrementsError, setIncrementsError] = useState<string>("");
  const [tieredBreakErrors, setTieredBreakErrors] = useState<{
    [key: number]: string;
  }>({});

  // Validation functions (same as BuyerGroupDefaultDiscounts)
  function validateDiscountPercent(
    value: string,
    discountType: "percentage" | "fixed",
  ) {
    const num = Number(value);
    if (value === "" || isNaN(num) || /[^0-9.]/.test(value) || num < 0) {
      return false;
    }
    if (discountType === "percentage" && num > 100) {
      return false;
    }
    return true;
  }

  function coerceMaxQty(val: any): number | "" {
    if (val === "" || val === undefined || val === null) return "";
    const num = Number(val);
    return isNaN(num) ? "" : num;
  }

  function validateTieredBreakQuantity(quantity: number): boolean {
    // Check if quantity exceeds max quantity from Discount & Quantity Rules
    if (
      overrideForm.maxQuantity !== "" &&
      typeof overrideForm.maxQuantity === "number" &&
      quantity > overrideForm.maxQuantity
    ) {
      return false;
    }
    return true;
  }

  // Validation handlers for form fields
  const handleDiscountValueChange = (value: number) => {
    if (String(value) === "") {
      setDiscountError("Discount % is required.");
      return;
    }
    if (!validateDiscountPercent(String(value), overrideForm.discountType)) {
      setDiscountError(
        overrideForm.discountType === "percentage"
          ? "Discount % must be a number between 0 and 100."
          : "Discount must be a positive number.",
      );
      return;
    } else {
      setDiscountError("");
    }
    setOverrideForm((prev) => ({
      ...prev,
      discountValue: value,
    }));
  };

  const handleMinQuantityChange = (value: number | string) => {
    const minQtyVal = value === "" ? "" : Number(value);
    setOverrideForm((prev) => ({
      ...prev,
      minQuantity: minQtyVal,
    }));
    // Revalidate maxQty if it has a value
    const maxQtyNum = Number(overrideForm.maxQuantity);
    const minQtyNum = Number(minQtyVal);
    const incrementsNum = Number(overrideForm.increments);
    if (
      overrideForm.maxQuantity !== "" &&
      !isNaN(maxQtyNum) &&
      !isNaN(minQtyNum) &&
      maxQtyNum <= minQtyNum
    ) {
      setMaxQtyError("Max quantity must be greater than min quantity.");
    } else {
      setMaxQtyError("");
    }
    // Revalidate increments if maxQty is set
    if (
      overrideForm.maxQuantity !== "" &&
      !isNaN(incrementsNum) &&
      !isNaN(maxQtyNum) &&
      incrementsNum > maxQtyNum
    ) {
      setIncrementsError("Increments must not exceed max quantity.");
    } else {
      setIncrementsError("");
    }
  };

  const handleMaxQuantityChange = (value: number | string) => {
    let maxQtyVal: number | "" = value === "" ? "" : Number(value);
    const minQtyNum = Number(overrideForm.minQuantity);
    const incrementsNum = Number(overrideForm.increments);

    if (maxQtyVal !== "" && isNaN(maxQtyVal)) {
      setMaxQtyError("Max quantity must be a number.");
      maxQtyVal = "";
    } else if (maxQtyVal !== "" && maxQtyVal <= minQtyNum) {
      setMaxQtyError("Max quantity must be greater than min quantity.");
    } else {
      setMaxQtyError("");
    }

    // Revalidate increments if set
    if (maxQtyVal !== "" && incrementsNum > maxQtyVal) {
      setIncrementsError("Increments must not exceed max quantity.");
    } else {
      setIncrementsError("");
    }

    setOverrideForm((prev) => ({
      ...prev,
      maxQuantity: maxQtyVal,
    }));
  };

  const handleIncrementsChange = (value: number | string) => {
    const incrementsVal = value === "" ? "" : Number(value);

    // Validate increments does not exceed (maxQty - minQty) if maxQty is set
    if (
      overrideForm.maxQuantity !== "" &&
      incrementsVal !== "" &&
      Number(incrementsVal) >
        Number(overrideForm.maxQuantity) - Number(overrideForm.minQuantity || 0)
    ) {
      setIncrementsError(
        "Increments must not exceed the difference between max and min quantity.",
      );
    } else {
      setIncrementsError("");
    }

    setOverrideForm((prev) => ({
      ...prev,
      increments: incrementsVal,
    }));
  };

  // Sync selectedItems with incoming props
  useEffect(() => {
    if (!showModal) {
      // Convert productOverrides and collectionOverrides to ListItem[]
      const productItems = (productOverrides || []).map((item) => ({
        id: item.id,
        type:
          item.type === "variant"
            ? "variant"
            : ("product" as "product" | "variant"),
        productId: (item as any).productId || item.id, // use parent productId for variants
        variantId: item.type === "variant" ? item.id : undefined,
        title:
          typeof (item as any).productTitle === "string" &&
          (item as any).productTitle
            ? (item as any).productTitle
            : item.title || "",
        variantTitle:
          typeof item.variantTitle === "string" ? item.variantTitle : undefined,
        price: item.price,
        image: item.image,
        appliesTo: "products" as const,
        // Ensure both discountType and discount_type are set and consistent, and type safe
        discountType: (item.discountType ||
          item.discount_type ||
          "percentage") as "fixed" | "percentage",
        discount_type: (item.discountType ||
          item.discount_type ||
          "percentage") as "fixed" | "percentage",
        discountValue:
          item.priceConfig && item.priceConfig.length > 0
            ? item.priceConfig[0].value
            : typeof item.discountValue === "number"
              ? item.discountValue
              : undefined,
        minQuantity: item.volumeConfig?.minimum ?? null,
        maxQuantity: item.volumeConfig?.maximum ?? null,
        increments: item.volumeConfig?.increments ?? null,
        tieredBreaks:
          item.priceConfig?.map((pc) => ({
            quantity: pc.quantity,
            discountValue: pc.value,
            tierName: pc.tierName,
          })) || [],
        priceConfig: item.priceConfig?.map((pc) => ({
          quantity: pc.quantity,
          value: pc.value,
        })),
        volumeConfig: {
          minimum: item.volumeConfig?.minimum ?? 1,
          maximum: item.volumeConfig?.maximum ?? null,
          increments: item.volumeConfig?.increments ?? 1,
        },
      }));

      const collectionItems = (collectionOverrides || []).map((item) => ({
        id: item.id,
        type: "collection" as const,
        productId: item.id,
        title: item.title || "",
        image: item.image,
        appliesTo: "collections" as const,
        // Ensure both discountType and discount_type are set and consistent, and type safe
        discountType: (item.discountType ||
          item.discount_type ||
          "percentage") as "fixed" | "percentage",
        discount_type: (item.discountType ||
          item.discount_type ||
          "percentage") as "fixed" | "percentage",
        discountValue:
          item.priceConfig && item.priceConfig.length > 0
            ? item.priceConfig[0].value
            : typeof item.discountValue === "number"
              ? item.discountValue
              : undefined,
        minQuantity:
          item.volumeConfig?.minimum !== null &&
          item.volumeConfig?.minimum !== undefined
            ? item.volumeConfig.minimum
            : 1,
        maxQuantity:
          item.volumeConfig?.maximum !== null &&
          item.volumeConfig?.maximum !== undefined
            ? item.volumeConfig.maximum
            : null,
        increments:
          item.volumeConfig?.increments !== null &&
          item.volumeConfig?.increments !== undefined
            ? item.volumeConfig.increments
            : 1,
        tieredBreaks:
          item.priceConfig?.map((pc) => ({
            quantity: pc.quantity,
            discountValue: pc.value,
            tierName: pc.tierName,
          })) || [],
        priceConfig: item.priceConfig?.map((pc) => ({
          quantity: pc.quantity,
          value: pc.value,
        })),
        volumeConfig: {
          minimum: item.volumeConfig?.minimum ?? 1,
          maximum: item.volumeConfig?.maximum ?? null,
          increments: item.volumeConfig?.increments ?? 1,
        },
      }));
      const mappedOverrides = [...productItems, ...collectionItems];
      setSelectedItems(mappedOverrides);
      // --- NEW: Always push mapped overrides to parent if changed ---
      // Only update if the mapped overrides differ from parent's value (to avoid loops)
      try {
        const parentOverrides =
          Array.isArray(productOverrides) || Array.isArray(collectionOverrides)
            ? [...(productOverrides || []), ...(collectionOverrides || [])]
            : [];
        // Compare mappedOverrides and parentOverrides by JSON (safe since order is preserved)
        if (
          JSON.stringify(mappedOverrides) !== JSON.stringify(parentOverrides)
        ) {
          updateFormData("overrides", JSON.stringify(mappedOverrides));
        }
      } catch (e) {
        // fallback: always update
        updateFormData("overrides", JSON.stringify(mappedOverrides));
      }
      // DO NOT call updateFormData('overrides', ...) here! (old comment, now we do)
    }
  }, [productOverrides, collectionOverrides, showModal, updateFormData]);

  // Helper to count items for each tab
  function getTabCount(tab: "all" | "products" | "collections") {
    if (tab === "all") return selectedItems.length;
    if (tab === "products")
      return selectedItems.filter((i) => i.appliesTo === "products").length;
    if (tab === "collections")
      return selectedItems.filter((i) => i.appliesTo === "collections").length;
    return 0;
  }

  // Expose selectedItems to parent form
  const handleResourceSelection = async (): Promise<void> => {
    await handleResourceSelectionWithQuery("");
  };

  // Handle resource selection with search query
  const handleResourceSelectionWithQuery = async (query: string): Promise<void> => {
    try {
      const resourceType =
        overrideForm.appliesTo === "collections" ? "collection" : "product";

      // Use the modern shopify.resourcePicker API
      const selection =
        (await shopify.resourcePicker({
          type: resourceType,
          multiple: true,
          action: "select",
          query: query, // Pre-populate search with query
          options: {
            showVariants: overrideForm.appliesTo === "products",
            showHidden: false,
            showDraft: false,
          },
        })) || [];

      if (selection && selection.length > 0) {
        let resources: any[] = [];
        if (overrideForm.appliesTo === "products") {
          for (const item of selection) {
            const itemAny = item as any;
            if (itemAny.variants && itemAny.variants.length > 0) {
              for (const variant of itemAny.variants) {
                resources.push({
                  id: variant.id,
                  title: itemAny.title,
                  image:
                    itemAny.images &&
                    Array.isArray(itemAny.images) &&
                    itemAny.images[0]
                      ? itemAny.images[0].originalSrc
                      : undefined,
                  variantId: variant.id,
                  variantTitle: variant.title || variant.displayName,
                  price: variant.price,
                  productId: itemAny.id,
                });
              }
            } else {
              resources.push({
                id: itemAny.id,
                title: itemAny.title,
                image:
                  itemAny.images &&
                  Array.isArray(itemAny.images) &&
                  itemAny.images[0]
                    ? itemAny.images[0].originalSrc
                    : undefined,
              });
            }
          }
        } else {
          for (const item of selection) {
            resources.push({
              id: item.id,
              title: item.title,
              image:
                "image" in item && item.image
                  ? item.image
                  : "images" in item &&
                      Array.isArray((item as any).images) &&
                      (item as any).images[0]
                    ? (item as any).images[0].originalSrc
                    : undefined,
            });
          }
        }
        // Build list of valid Shopify IDs for fetching
        let ids: string[] = [];
        if (overrideForm.appliesTo === "products") {
          ids = resources
            .map((res) => res.variantId || res.productId || res.id)
            .filter(
              (id) =>
                id && typeof id === "string" && id.startsWith("gid://shopify/"),
            );
        } else {
          ids = resources
            .map((res) => res.id)
            .filter(
              (id) =>
                id && typeof id === "string" && id.startsWith("gid://shopify/"),
            );
        }
        // Fetch real Shopify data for selected resources
        const type =
          overrideForm.appliesTo === "products" ? "products" : "collections";
        const response = await fetch("/api/buyer-group/fetch-shopify-info", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ids, type }),
        });
        const result = await response.json();
        const shopifyData = result.data || {};
        // Map Shopify data into resources
        const mergedResources = resources.map((res) => {
          const shopify = shopifyData[res.id] || {};
          if (overrideForm.appliesTo === "products") {
            return {
              ...res,
              title: shopify.title || res.title,
              variantTitle: shopify.variantTitle || res.variantTitle,
              price: shopify.price || res.price,
              image: shopify.image || res.image,
            };
          } else {
            // collections
            return {
              ...res,
              title: shopify.title || res.title,
              image: shopify.image || res.image,
            };
          }
        });
        setOverrideForm((prev) => ({
          ...prev,
          selectedResources: mergedResources,
        }));
        // Immediately update main list and parent form
        setSelectedItems((prev) => [...prev, ...mergedResources]);
        updateFormData(
          "overrides",
          JSON.stringify([...selectedItems, ...mergedResources]),
        );
      }
    } catch (error) {
      console.log("Resource picker was cancelled or failed:", error);
    }
  };

  const openCreateModal = () => {
    setEditingItem(null);
    setOverrideForm({
      appliesTo: "products",
      selectedResources: [],
      discountType: "percentage",
      discountValue: 20,
      minQuantity: 1,
      maxQuantity: "",
      increments: 1,
      tieredBreaks: [],
    });
    setLocalTieredBreaks([]);
    setTieredBreakErrors({});
    setShowModal(true);
  };

  // --- NEW STATE for product and collection volume configs ---
  const [productVolumeConfigState, setProductVolumeConfigState] = useState<
    Record<string, { minQuantity: number | null; increments: number | null }>
  >({});
  const [collectionVolumeConfigState, setCollectionVolumeConfigState] =
    useState<
      Record<string, { minQuantity: number | null; increments: number | null }>
    >({});

  // --- Initialize state from DB on mount ---
  useEffect(() => {
    const productState: Record<
      string,
      { minQuantity: number | null; increments: number | null }
    > = {};
    (productOverrides || []).forEach((item) => {
      productState[item.id] = {
        minQuantity: item.volumeConfig?.minimum ?? null,
        increments: item.volumeConfig?.increments ?? null,
      };
    });
    setProductVolumeConfigState(productState);

    const collectionState: Record<
      string,
      { minQuantity: number | null; increments: number | null }
    > = {};
    (collectionOverrides || []).forEach((item) => {
      collectionState[item.id] = {
        minQuantity: item.volumeConfig?.minimum ?? null,
        increments: item.volumeConfig?.increments ?? null,
      };
    });
    setCollectionVolumeConfigState(collectionState);
  }, [productOverrides, collectionOverrides]);

  // --- When opening the popup, wire minQuantity/increments to state ---
  const openEditModal = (item: ListItem) => {
    const selectedItem = selectedItems.find((i) => i.id === item.id);
    const itemToUse = selectedItem || item;
    let tieredBreaks: Array<{ quantity: number; discountValue: number; tierName: string }> = [];
    if (
      Array.isArray(selectedItem?.tieredBreaks) &&
      selectedItem.tieredBreaks.length > 0
    ) {
      tieredBreaks = selectedItem.tieredBreaks;
    } else if (
      Array.isArray(item.tieredBreaks) &&
      item.tieredBreaks.length > 0
    ) {
      tieredBreaks = item.tieredBreaks;
    } else if (
      Array.isArray(selectedItem?.priceConfig) &&
      selectedItem.priceConfig.length > 0
    ) {
      tieredBreaks = selectedItem.priceConfig.map((pc, i) => ({
        quantity: pc.quantity,
        discountValue: pc.value,
        tierName: pc.tierName || `Tier ${i + 1}`,
      }));
    } else if (Array.isArray(item.priceConfig) && item.priceConfig.length > 0) {
      tieredBreaks = item.priceConfig.map((pc, i) => ({
        quantity: pc.quantity,
        discountValue: pc.value,
        tierName: pc.tierName || `Tier ${i + 1}`,
      }));
    }
    // Set discountValue for edit mode: if tieredBreaks exist, use the first break's value, else use itemToUse.discountValue
    const editDiscountValue =
      tieredBreaks.length > 0 &&
      typeof tieredBreaks[0].discountValue === "number"
        ? tieredBreaks[0].discountValue
        : itemToUse.discountValue || 0;
    setEditingItem(itemToUse);
    setLocalTieredBreaks([...tieredBreaks]);
    setTieredBreakErrors({});
    let minQuantity = "";
    let increments = "";
    if (
      itemToUse.appliesTo === "products" &&
      productVolumeConfigState[itemToUse.id]
    ) {
      minQuantity = productVolumeConfigState[itemToUse.id].minQuantity ?? "";
      increments = productVolumeConfigState[itemToUse.id].increments ?? "";
    } else if (
      itemToUse.appliesTo === "collections" &&
      collectionVolumeConfigState[itemToUse.id]
    ) {
      minQuantity = collectionVolumeConfigState[itemToUse.id].minQuantity ?? "";
      increments = collectionVolumeConfigState[itemToUse.id].increments ?? "";
    } else {
      minQuantity = itemToUse.volumeConfig?.minimum ?? "";
      increments = itemToUse.volumeConfig?.increments ?? "";
    }
    setOverrideForm({
      appliesTo: itemToUse.appliesTo || "products",
      selectedResources: [
        {
          id: itemToUse.id,
          title: itemToUse.title,
          image: itemToUse.image,
          variantId: itemToUse.variantId,
          variantTitle: itemToUse.variantTitle,
          price: itemToUse.price,
          productId: itemToUse.productId,
        },
      ],
      // Prefer discountType, fallback to discount_type, fallback to percentage
      discountType:
        itemToUse.discountType &&
        (itemToUse.discountType === "fixed" ||
          itemToUse.discountType === "percentage")
          ? itemToUse.discountType
          : itemToUse.discount_type &&
              (itemToUse.discount_type === "fixed" ||
                itemToUse.discount_type === "percentage")
            ? itemToUse.discount_type
            : "percentage",
      discountValue: editDiscountValue,
      minQuantity:
        itemToUse.volumeConfig &&
        typeof itemToUse.volumeConfig.minimum === "number" &&
        !isNaN(itemToUse.volumeConfig.minimum)
          ? itemToUse.volumeConfig.minimum
          : typeof itemToUse.minQuantity === "number" &&
              !isNaN(itemToUse.minQuantity)
            ? itemToUse.minQuantity
            : "",
      maxQuantity:
        typeof itemToUse.maxQuantity === "number" &&
        !isNaN(itemToUse.maxQuantity)
          ? itemToUse.maxQuantity
          : "",
      increments:
        itemToUse.volumeConfig &&
        typeof itemToUse.volumeConfig.increments === "number" &&
        !isNaN(itemToUse.volumeConfig.increments)
          ? itemToUse.volumeConfig.increments
          : typeof itemToUse.increments === "number" &&
              !isNaN(itemToUse.increments)
            ? itemToUse.increments
            : "",
      tieredBreaks: [...tieredBreaks],
    });
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setEditingItem(null);
    setLocalTieredBreaks([]);
    setTieredBreakErrors({});
  };

  const removeResource = (resourceId: string) => {
    setOverrideForm((prev) => ({
      ...prev,
      selectedResources: prev.selectedResources.filter(
        (r) => r.id !== resourceId,
      ),
    }));
  };

  const addTieredBreak = () => {
    setLocalTieredBreaks((prev) => {
      let nextQuantity = overrideForm.minQuantity || 1;
      const increment = overrideForm.increments || 1;
      if (prev.length > 0) {
        const lastBreak = prev[prev.length - 1];
        nextQuantity = lastBreak.quantity + increment;
      } else {
        nextQuantity = overrideForm.minQuantity || 1; // First tier should start at minQuantity
      }

      // Validate that new quantity doesn't exceed max quantity from Discount & Quantity Rules
      if (!validateTieredBreakQuantity(nextQuantity)) {
        setTieredBreakErrors((prevErrors) => ({
          ...prevErrors,
          [prev.length]: `Quantity ${nextQuantity} exceeds maximum quantity ${overrideForm.maxQuantity} from Discount & Quantity Rules.`,
        }));
        return prev; // Don't add the break if validation fails
      }

      // Clear any existing errors for this index
      setTieredBreakErrors((prevErrors) => {
        const newErrors = { ...prevErrors };
        delete newErrors[prev.length];
        return newErrors;
      });

      const defaultDiscountValue = overrideForm.discountValue || 0;
      const updated = [
        ...prev,
        {
          quantity: nextQuantity,
          discountValue: defaultDiscountValue,
          tierName: `Tier ${prev.length + 1}`,
        },
      ];
      setOverrideForm((of) => ({ ...of, tieredBreaks: updated }));
      return updated;
    });
  };

  const removeTieredBreak = (index: number) => {
    setLocalTieredBreaks((prev) => {
      const updated = prev.filter((_, i) => i !== index);
      
      // Reorder tier names to maintain sequential numbering
      const reordered = updated.map((break_, i) => ({
        ...break_,
        tierName: `Tier ${i + 1}`,
      }));
      
      setOverrideForm((of) => ({ ...of, tieredBreaks: reordered }));

      // Clear error for the removed tiered break
      setTieredBreakErrors((prevErrors) => {
        const newErrors = { ...prevErrors };
        delete newErrors[index];
        return newErrors;
      });

      return reordered;
    });
  };

  const updateTieredBreak = (
    index: number,
    field: "quantity" | "discountValue" | "tierName",
    value: number | string,
  ) => {
    // Validate quantity if that's what's being updated
    if (field === "quantity" && !validateTieredBreakQuantity(Number(value))) {
      setTieredBreakErrors((prevErrors) => ({
        ...prevErrors,
        [index]: `Quantity ${value} exceeds maximum quantity ${overrideForm.maxQuantity} from Discount & Quantity Rules.`,
      }));
      return; // Don't update if validation fails
    }

    // Clear error for this index if validation passes
    if (field === "quantity") {
      setTieredBreakErrors((prevErrors) => {
        const newErrors = { ...prevErrors };
        delete newErrors[index];
        return newErrors;
      });
    }

    setLocalTieredBreaks((prev) => {
      const updated = prev.map((break_, i) =>
        i === index ? { ...break_, [field]: value } : break_,
      );
      setOverrideForm((of) => ({ ...of, tieredBreaks: updated }));
      return updated;
    });
  };

  const saveOverride = () => {
    const newItems: ListItem[] = overrideForm.selectedResources.map(
      (resource) => {
        // Use tiered breaks if they exist, otherwise save without price breaks
        let breaks = localTieredBreaks && localTieredBreaks.length > 0
          ? localTieredBreaks.map((b, i) =>
              i === 0
                ? { ...b, discountValue: overrideForm.discountValue }
                : b,
            )
          : [];
        // --- FIX: Always use Shopify GID for collection id ---
        let id;
        if (overrideForm.appliesTo === "collections") {
          // If resource.id is already a GID, use it; otherwise, extract from override_... string
          id = resource.id.startsWith("gid://shopify/")
            ? resource.id
            : resource.id.replace(/^override_\d+_/, "");
        } else {
          id = editingItem ? editingItem.id : resource.variantId || resource.id;
        }
        // --- Ensure both flat and nested fields are set ---
        // Find the original DB override for this resource
        const originalOverride = (
          overrideForm.appliesTo === "products"
            ? productOverrides
            : collectionOverrides
        ).find((o) => o.id === (editingItem?.id || resource.id));
        
        const minQuantity =
          overrideForm.minQuantity !== "" && overrideForm.minQuantity != null
            ? overrideForm.minQuantity
            : originalOverride?.volumeConfig?.minimum != null
              ? originalOverride.volumeConfig.minimum
              : 1;
        const increments =
          overrideForm.increments !== "" && overrideForm.increments != null
            ? overrideForm.increments
            : originalOverride?.volumeConfig?.increments != null
              ? originalOverride.volumeConfig.increments
              : 1;
        const maxQuantity =
          overrideForm.maxQuantity !== "" && overrideForm.maxQuantity != null
            ? overrideForm.maxQuantity
            : originalOverride?.volumeConfig?.maximum != null
              ? originalOverride.volumeConfig.maximum
              : null;
        const overridePayload = {
          id,
          type: (resource.variantId
            ? "variant"
            : overrideForm.appliesTo === "collections"
              ? "collection"
              : "product") as "product" | "variant" | "collection",
          productId: resource.productId || resource.id,
          variantId: resource.variantId,
          title: resource.title,
          variantTitle: resource.variantTitle,
          price: resource.price,
          image: resource.image,
          appliesTo: overrideForm.appliesTo,
          discountType: overrideForm.discountType,
          discount_type: overrideForm.discountType, // <-- persist for reload
          discountValue: overrideForm.discountValue, // always sync with first break
          minQuantity,
          maxQuantity,
          increments,
          tieredBreaks: breaks,
          priceConfig: breaks.length > 0 ? breaks.map((b) => ({
            quantity: b.quantity,
            value: b.discountValue,
          })) : [],
          volumeConfig: {
            minimum: minQuantity,
            maximum: maxQuantity,
            increments: increments,
          },
        };
        return overridePayload;
      },
    );

    if (overrideForm.appliesTo === "products") {
      const productOverrides = overrideForm.selectedResources.map(
        (resource) => ({
          type: "variant" as const,
          id: resource.variantId || resource.id,
          discount_type: overrideForm.discountType,
          discountValue: overrideForm.discountValue,
          volumeConfig: {
            increments: overrideForm.increments || null,
            maximum: overrideForm.maxQuantity || null,
            minimum: overrideForm.minQuantity || null,
          },
          priceConfig: localTieredBreaks && localTieredBreaks.length > 0
            ? localTieredBreaks.map((break_) => ({
                quantity: break_.quantity,
                value: break_.discountValue,
              }))
            : [],
        }),
      );
    }

    // Create collectionOverrides objects for selected collections
    if (overrideForm.appliesTo === "collections") {
              const collectionOverrides = overrideForm.selectedResources.map(
          (resource) => ({
            type: "collection" as const,
            id: resource.id, // collectionId
            discount_type: overrideForm.discountType,
            discountValue: overrideForm.discountValue,
            volumeConfig: {
              increments: overrideForm.increments || null,
              maximum: overrideForm.maxQuantity || null,
              minimum: overrideForm.minQuantity || null,
            },
            priceConfig: localTieredBreaks && localTieredBreaks.length > 0
              ? localTieredBreaks.map((break_) => ({
                  quantity: break_.quantity,
                  value: break_.discountValue,
                }))
              : [],
          }),
        );
    }

    let updatedItems;
    if (editingItem) {
      updatedItems = selectedItems.map((item) => {
        const isMatch =
          item.id === editingItem.id &&
          item.appliesTo === editingItem.appliesTo &&
          (item.variantId ? item.variantId === editingItem.variantId : true);
        if (isMatch) {
          // Find the original DB override for this resource
          const originalOverride = (
            overrideForm.appliesTo === "products"
              ? productOverrides
              : collectionOverrides
          ).find((o) => o.id === (editingItem?.id || item.id));
          const userChangedType =
            overrideForm.discountType !==
            (originalOverride?.discount_type || originalOverride?.discountType);
          return {
            ...newItems[0],
            discountType: userChangedType
              ? overrideForm.discountType
              : originalOverride?.discount_type ||
                originalOverride?.discountType ||
                "percentage",
            discount_type: userChangedType
              ? overrideForm.discountType
              : originalOverride?.discount_type ||
                originalOverride?.discountType ||
                "percentage",
          };
        }
        return item;
      });
    } else {
      updatedItems = [
        ...selectedItems.filter(
          (item) => !newItems.some((newItem) => newItem.id === item.id),
        ),
        ...newItems.map((item) => ({
          ...item,
          discountType:
            item.discountType || overrideForm.discountType || "percentage",
          discount_type:
            item.discountType || overrideForm.discountType || "percentage",
        })),
      ];
    }
    
    // Ensure tieredBreaks is properly set
    const finalUpdatedItems = updatedItems.map((item) => ({
      ...item,
      tieredBreaks: item.tieredBreaks || [],
    }));

    setSelectedItems(finalUpdatedItems);
    // Always update parent form with the latest overrides
    updateFormData("overrides", JSON.stringify(finalUpdatedItems));
    if (onOverridesChange) onOverridesChange();
    closeModal();
  };

  const removeItem = (itemId: string) => {
    const updatedItems = selectedItems.filter((item) => item.id !== itemId);
    setSelectedItems(updatedItems);
    updateFormData("overrides", JSON.stringify(updatedItems));
  };

  // Tab filtering
  const getFilteredItems = () => {
    switch (activeTab) {
      case "products":
        return selectedItems.filter((i) => i.appliesTo === "products");
      case "collections":
        return selectedItems.filter((i) => i.appliesTo === "collections");
      default:
        return selectedItems;
    }
  };

  // Deduplicate to show only the most specific override for each product/variant
  const getDedupedItems = (items: ListItem[]) => {
    const deduped: ListItem[] = [];
    const seen = new Set();
    // Reverse to keep the most specific (last) override
    for (const item of [...items].reverse()) {
      const key = item.variantId || item.productId || item.id;
      if (!seen.has(key)) {
        deduped.push(item);
        seen.add(key);
      }
    }
    return deduped.reverse();
  };

  // --- Assigned List Search State and Debounce ---
  const [assignedSearch, setAssignedSearch] = useState("");
  const [debouncedAssignedSearch, setDebouncedAssignedSearch] = useState("");
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedAssignedSearch(assignedSearch);
    }, 300);
    return () => clearTimeout(handler);
  }, [assignedSearch]);

  // --- Filtered assigned items ---
  const filteredItems = getDedupedItems(getFilteredItems()).filter((item) => {
    if (!debouncedAssignedSearch) return true;
    const search = debouncedAssignedSearch.toLowerCase();
    return (
      (item.title && item.title.toLowerCase().includes(search)) ||
      (item.variantTitle && item.variantTitle.toLowerCase().includes(search)) ||
      (item.productId && item.productId.toLowerCase().includes(search))
    );
  });

  // Reset pagination when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [activeTab, debouncedAssignedSearch]);

  // Get paginated items
  const getPaginatedItems = () => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    return filteredItems.slice(startIndex, endIndex);
  };

  const totalPages = Math.ceil(filteredItems.length / itemsPerPage);

  // Accordion state for grouped products
  const [openAccordions, setOpenAccordions] = useState<{
    [key: string]: boolean;
  }>({});

  // Group product overrides by productId AND discountValue
  function groupProductOverridesByDiscount(items: ListItem[]) {
    // { [productId_discountValue]: ListItem[] }
    const productGroups: {
      [key: string]: {
        productId: string;
        discountValue: number | undefined;
        variants: ListItem[];
      };
    } = {};
    items.forEach((item) => {
      if (item.appliesTo === "products") {
        const pid = item.productId || item.id;
        const discount =
          typeof item.discountValue === "number"
            ? item.discountValue
            : "undefined";
        const key = `${pid}__${discount}`;
        if (!productGroups[key])
          productGroups[key] = {
            productId: pid,
            discountValue: item.discountValue,
            variants: [],
          };
        productGroups[key].variants.push(item);
      }
    });
    return Object.values(productGroups);
  }

  // --- On Save & Continue, ensure state values are included in payload ---
  function getOverridesForSubmit(
    overrides: ListItem[],
    appliesTo: "products" | "collections",
  ): ListItem[] {
    return overrides.map((item) => ({
      ...item,
      discountType: item.discountType || item.discount_type || "percentage",
      discount_type: item.discountType || item.discount_type || "percentage",
    }));
  }

  useImperativeHandle(ref, () => ({
    getOverridesForSubmit,
  }));

  return (
    <>
      <style>
        {`
          input[type="number"]::-webkit-outer-spin-button,
          input[type="number"]::-webkit-inner-spin-button {
            -webkit-appearance: none;
            margin: 0;
          }
          
          input[type="number"] {
            -moz-appearance: textfield;
          }
        `}
      </style>
      <div className="space-y-6">
        <div className="grid grid-cols-1 lg:grid-cols-[25%,1fr,1fr] gap-6">
          <div className="lg:col-span-1 space-y-6">
            <div className="rounded-lg p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-2">
                Overrides (Discount & Qty Rules)
              </h2>
              <p className="text-sm text-gray-600 mb-4">
                Create custom pricing & quantity rules for specific collections,
                products, or variants that override this group's default discount.
                If a product has multiple rules, the rule with the{" "}
                <strong>highest priority</strong> will be applied.
              </p>
              <p className="text-sm text-gray-600 mb-2">
                <strong>Discount Priority (lowest to highest):</strong>
              </p>
              <p className="text-sm text-gray-600">
                Default → Collections → Products → Variant
              </p>
            </div>
          </div>

          <div className="lg:col-span-2 space-y-6">
            <div className="bg-white rounded-lg p-6">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-medium text-gray-900">
                  Overrides (Discount & Quantity Rules)
                </h3>
                <button
                  type="button"
                  onClick={openCreateModal}
                  className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-blue-600 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                >
                  <Plus className="w-4 h-4" />
                  Add override
                </button>
              </div>

              {selectedItems.length === 0 ? (
                <div className="bg-gray-50 rounded-lg p-8 text-center">
                  <Search className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                  <p className="text-sm text-gray-500">No overrides yet</p>
                </div>
              ) : (
                <>
                  {/* Tabs */}
                  <div className="border-b border-gray-200 mb-6">
                    <nav className="flex space-x-8">
                      <button
                        type="button"
                        onClick={() => setActiveTab("all")}
                        className={`py-2 px-1 border-b-2 font-medium text-sm ${
                          activeTab === "all"
                            ? "border-blue-500 text-blue-600"
                            : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
                        }`}
                      >
                        All ({getTabCount("all")})
                      </button>
                      <button
                        type="button"
                        onClick={() => setActiveTab("products")}
                        className={`py-2 px-1 border-b-2 font-medium text-sm ${
                          activeTab === "products"
                            ? "border-blue-500 text-blue-600"
                            : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
                        }`}
                      >
                        Products ({getTabCount("products")})
                      </button>
                      <button
                        type="button"
                        onClick={() => setActiveTab("collections")}
                        className={`py-2 px-1 border-b-2 font-medium text-sm ${
                          activeTab === "collections"
                            ? "border-blue-500 text-blue-600"
                            : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
                        }`}
                      >
                        Collections ({getTabCount("collections")})
                      </button>
                    </nav>
                  </div>

                  {/* Tab Content */}
                  {getFilteredItems().length === 0 ? (
                    <div className="bg-gray-50 rounded-lg p-8 text-center">
                      <p className="text-sm text-gray-500">No overrides yet</p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {/* Assigned List Search Box */}
                      <div className="mb-4">
                        <input
                          type="text"
                          value={assignedSearch}
                          onChange={(e) => setAssignedSearch(e.target.value)}
                          placeholder="Search assigned overrides..."
                          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                      {/* Always group/accordion products in all tabs */}
                      {
                        filteredItems.length === 0 ? (
                          <div className="bg-gray-50 rounded-lg p-8 text-center">
                            <p className="text-sm text-gray-500">No results found</p>
                          </div>
                        ): (
(() => {
                        const paginatedItems = getPaginatedItems();
                        const productItems = paginatedItems.filter(
                          (item) => item.appliesTo === "products",
                        );
                        const collectionItems = paginatedItems.filter(
                          (item) => item.appliesTo === "collections",
                        );
                        // Group by productId AND discountValue
                        const productGroups =
                          groupProductOverridesByDiscount(productItems);
                        return (
                          <>
                            {productGroups.map((group, idx) => {
                              const groupKey =
                                group.productId +
                                "_" +
                                group.discountValue +
                                "_" +
                                group.variants
                                  .map((v) => v.id)
                                  .sort()
                                  .join("_");
                              if (group.variants.length > 1) {
                                // Accordion for multiple variants with same discount
                                const productTitle = group.variants[0].title;
                                const productImage = group.variants[0].image;
                                return (
                                  <div
                                    key={groupKey}
                                    className="bg-white rounded-xl border border-gray-200 shadow"
                                  >
                                    <div
                                      className="flex items-center justify-between px-6 py-4 cursor-pointer hover:bg-gray-50"
                                      onClick={() =>
                                        setOpenAccordions((prev) => ({
                                          ...prev,
                                          [groupKey]: !prev[groupKey],
                                        }))
                                      }
                                    >
                                      <div className="flex items-center gap-4">
                                        {productImage && (
                                          <img
                                            src={productImage}
                                            alt={productTitle}
                                            className="w-14 h-14 object-cover rounded-md border"
                                          />
                                        )}
                                        <div>
                                          <div className="font-semibold text-gray-900 text-base">
                                            {productTitle}
                                          </div>
                                          <span className="text-xs text-gray-500">
                                            {group.variants.length} variants @{" "}
                                            {group.discountValue}%
                                          </span>
                                        </div>
                                      </div>
                                      <ChevronDown
                                        className={`w-5 h-5 transition-transform ${openAccordions[groupKey] ? "rotate-180" : ""}`}
                                      />
                                    </div>
                                    {openAccordions[groupKey] && (
                                      <div className="border-t px-6 py-2 bg-gray-50">
                                        {group.variants.map((variant) => (
                                          <div
                                            key={variant.id}
                                            className="flex items-center justify-between py-2 border-b last:border-b-0"
                                          >
                                            <div className="flex items-center gap-3">
                                              {/* Show variant title and price */}
                                              {variant.variantTitle && (
                                                <span className="text-sm text-gray-900">
                                                  {variant.variantTitle}
                                                </span>
                                              )}

                                              <span className="text-xs px-2 py-1 bg-blue-50 text-blue-700 rounded ml-2">
                                                Variant
                                              </span>
                                              {variant.discountType && (
                                                <span className="text-xs px-2 py-1 bg-green-50 text-green-700 rounded ml-2">
                                                  {variant.discountType ===
                                                  "percentage"
                                                    ? `${variant.discountValue ?? 0}% off`
                                                    : `$${variant.discountValue ?? 0} fixed`}
                                                </span>
                                              )}
                                              {variant.minQuantity !==
                                                undefined &&
                                                variant.minQuantity !== null && (
                                                  <span className="text-xs px-2 py-1 bg-gray-100 text-gray-700 rounded ml-2">
                                                    Min: {variant.minQuantity}
                                                  </span>
                                                )}
                                              {variant.maxQuantity !==
                                                undefined &&
                                                variant.maxQuantity !== null &&
                                                variant.maxQuantity !== "" && (
                                                  <span className="text-xs px-2 py-1 bg-gray-100 text-gray-700 rounded ml-2">
                                                    Max: {variant.maxQuantity}
                                                  </span>
                                                )}
                                              {variant.increments !== undefined &&
                                                variant.increments !== null && (
                                                  <span className="text-xs px-2 py-1 bg-gray-100 text-gray-700 rounded ml-2">
                                                    Increments:{" "}
                                                    {variant.increments}
                                                  </span>
                                                )}
                                            </div>
                                            <div className="flex gap-2">
                                              <button
                                                type="button"
                                                onClick={() =>
                                                  openEditModal(variant)
                                                }
                                                className="p-2 text-gray-400 hover:text-blue-600"
                                                title="Edit"
                                              >
                                                <Edit className="w-5 h-5" />
                                              </button>
                                              <button
                                                type="button"
                                                onClick={() =>
                                                  removeItem(variant.id)
                                                }
                                                className="p-2 text-gray-400 hover:text-red-600"
                                                title="Remove"
                                              >
                                                <X className="w-5 h-5" />
                                              </button>
                                            </div>
                                          </div>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                );
                              } else {
                                // Single variant (unique discount)
                                const item = group.variants[0];
                                return (
                                  <div
                                    key={item.id}
                                    className="bg-white rounded-xl flex items-center justify-between px-6 py-4 shadow border border-gray-200"
                                  >
                                    <div className="flex items-center gap-4">
                                      {item.image && (
                                        <img
                                          src={item.image}
                                          alt={item.title}
                                          className="w-14 h-14 object-cover rounded-md border"
                                        />
                                      )}
                                      <div>
                                        <div className="font-semibold text-gray-900 text-base">
                                          {item.title}
                                          {item.variantTitle && (
                                            <span className="ml-2 text-xs text-gray-500">
                                              {item.variantTitle}
                                            </span>
                                          )}
                                        </div>

                                        <div className="flex gap-2 mt-1">
                                          <span className="text-xs px-2 py-1 bg-blue-50 text-blue-700 rounded">
                                            {item.appliesTo === "products"
                                              ? item.type === "variant"
                                                ? "Variant"
                                                : "Product"
                                              : "Collection"}
                                          </span>
                                          {item.discountType && (
                                            <span className="text-xs px-2 py-1 bg-green-50 text-green-700 rounded">
                                              {item.discountType === "percentage"
                                                ? `${item.discountValue ?? 0}% off`
                                                : `$${item.discountValue ?? 0} fixed`}
                                            </span>
                                          )}
                                          {item.minQuantity !== undefined &&
                                            item.minQuantity !== null && (
                                              <span className="text-xs px-2 py-1 bg-gray-100 text-gray-700 rounded">
                                                Min: {item.minQuantity}
                                              </span>
                                            )}
                                          {item.maxQuantity !== undefined &&
                                            item.maxQuantity !== null &&
                                            item.maxQuantity !== "" && (
                                              <span className="text-xs px-2 py-1 bg-gray-100 text-gray-700 rounded">
                                                Max: {item.maxQuantity}
                                              </span>
                                            )}
                                          {item.increments !== undefined &&
                                            item.increments !== null && (
                                              <span className="text-xs px-2 py-1 bg-gray-100 text-gray-700 rounded">
                                                Increments: {item.increments}
                                              </span>
                                            )}
                                        </div>
                                        {item.tieredBreaks &&
                                          item.tieredBreaks.length > 1 && (
                                            <div className="mt-2 text-xs text-gray-600">
                                              <span className="font-medium">
                                                Tiered:
                                              </span>
                                              {item.tieredBreaks.map((tb, i) => (
                                                <span key={i} className="ml-2">
                                                  {tb.quantity}+
                                                  {item.discountType ===
                                                  "percentage"
                                                    ? `: ${tb.discountValue}%`
                                                    : `: $${tb.discountValue}`}
                                                </span>
                                              ))}
                                            </div>
                                          )}
                                      </div>
                                    </div>
                                    <div className="flex gap-2">
                                      <button
                                        type="button"
                                        onClick={() => openEditModal(item)}
                                        className="p-2 text-gray-400 hover:text-blue-600"
                                        title="Edit"
                                      >
                                        <Edit className="w-5 h-5" />
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => removeItem(item.id)}
                                        className="p-2 text-gray-400 hover:text-red-600"
                                        title="Remove"
                                      >
                                        <X className="w-5 h-5" />
                                      </button>
                                    </div>
                                  </div>
                                );
                              }
                            })}
                            {/* Render collections as flat list */}
                            {collectionItems.map((item, idx) => (
                              <div
                                key={item.id || idx}
                                className="bg-white rounded-xl flex items-center justify-between px-6 py-4 shadow border border-gray-200"
                              >
                                <div className="flex items-center gap-4">
                                  {item.image && (
                                    <img
                                      src={item.image}
                                      alt={item.title}
                                      className="w-14 h-14 object-cover rounded-md border"
                                    />
                                  )}
                                  <div>
                                    <div className="font-semibold text-gray-900 text-base">
                                      {item.title}
                                    </div>
                                    <div className="flex gap-2 mt-1">
                                      <span className="text-xs px-2 py-1 bg-blue-50 text-blue-700 rounded">
                                        Collection
                                      </span>
                                      {item.discountType && (
                                        <span className="text-xs px-2 py-1 bg-green-50 text-green-700 rounded">
                                          {item.discountType === "percentage"
                                            ? `${item.discountValue ?? 0}% off`
                                            : `$${item.discountValue ?? 0} fixed`}
                                        </span>
                                      )}
                                      {item.minQuantity !== undefined &&
                                        item.minQuantity !== null && (
                                          <span className="text-xs px-2 py-1 bg-gray-100 text-gray-700 rounded">
                                            Min: {item.minQuantity}
                                          </span>
                                        )}
                                      {item.maxQuantity !== undefined &&
                                        item.maxQuantity !== null &&
                                        item.maxQuantity !== "" && (
                                          <span className="text-xs px-2 py-1 bg-gray-100 text-gray-700 rounded">
                                            Max: {item.maxQuantity}
                                          </span>
                                        )}
                                      {item.increments !== undefined &&
                                        item.increments !== null && (
                                          <span className="text-xs px-2 py-1 bg-gray-100 text-gray-700 rounded">
                                            Increments: {item.increments}
                                          </span>
                                        )}
                                    </div>
                                    {item.tieredBreaks &&
                                      item.tieredBreaks.length > 1 && (
                                        <div className="mt-2 text-xs text-gray-600">
                                          <span className="font-medium">
                                            Tiered:
                                          </span>
                                          {item.tieredBreaks.map((tb, i) => (
                                            <span key={i} className="ml-2">
                                              {tb.quantity}+
                                              {item.discountType === "percentage"
                                                ? `: ${tb.discountValue}%`
                                                : `: $${tb.discountValue}`}
                                            </span>
                                          ))}
                                        </div>
                                      )}
                                  </div>
                                </div>
                                <div className="flex gap-2">
                                  <button
                                    type="button"
                                    onClick={() => openEditModal(item)}
                                    className="p-2 text-gray-400 hover:text-blue-600"
                                    title="Edit"
                                  >
                                    <Edit className="w-5 h-5" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => removeItem(item.id)}
                                    className="p-2 text-gray-400 hover:text-red-600"
                                    title="Remove"
                                  >
                                    <X className="w-5 h-5" />
                                  </button>
                                </div>
                              </div>
                            ))}
                          </>
                        );
                      })()
                        )}
                      
                      {/* Pagination Controls */}
                      {totalPages > 1 && (
                        <div className="flex items-center justify-between mt-6 px-4 py-3 bg-gray-50 rounded-lg">
                          <div className="text-sm text-gray-700">
                            Showing {((currentPage - 1) * itemsPerPage) + 1} to {Math.min(currentPage * itemsPerPage, filteredItems.length)} of {filteredItems.length} overrides
                          </div>
                          <div className="flex items-center space-x-2">
                            <button
                              type="button"
                              onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                              disabled={currentPage === 1}
                              className="px-3 py-1 text-sm font-medium text-gray-500 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              Previous
                            </button>
                            
                            {/* Page numbers */}
                            <div className="flex items-center space-x-1">
                              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                                let pageNum;
                                if (totalPages <= 5) {
                                  pageNum = i + 1;
                                } else if (currentPage <= 3) {
                                  pageNum = i + 1;
                                } else if (currentPage >= totalPages - 2) {
                                  pageNum = totalPages - 4 + i;
                                } else {
                                  pageNum = currentPage - 2 + i;
                                }
                                
                                return (
                                  <button
                                    key={pageNum}
                                    type="button"
                                    onClick={() => setCurrentPage(pageNum)}
                                    className={`px-3 py-1 text-sm font-medium rounded-md ${
                                      currentPage === pageNum
                                        ? 'bg-blue-600 text-white'
                                        : 'text-gray-700 bg-white border border-gray-300 hover:bg-gray-50'
                                    }`}
                                  >
                                    {pageNum}
                                  </button>
                                );
                              })}
                            </div>
                            
                            <button
                              type="button"
                              onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                              disabled={currentPage === totalPages}
                              className="px-3 py-1 text-sm font-medium text-gray-500 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              Next
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>

          {/* Create Override Modal */}
          {showModal && (
            <PortalModal>
              <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
                <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
                  <div className="flex items-center justify-between p-6 border-b">
                    <h2 className="text-lg font-semibold text-gray-900">
                      {editingItem ? "Edit Override" : "Create Override"}
                    </h2>
                    <button
                      type="button"
                      onClick={closeModal}
                      className="p-2 text-gray-400 hover:text-gray-600 rounded-md"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>

                  <div className="p-6 space-y-6">
                    {/* Applies To Section */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Applies to *
                      </label>
                      <div className="relative">
                        <select
                          value={String(overrideForm.appliesTo)}
                          onChange={(e) =>
                            setOverrideForm((prev) => ({
                              ...prev,
                              appliesTo: e.target.value as
                                | "products"
                                | "collections",
                              selectedResources: [], // Reset selection when changing type
                            }))
                          }
                          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 appearance-none bg-white"
                        >
                          <option value="products">Specific products</option>
                          <option value="collections">
                            Specific collections
                          </option>
                        </select>
                        <ChevronDown className="absolute right-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                      </div>
                    </div>

                    {/* Resource Selection */}
                    <div>
                      <div className="flex items-center gap-3 mb-3">
                        <div className="flex-1 relative">
                          <input
                            type="text"
                            placeholder={`Search ${overrideForm.appliesTo}`}
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' && searchQuery.trim()) {
                                e.preventDefault();
                                handleResourceSelectionWithQuery(searchQuery.trim());
                              }
                            }}
                            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 pr-20"
                          />
                          {searchQuery && (
                            <button
                              type="button"
                              onClick={() => setSearchQuery("")}
                              className="absolute right-2 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          )}
                        
                        </div>
                    
                        <button
                          type="button"
                          onClick={handleResourceSelection}
                          className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        >
                          Browse
                        </button>
                      </div>

                      {overrideForm.selectedResources.length > 0 && (
                        <div className="space-y-2">
                          {/* Search results count */}
                          {searchQuery && (
                            <div className="text-xs text-gray-500 mb-2">
                              Showing {overrideForm.selectedResources.filter((resource) =>
                                searchQuery === "" ||
                                resource.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
                                (resource.variantTitle && resource.variantTitle.toLowerCase().includes(searchQuery.toLowerCase()))
                              ).length} of {overrideForm.selectedResources.length} resources
                            </div>
                          )}
                          
                          <div className="max-h-32 overflow-y-auto space-y-2">
                            {overrideForm.selectedResources
                              .filter((resource) =>
                                searchQuery === "" ||
                                resource.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
                                (resource.variantTitle && resource.variantTitle.toLowerCase().includes(searchQuery.toLowerCase()))
                              )
                              .map((resource) => (
                                <div
                                  key={resource.id}
                                  className="flex items-center gap-3 p-2 bg-gray-50 rounded-md"
                                >
                                  {resource.image && (
                                    <img
                                      src={resource.image}
                                      alt={resource.title}
                                      className="w-8 h-8 object-cover rounded"
                                    />
                                  )}
                                  <div className="flex-1">
                                    <span className="text-sm text-gray-900 block">
                                      {resource.title}
                                      {resource.price && ` - ${resource.price}`}
                                    </span>
                                    {resource.variantTitle && (
                                      <span className="text-xs text-gray-500 block">
                                        {resource.variantTitle}
                                        {resource.price && ` - ${resource.price}`}
                                      </span>
                                    )}
                                  </div>
                                  <span className="text-xs text-purple-600 bg-purple-100 px-2 py-1 rounded">
                                    {resource.variantId
                                      ? "Variant"
                                      : overrideForm.appliesTo === "products"
                                        ? "Product"
                                        : "Collection"}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => removeResource(resource.id)}
                                    className="p-1 text-gray-400 hover:text-red-500"
                                  >
                                    <X className="w-4 h-4" />
                                  </button>
                                </div>
                              ))}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Discount & Quantity Rules */}
                    <div>
                      <h3 className="text-sm font-medium text-gray-700 mb-4">
                        Discount & Quantity Rules
                      </h3>

                      <div className="space-y-4">
                        {/* Discount Type */}
                        <div className="flex gap-4 mb-4">
                          <label className="flex items-center">
                            <input
                              type="radio"
                              name="discountType"
                              value="percentage"
                              checked={overrideForm.discountType === "percentage"}
                              onChange={(e) => {
                                const newType = e.target.value as
                                  | "percentage"
                                  | "fixed";
                                setOverrideForm((prev) => {
                                  let newDiscountValue = prev.discountValue;
                                  if (
                                    newType === "percentage" &&
                                    newDiscountValue > 100
                                  ) {
                                    newDiscountValue = 100;
                                  }
                                  return {
                                    ...prev,
                                    discountType: newType,
                                    discountValue: newDiscountValue,
                                  };
                                });
                                // Optionally, re-validate
                                if (
                                  newType === "percentage" &&
                                  overrideForm.discountValue > 100
                                ) {
                                  setDiscountError(
                                    "Discount % must be a number between 0 and 100.",
                                  );
                                } else {
                                  setDiscountError("");
                                }
                              }}
                              className="mr-2"
                            />
                            Percentage discount
                          </label>
                          <label className="flex items-center">
                            <input
                              type="radio"
                              name="discountType"
                              value="fixed"
                              checked={overrideForm.discountType === "fixed"}
                              onChange={(e) =>
                                setOverrideForm((prev) => ({
                                  ...prev,
                                  discountType: "fixed",
                                }))
                              }
                              className="mr-2"
                            />
                            Fixed Price
                          </label>
                        </div>

                        {/* Form Fields Grid */}
                        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                          <div>
                            <label className="block text-xs text-gray-500 mb-1">
                              {overrideForm.discountType === "fixed"
                                ? "Fixed Price *"
                                : "Discount (%) *"}
                            </label>
                            <input
                              type="number"
                              value={String(overrideForm.discountValue)}
                              onChange={(e) =>
                                handleDiscountValueChange(Number(e.target.value))
                              }
                              className={`w-full px-3 py-2 text-sm border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                                discountError
                                  ? "border-red-300 focus:ring-red-500 focus:border-red-500"
                                  : "border-gray-300"
                              }`}
                            />
                            {discountError && (
                              <p className="text-xs text-red-500 mt-1">
                                {discountError}
                              </p>
                            )}
                            <p className="text-xs text-gray-500 mt-1">
                              {overrideForm.discountType === "fixed"
                                ? "Set the fixed price for this product"
                                : "% off full retail price"}
                            </p>
                          </div>
                          <div>
                            <label className="block text-xs text-gray-500 mb-1">
                              Minimum Qty
                            </label>
                            <input
                              type="number"
                              value={String(overrideForm.minQuantity)}
                              onChange={(e) =>
                                handleMinQuantityChange(e.target.value)
                              }
                              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                            <p className="text-xs text-gray-500 mt-1">
                              Defaults to 1 if left blank
                            </p>
                          </div>
                          <div>
                            <label className="block text-xs text-gray-500 mb-1">
                              Maximum Qty
                            </label>
                            <input
                              type="text"
                              value={String(overrideForm.maxQuantity)}
                              onChange={(e) =>
                                handleMaxQuantityChange(e.target.value)
                              }
                              className={`w-full px-3 py-2 text-sm border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                                maxQtyError
                                  ? "border-red-300 focus:ring-red-500 focus:border-red-500"
                                  : "border-gray-300"
                              }`}
                            />
                            {maxQtyError && (
                              <p className="text-xs text-red-500 mt-1">
                                {maxQtyError}
                              </p>
                            )}
                            <p className="text-xs text-gray-500 mt-1">
                              No maximum if left blank
                            </p>
                          </div>
                          <div>
                            <label className="block text-xs text-gray-500 mb-1">
                              Increments
                            </label>
                            <input
                              type="number"
                              value={String(overrideForm.increments)}
                              onChange={(e) =>
                                handleIncrementsChange(Number(e.target.value))
                              }
                              className={`w-full px-3 py-2 text-sm border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                                incrementsError
                                  ? "border-red-300 focus:ring-red-500 focus:border-red-500"
                                  : "border-gray-300"
                              }`}
                            />
                            {incrementsError && (
                              <p className="text-xs text-red-500 mt-1">
                                {incrementsError}
                              </p>
                            )}
                            <p className="text-xs text-gray-500 mt-1">
                              Defaults to 1 if left blank
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Tiered Price Breaks */}
                    <div>
                      <h3 className="text-sm font-medium text-gray-700 mb-2">
                        Tiered Price Breaks
                      </h3>

                      {(() => {
                        return null;
                      })()}

                      {localTieredBreaks.length === 0 ? (
                        <div className="bg-gray-50 rounded-lg p-4 text-center">
                          <p className="text-sm text-gray-500 mb-2">
                            No tiered price breaks set up.
                          </p>
                          <p className="text-xs text-gray-400">
                            Products assigned to this override will be excluded
                            from tiered pricing rules set at the default
                            (intermediate) level.
                          </p>
                        </div>
                      ) : (
                        <div className="space-y-4 mb-6 bg-[rgb(249,250,251)] p-4 rounded-md">
                          {/* Header row */}
                          <div className="grid grid-cols-4 gap-4 text-sm font-medium text-gray-700 pb-2 border-b border-gray-200">
                            <div></div>
                            <div>Quantity</div>
                            <div>
                              {overrideForm.discountType === "percentage" ? "Discount %" : "Fixed Price"}
                            </div>
                            <div></div>
                          </div>
                          
                          {localTieredBreaks.map((break_, index) => (
                            <div
                              key={index}
                              className="grid grid-cols-4 gap-4 items-center"
                            >
                              {/* Tier Name - Display as text label */}
                              <div className="text-sm font-medium text-gray-900">
                                {break_.tierName}
                              </div>
                              
                              {/* Quantity column */}
                              <div>
                                <input
                                  type="number"
                                  value={String(break_.quantity)}
                                  onChange={(e) =>
                                    updateTieredBreak(
                                      index,
                                      "quantity",
                                      Number(e.target.value),
                                    )
                                  }
                                  className={`w-full px-2 py-1 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                                    tieredBreakErrors[index]
                                      ? "border-red-300 focus:ring-red-500 focus:border-red-500"
                                      : "border-gray-300"
                                  }`}
                                />
                                {tieredBreakErrors[index] && (
                                  <p className="text-xs text-red-500 mt-1">
                                    {tieredBreakErrors[index]}
                                  </p>
                                )}
                              </div>
                              
                              {/* Discount Value column */}
                              <div>
                                <input
                                  type="number"
                                  value={String(break_.discountValue)}
                                  onChange={(e) =>
                                    updateTieredBreak(
                                      index,
                                      "discountValue",
                                      Number(e.target.value),
                                    )
                                  }
                                  className="w-full px-2 py-1 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                                />
                              </div>
                              
                              {/* Actions column */}
                              <div>
                                <button
                                  type="button"
                                  onClick={() => removeTieredBreak(index)}
                                  className="p-1 text-gray-400 hover:text-red-500"
                                >
                                  <X className="w-4 h-4" />
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Error display for Add Price Break */}
                      {Object.keys(tieredBreakErrors).length > 0 && (
                        <div className="mb-2">
                          {Object.entries(tieredBreakErrors).map(
                            ([index, error]) => (
                              <p key={index} className="text-xs text-red-500">
                                {error}
                              </p>
                            ),
                          )}
                        </div>
                      )}

                      <button
                        type="button"
                        onClick={addTieredBreak}
                        className="mt-3 inline-flex items-center gap-2 px-3 py-2 text-sm text-blue-600 border border-blue-200 rounded-md hover:bg-blue-50"
                      >
                        <Plus className="w-4 h-4" />
                        Add Price Break
                      </button>
                    </div>
                  </div>

                  <div className="flex items-center justify-end gap-3 p-6 border-t bg-gray-50">
                    <button
                      type="button"
                      onClick={closeModal}
                      className="px-4 py-2 text-sm text-gray-700 border border-gray-300 rounded-md hover:bg-gray-50"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={saveOverride}
                      disabled={overrideForm.selectedResources.length === 0}
                      className="px-4 py-2 text-sm text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
                    >
                      {editingItem ? "Update" : "Save"}
                    </button>
                  </div>
                </div>
              </div>
            </PortalModal>
          )}
        </div>
      </div>
    </>
  );
});

export default BuyerGroupOverrides;
