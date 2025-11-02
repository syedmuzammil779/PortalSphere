import { DiscountApplicationStrategy, Discount } from "../generated/api";

// Use more specific type annotations
type RunInput = import("../generated/api").RunInput; 
type FunctionRunResult = import("../generated/api").FunctionRunResult;
type Metafield = import("../generated/api").Metafield;

const EMPTY_DISCOUNT: FunctionRunResult = {
  discountApplicationStrategy: DiscountApplicationStrategy.First,
  discounts: [],
};
interface DiscountConfig {
  quantity: string;
  percentage: string;
  type?: "percentage" | "fixedAmount";
}

function determineApplicableDiscountConfig(
  groupTag: string,
  lineMetafield: Metafield | null | undefined,
  productCollectionMetafield: Metafield | null | undefined,
  shopMetafield: Metafield | null | undefined,
  lineQuantity: number
): DiscountConfig[] {

  //First check product level metafield.
  if (lineMetafield?.value) {
    try {
      const parsedValue = JSON.parse(lineMetafield.value);
      const groupConfigs = parsedValue?.find((config: any) => config.tag === groupTag);

      if (groupConfigs && Array.isArray(groupConfigs?.priceConfig) && groupConfigs.priceConfig.length > 0) {
        const priceConfigs = groupConfigs.priceConfig
          .filter((priceConfig: DiscountConfig) => lineQuantity >= Number(priceConfig.quantity))
          .map((priceConfig: DiscountConfig) => ({
            ...priceConfig,
            type: groupConfigs.type,
          }));

        return priceConfigs;
      }
    } catch (error) {
      console.error("Error parsing line metafield:", error);
    }
  }

  //Product level doesn't exist. So now search for product collection level.
  if(productCollectionMetafield?.value) {
    try {
      const parsedValue = JSON.parse(productCollectionMetafield.value);
      const groupConfigs = parsedValue?.find((config: any) => config.tag === groupTag);
      if (groupConfigs && Array.isArray(groupConfigs?.priceConfig) && groupConfigs.priceConfig.length > 0) {
        let reformedArray = new Array();
        for(var i in groupConfigs.priceConfig) {
          reformedArray.push({
            quantity: groupConfigs.priceConfig[i].quantity.toString(),
            percentage: groupConfigs.priceConfig[i].value.toString(),
            status: ""
          })
        }
        const priceConfigs = reformedArray
          .filter((priceConfig: DiscountConfig) => lineQuantity >= Number(priceConfig.quantity))
          .map((priceConfig: DiscountConfig) => ({
            ...priceConfig,
            type: groupConfigs.type
          }));

        return priceConfigs;
      }
    } catch (error) {
      console.error('Error parsing collection level product discount:', error);
    }
  }

  if(shopMetafield?.value) {
    const parsedValue = JSON.parse(shopMetafield.value);
    const groupAdjustment = parsedValue?.find((config: any) => config.tag === groupTag);
    if(groupAdjustment != null && groupAdjustment.hasOwnProperty('tiers') && groupAdjustment.tiers.length > 0) {
      let reformedArray = new Array();
      for(var i in groupAdjustment.tiers) {
        reformedArray.push({
          quantity: groupAdjustment.tiers[i].quantity.toString(),
          percentage: groupAdjustment.tiers[i].value.toString(),
          status: ""
        })
      }

      const priceConfigs = reformedArray
        .filter((priceConfig) => lineQuantity >= Number(priceConfig.quantity))
        .map((priceConfig) => ({
          ...priceConfig,
          type: "percentage"
        }));

      return priceConfigs;
    }
    if (groupAdjustment && Object.hasOwn(groupAdjustment, 'discount') && Number(groupAdjustment.discount) > 0) {
      return [{ quantity: "1", percentage: groupAdjustment.discount, type: "percentage" } as DiscountConfig];
    }
  }
  return [];
}

const processDiscount = (line: any, discount: DiscountConfig): Discount => {
  if (discount.type === "fixedAmount") {
    const unitDiscount = Number(line.cost.amountPerQuantity.amount) - Number(discount.percentage);
    const fixedAmount = unitDiscount * Number(line.quantity);
    return {
      targets: [{ cartLine: { id: line.id } }],
      value: {
        fixedAmount: {
          amount: fixedAmount.toFixed(2),
        },
      },
      message: `${unitDiscount.toFixed(2)} volume discount per unit for ${discount.quantity}+ items`,
    };
  }

  return {
    targets: [{ cartLine: { id: line.id } }],
    value: {
      percentage: {
        value: discount.percentage,
      },
    },
    message: `${discount.percentage}% volume discount for ${discount.quantity}+ items`,
  };
};

export function run(input: RunInput): FunctionRunResult {
  const groupTag = input.cart.buyerIdentity?.customer?.metafield?.value;

  if (!groupTag) {
    console.error("No group tag found for customer");
    return EMPTY_DISCOUNT;
  }

  const discounts = input.cart.lines.flatMap((line: any) => {
    const applicableConfigs = determineApplicableDiscountConfig(
      groupTag,
      line.merchandise.metafield as Metafield | null | undefined,
      line.merchandise.product.metafield as Metafield | null | undefined,
      input.shop.metafield as Metafield | null | undefined,
      line.quantity
    );

    console.log('applicable configs', JSON.stringify(applicableConfigs));

    if (applicableConfigs.length === 0) {
      return [];
    }

    const highestDiscount = (applicableConfigs[0].type === "percentage") 
      ? applicableConfigs.reduce((max, config) => 
          Number(config.percentage) > Number(max.percentage) ? config : max
        , applicableConfigs[0]) 
      : applicableConfigs.reduce((min, config) => 
          Number(config.percentage) < Number(min.percentage) ? config : min
        , applicableConfigs[0]);


    const processedDiscount = processDiscount(line, highestDiscount);
    console.log('processed', JSON.stringify(processedDiscount));
    return [processedDiscount];
  });

  if (discounts.length === 0) {
    console.error("No cart lines qualify for volume discounts.");
    return EMPTY_DISCOUNT;
  }

  return {
    discounts,
    discountApplicationStrategy: DiscountApplicationStrategy.All,
  };
}
