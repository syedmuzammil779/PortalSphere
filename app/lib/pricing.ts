export interface PricingTier {
    tier: number;
    basePrice: number;
    tmrThreshold: number;
    upsellCeiling: number;
    label: string;
  }
  
  export const PRICING_TIERS: PricingTier[] = [
    { tier: 1, basePrice: 49, tmrThreshold: 25000, upsellCeiling: 1250, label: 'Lift Off' },
    { tier: 2, basePrice: 99, tmrThreshold: 50000, upsellCeiling: 2500, label: 'Orbit' },
    { tier: 3, basePrice: 199, tmrThreshold: 100000, upsellCeiling: 5000, label: 'Lightspeed' },
    { tier: 4, basePrice: 399, tmrThreshold: 200000, upsellCeiling: 10000, label: 'Warp Drive' },
    { tier: 5, basePrice: 599, tmrThreshold: 300000, upsellCeiling: 15000, label: 'Quantum Leap' },
    { tier: 6, basePrice: 799, tmrThreshold: Infinity, upsellCeiling: 20000, label: 'Enterprise' }
  ];
  
  const ADDITIONAL_UPSELL_RATE = {
    amount: 99,
    threshold: 10000
  };
  
  const MAX_UPSELL_CEILING = 20000;
  
  interface PricingResult {
    tier: PricingTier;
    basePrice: number;
    additionalUpsellFee: number;
    totalPrice: number;
    bumpedTier: boolean;
    originalTier: PricingTier;
  }
  
  export function calculatePricing(totalMonthlyRevenue: number, upsellRevenue: number): PricingResult {
    // First, find the tier based on TMR
    const originalTier = PRICING_TIERS.find(t => totalMonthlyRevenue <= t.tmrThreshold) 
      || PRICING_TIERS[PRICING_TIERS.length - 1];
  
    // Check if we need to bump to next tier based on upsell ceiling
    let finalTier = originalTier;
    let bumpedTier = false;
    
    if (upsellRevenue > originalTier.upsellCeiling) {
      // Find the next appropriate tier based on upsell revenue
      for (let i = originalTier.tier; i < PRICING_TIERS.length; i++) {
        if (upsellRevenue <= PRICING_TIERS[i].upsellCeiling) {
          finalTier = PRICING_TIERS[i];
          bumpedTier = true;
          break;
        }
      }
      
      // If we've exceeded all tier ceilings, use the highest tier
      if (!bumpedTier || upsellRevenue > MAX_UPSELL_CEILING) {
        finalTier = PRICING_TIERS[PRICING_TIERS.length - 1];
        bumpedTier = true;
      }
    }
  
    // Calculate additional upsell fee for revenue exceeding MAX_UPSELL_CEILING
    let additionalUpsellFee = 0;
    if (upsellRevenue > MAX_UPSELL_CEILING) {
      const excessUpsell = upsellRevenue - MAX_UPSELL_CEILING;
      additionalUpsellFee = Math.floor(excessUpsell / ADDITIONAL_UPSELL_RATE.threshold) 
        * ADDITIONAL_UPSELL_RATE.amount;
    }
  
    return {
      tier: finalTier,
      basePrice: finalTier.basePrice,
      additionalUpsellFee,
      totalPrice: finalTier.basePrice + additionalUpsellFee,
      bumpedTier,
      originalTier
    };
  }