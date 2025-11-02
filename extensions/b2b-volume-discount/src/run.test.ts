import { describe, it, expect } from 'vitest';
import { run } from './run';
import { DiscountApplicationStrategy } from '../generated/api';

describe('product discounts function', () => {
  it('returns no discounts without configuration', () => {
    const result = run({
      cart: {
        buyerIdentity: {
          customer: {
            metafield: null
          }
        },
        lines: []
      },
      discountNode: {
        metafield: null
      },
      shop: {
        metafield: null
      }
    });
    expect(result.discounts).toEqual([]);
    expect(result.discountApplicationStrategy).toBe(DiscountApplicationStrategy.First);
  });

  it('returns no discounts when customer has no group tag', () => {
    const result = run({
      cart: {
        buyerIdentity: {
          customer: {
            metafield: null
          }
        },
        lines: []
      },
      discountNode: {
        metafield: null
      },
      shop: {
        metafield: null
      }
    });
    expect(result.discounts).toEqual([]);
    expect(result.discountApplicationStrategy).toBe(DiscountApplicationStrategy.First);
  });

  it('applies line item discount based on volume', () => {
    const result = run({
      cart: {
        buyerIdentity: {
          customer: {
            metafield: { value: 'VIP' }
          }
        },
        lines: [
          {
            id: 'gid://shopify/CartLine/1',
            quantity: 5,
            merchandise: {
              id: 'gid://shopify/ProductVariant/1',
              metafield: {
                value: JSON.stringify([
                  {
                    tag: 'VIP',
                    priceConfig: [
                      { quantity: '3', percentage: '10' },
                      { quantity: '5', percentage: '15' }
                    ]
                  }
                ])
              }
            }
          }
        ]
      },
      discountNode: {
        metafield: null
      },
      shop: {
        metafield: null
      }
    });
    expect(result.discounts).toHaveLength(1);
    expect(result.discounts[0]?.value.percentage?.value).toBe('15');
    expect(result.discountApplicationStrategy).toBe(DiscountApplicationStrategy.All);
  });

  it('applies shop-level discount when no line item discount is available', () => {
    const result = run({
      cart: {
        buyerIdentity: {
          customer: {
            metafield: { value: 'VIP' }
          }
        },
        lines: [
          {
            id: 'gid://shopify/CartLine/1',
            quantity: 1,
            merchandise: {
              id: 'gid://shopify/ProductVariant/1',
              metafield: null
            }
          }
        ]
      },
      discountNode: {
        metafield: null
      },
      shop: {
        metafield: {
          value: JSON.stringify([
            { tag: 'VIP', discount: '5' }
          ])
        }
      }
    });
    expect(result.discounts).toHaveLength(1);
    expect(result.discounts[0]?.value.percentage?.value).toBe('5');
    expect(result.discountApplicationStrategy).toBe(DiscountApplicationStrategy.All);
  });

  it('applies no discount when quantity is below threshold', () => {
    const result = run({
      cart: {
        buyerIdentity: {
          customer: {
            metafield: { value: 'VIP' }
          }
        },
        lines: [
          {
            id: 'gid://shopify/CartLine/1',
            quantity: 2,
            merchandise: {
              id: 'gid://shopify/ProductVariant/1',
              metafield: {
                value: JSON.stringify([
                  {
                    tag: 'VIP',
                    priceConfig: [
                      { quantity: '3', percentage: '10' },
                      { quantity: '5', percentage: '15' }
                    ]
                  }
                ])
              }
            }
          }
        ]
      },
      discountNode: {
        metafield: null
      },
      shop: {
        metafield: null
      }
    });
    expect(result.discounts).toEqual([]);
    expect(result.discountApplicationStrategy).toBe(DiscountApplicationStrategy.First);
  });
});