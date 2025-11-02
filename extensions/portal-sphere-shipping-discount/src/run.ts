import type { RunInput } from "../generated/api";

interface ShippingConfig {
  minimumPurchaseAmount: number;
  flatRate: number;
  status: string;
}

const run = (input: RunInput) => {
  // Initialize variables with default values
  let shippingConfig: ShippingConfig | null = null;
  let storeType: string = "B2B";
  let customerTag: string | null = null;

  try {
    // Parse shipping config
    if (input.shop?.metafield?.value) {
      const parsedConfig = JSON.parse(input.shop.metafield.value);
      // Validate parsed config has required properties
      if (
        typeof parsedConfig === 'object' &&
        'minimumPurchaseAmount' in parsedConfig &&
        'flatRate' in parsedConfig &&
        'status' in parsedConfig
      ) {
        shippingConfig = parsedConfig;
      }
    }

    // Get store type
    if (input.shop?.storeType?.value) {
      const parsedStoreType = input.shop.storeType.value;
      if (parsedStoreType === "Hybrid" || parsedStoreType === "B2B") {
        storeType = parsedStoreType;
      }
    }

    // Get customer tag
    if (input.cart?.buyerIdentity?.customer?.metafield?.value) {
      customerTag = input.cart.buyerIdentity.customer.metafield.value;
    }
  } catch (error) {
    console.error('Error processing metafields:', error);
    return { discounts: [] };
  }

  // Check all conditions with null safety
  if (
    storeType !== "Hybrid" || 
    !customerTag ||
    !customerTag?.startsWith("PortalSphere_B2B_") ||
    !shippingConfig ||
    shippingConfig?.status !== "active"
  ) {
    return {
      discounts: []
    };
  }

  const cartSubtotal = input.cart.cost.subtotalAmount.amount;
  const minimumPurchaseAmount = shippingConfig.minimumPurchaseAmount;
  const flatRate = shippingConfig.flatRate;

  const deliveryOptions = input.cart.deliveryGroups[0]?.deliveryOptions || [];
  
  const discounts = deliveryOptions.map((option) => {
    const shippingCost = option.cost.amount;
    // If cart total meets or exceeds minimum purchase amount, shipping is free
    if (cartSubtotal >= minimumPurchaseAmount) {
      return {
        value: {
          fixedAmount: {
            amount: shippingCost
          }
        },
        message: "Free B2B shipping",
        targets: [
          {
            deliveryOption: {
              handle: option.handle
            }
          }
        ]
      };
    }
    
    // If cart total is below minimum, charge flat rate
    return {
      value: {
        fixedAmount: {
          amount: shippingCost - flatRate
        }
      },
      message: "B2B flat rate shipping",
      targets: [
        {
          deliveryOption: {
            handle: option.handle
          }
        }
      ]
    };
  }).filter(Boolean);

  return {
    discounts
  };
};

export default run;