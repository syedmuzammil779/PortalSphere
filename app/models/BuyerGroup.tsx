// export interface BuyerGroupForm {
//   groupName: string;
//   shortDescription: string;
//   discountPercent: string;
//   minQty: number;
//   maxQty: number;
//   increments: number;
//   netTermsEnabled: boolean;
// }
export interface BuyerGroupForm {
  groupName: string;
  shortDescription: string;
  tiers: Array<Tier>;
  netTermsEnabled: boolean;
}

export interface Tier {
  discountPercent: string;
  minQty: number;
  maxQty: number | "";
  increments: number;
}

// API Request Interface
export interface BuyerGroupApiRequest {
  input: {
    name: string;
    description: string;
    defaultStoreWideProductDiscounts: {
      discount: number;
      discount_type: "percentage" | "fixed";
      volumeConfig: {
        increments: number | null;
        maximum: number | null;
        minimum: number | null;
      };
      priceConfig: Array<{
        quantity: number;
        value: number;
      }>;
    };
    productOverrides: Array<{
      type: "product" | "variant";
      id: string;
      discount_type: "percentage" | "fixed";
      volumeConfig: {
        increments: number | null;
        maximum: number | null;
        minimum: number | null;
      };
      priceConfig: Array<{
        quantity: number;
        value: number;
      }>;
    }>;
    collectionOverrides: Array<{
      type: "product" | "variant";
      id: string;
      discount_type: "percentage" | "fixed";
      volumeConfig: {
        increments: number | null;
        maximum: number | null;
        minimum: number | null;
      };
      priceConfig: Array<{
        quantity: number;
        value: number;
      }>;
    }>;
    customers: string[];
    netTerms: boolean;
  };
}
