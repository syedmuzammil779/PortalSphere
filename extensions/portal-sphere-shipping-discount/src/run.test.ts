import { run } from './index';
import type { RunInput } from '../generated/api';

describe('Shipping Discount Function', () => {
  // Helper function to create mock input
  const createMockInput = (overrides = {}): RunInput => {
    const defaultInput: RunInput = {
      cart: {
        buyerIdentity: {
          customer: {
            metafield: {
              value: "PortasSphere_B2B_Customer"
            }
          }
        },
        cost: {
          subtotalAmount: {
            amount: 100
          }
        },
        deliveryGroups: [
          {
            deliveryOptions: [
              {
                handle: "standard",
                title: "Standard Shipping",
                cost: {
                  amount: 20
                }
              }
            ]
          }
        ]
      },
      shop: {
        metafield: {
          value: JSON.stringify({
            minimumPurchaseAmount: 150,
            flatRate: 10,
            status: "active"
          })
        },
        storeType: {
          value: "Hybrid"
        }
      }
    };

    return {
      ...defaultInput,
      ...overrides
    };
  };

  test('should apply free shipping when cart total exceeds minimum', () => {
    const input = createMockInput({
      cart: {
        ...createMockInput().cart,
        cost: {
          subtotalAmount: {
            amount: 200 // Above minimum purchase amount
          }
        }
      }
    });

    const result = run(input);
    expect(result.discounts).toHaveLength(1);
    expect(result.discounts[0].value.fixedAmount.amount).toBe(20); // Full shipping cost discount
  });

  test('should apply flat rate when cart total is below minimum', () => {
    const input = createMockInput({
      cart: {
        ...createMockInput().cart,
        cost: {
          subtotalAmount: {
            amount: 100 // Below minimum purchase amount
          }
        }
      }
    });

    const result = run(input);
    expect(result.discounts).toHaveLength(1);
    expect(result.discounts[0].value.fixedAmount.amount).toBe(10); // Original cost (20) - flat rate (10)
  });

  test('should not apply discount for non-Hybrid store', () => {
    const input = createMockInput({
      shop: {
        ...createMockInput().shop,
        storeType: {
          value: "B2B"
        }
      }
    });

    const result = run(input);
    expect(result.discounts).toHaveLength(0);
  });

  test('should not apply discount for non-B2B customer', () => {
    const input = createMockInput({
      cart: {
        ...createMockInput().cart,
        buyerIdentity: {
          customer: {
            metafield: {
              value: "Regular_Customer"
            }
          }
        }
      }
    });

    const result = run(input);
    expect(result.discounts).toHaveLength(0);
  });

  test('should not apply discount when shipping config is inactive', () => {
    const input = createMockInput({
      shop: {
        ...createMockInput().shop,
        metafield: {
          value: JSON.stringify({
            minimumPurchaseAmount: 150,
            flatRate: 10,
            status: "inactive"
          })
        }
      }
    });

    const result = run(input);
    expect(result.discounts).toHaveLength(0);
  });

  test('should handle invalid shipping config gracefully', () => {
    const input = createMockInput({
      shop: {
        ...createMockInput().shop,
        metafield: {
          value: "invalid json"
        }
      }
    });

    const result = run(input);
    expect(result.discounts).toHaveLength(0);
  });

  test('should handle missing customer tag gracefully', () => {
    const input = createMockInput({
      cart: {
        ...createMockInput().cart,
        buyerIdentity: {
          customer: {
            metafield: null
          }
        }
      }
    });

    const result = run(input);
    expect(result.discounts).toHaveLength(0);
  });
});