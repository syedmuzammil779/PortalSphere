import prisma from "../db.server";
import moment from "moment";
import axios from "axios";
import { calculatePricing } from "~/lib/pricing";
import { PORTALSPHERE_SUBSCRIPTION } from "../shopify.server";
const dateFormat = "YYYY-MM-DD";
const daysFrequency = Number(process.env.BILLING_INTERVAL_DAYS || "30");
import { sendSlackNotification } from "~/services/CustomFunctions.server";

import CC from "currency-converter-lt";
import { Convert } from "easy-currencies";

export const dailyStoreUsageBilling = async (): Promise<boolean> => {
  const todayMoment = moment().startOf("day");

  const allStores = await prisma.session.findMany({
    distinct: ["shop"],
  });

  const storeSlackArr = new Array();

  if (!allStores) {
    return false;
  }

  for (var i in allStores) {
    const currentStore = allStores[i];

    var installationValid = await checkStoreInstallation(currentStore);
    if (!installationValid) {
      continue;
    }

    var activeSubscriptionForStore =
      await getActiveSubscriptionForStore(currentStore);
    if (!activeSubscriptionForStore) {
      continue;
    }

    var lastChecked = moment(currentStore.createdAt);

    var lastCheckRow = await prisma.storeUsageBillingInfo.findFirst({
      where: {
        paymentFlag: 1,
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    if (lastCheckRow) {
      lastChecked = moment(lastCheckRow.lastChecked);
    }

    var orders = await getOrdersForStore(
      currentStore,
      lastChecked.format(dateFormat),
    );

    if (orders.length == 0) {
      continue;
    }

    var currentAppInstallation =
      activeSubscriptionForStore.respBody.data.currentAppInstallation;
    let currentSubscriptionId = null; //This is needed because we will place charge on this one.
    try {
      for (var i in currentAppInstallation.activeSubscriptions) {
        var currentSub = currentAppInstallation.activeSubscriptions[i];

        if (
          currentSub["status"] == "ACTIVE" &&
          currentSub["name"] == PORTALSPHERE_SUBSCRIPTION
        ) {
          currentSubscriptionId = currentSub.lineItems[0]["id"];
        }
      }
    } catch (error: any) {
      console.log(error.message);
    }

    if (!currentSubscriptionId) {
      continue;
    }

    // We're only calculating the store usage, not actually processing it
    try {
      const { totalOrdersRevenue, totalUpsellRevenue } =
        await calculateTotalRevenue(orders);
      let computedTotalEarnings = null;
      let computedUpsellEarnings = null;

      computedTotalEarnings = totalOrdersRevenue;
      computedUpsellEarnings = totalUpsellRevenue;

      // Calculate pricing tier
      const {
        tier,
        basePrice,
        additionalUpsellFee,
        totalPrice,
        bumpedTier,
        originalTier,
      } = calculatePricing(computedTotalEarnings, computedUpsellEarnings);
      storeSlackArr.push({
        store: currentStore.shop,
        // bumpedTier: bumpedTier,
        // originalTier: originalTier,
        total: totalOrdersRevenue,
        upsell: totalUpsellRevenue,
        shopifyBill: basePrice,
      });
    } catch (error: any) {
      console.error(error);
      console.log(error.message);
    }
  }

  //Daily cron slack notification disabled for now
  /*
    if(storeSlackArr.length > 0 && Object.keys(storeSlackArr).length > 0) {
        await sendSlackNotification('Daily usage results for '+(new Date()));
        await sendSlackNotification(JSON.stringify(storeSlackArr));    
    }
    */
  return true;
};

async function getOrdersForStore(
  store: any,
  lastChecked: string,
): Promise<any[]> {
  var cursor = null;
  var limit = 25;
  var hasNextPage;
  var returnVal = new Array();
  do {
    hasNextPage = false;
    var queryObject = getQueryObjectForStore(cursor, limit, lastChecked);
    var query = `{
            orders(${queryObject}) {
                edges {
                    node {
                        id
                        name
                        email
                        createdAt
                        updatedAt
                        totalPrice
                        subtotalPrice
                        currencyCode
                        displayFinancialStatus
                        displayFulfillmentStatus
                        currentTotalPriceSet {
                            presentmentMoney { amount currencyCode }
                            shopMoney { amount currencyCode }
                        }
                        lineItems (first: ${limit}) {
                            edges {
                                node {
                                    title
                                    quantity
                                    variant {
                                        id
                                        title
                                    }
                                    discountedUnitPriceSet {
                                        shopMoney {
                                            amount
                                            currencyCode
                                        }
                                    }
                                    discountedTotalSet {
                                        shopMoney {
                                            amount
                                            currencyCode
                                        }
                                    }                                        
                                    customAttributes {
                                        key
                                        value
                                    }
                                }
                            }
                        }
                    }
                    cursor
                }
                pageInfo {
                    hasNextPage
                }
            }
        }`;

    let response = await makeAGraphQLAPICallToShopify(store, { query: query });
    if (response && response.hasOwnProperty("status") && response.status) {
      var respBody = response.respBody;
      if (
        respBody &&
        respBody.hasOwnProperty("data") &&
        respBody.data.hasOwnProperty("orders")
      ) {
        var orders = respBody.data.orders;
        if (orders && orders.hasOwnProperty("edges") && orders.edges.length) {
          for (var i in orders.edges) {
            var node = orders.edges[i].node;
            returnVal.push(node);
            cursor = orders.edges[i].cursor;
          }

          hasNextPage = respBody.data.orders.pageInfo.hasNextPage;
        }
      }
    }
  } while (cursor != null && hasNextPage == true);
  return returnVal;
}

function getQueryObjectForStore(
  cursor = null,
  limit = 25,
  lastChecked: string,
) {
  var returnVal = new Array();
  returnVal.push(`first: ${limit}`);

  if (cursor != null) {
    returnVal.push(`after: ${cursor}`);
  }

  returnVal.push(`query: "created_at:>'${lastChecked}T00:00:00Z'"`);

  return returnVal.join(", ");
}

async function checkStoreInstallation(store: any) {
  try {
    var query = `query {
            shop {
                id
                name
            }
        }`;

    var response = await makeAGraphQLAPICallToShopify(store, { query: query });
    return response.respBody != null && response.respBody.data.shop.id;
  } catch (error) {
    return false;
  }
}

async function getActiveSubscriptionForStore(store: any) {
  try {
    var query = `query {
            currentAppInstallation {
                activeSubscriptions {
                    id
                    lineItems {
                        id
                    }
                    status
                    currentPeriodEnd
                    name
                }
            }
        }`;

    return await makeAGraphQLAPICallToShopify(store, { query: query });
  } catch (error: any) {
    console.log(error.message);
    return null;
  }
}

async function makeAGraphQLAPICallToShopify(store: any, payload: object) {
  let reqResult = null;
  try {
    var API_VERSION = "2024-10";

    let endpoint = `https://${store.shop}/admin/api/${API_VERSION}/graphql.json`;
    let headers = {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": store.accessToken,
    };

    reqResult = await axios
      .post(endpoint, payload, { headers: headers })
      .then((res) => {
        return {
          status: true,
          respBody: res.data,
        };
      })
      .catch(function (error) {
        if (error.response) {
          return {
            status: false,
            respBody: error.response.data,
            statusCode: error.response.status,
          };
        } else {
          return {
            status: false,
            message: "ERROR",
            respBody: error,
          };
        }
      });
  } catch (error: any) {
    reqResult = {
      status: false,
      respBody: null,
      message: error.message,
    };
  }
  return reqResult;
}

function getCustomAttributeValue(lineItem: any, key: string): any {
  const customAttributes = lineItem.customAttributes;

  for (const attribute of customAttributes) {
    if (attribute.key === key) {
      return attribute.value; // Return the value if the key matches
    }
  }

  return undefined; // Return undefined if the key is not found
}

async function getConvertedPrice(order: any) {
  try {
    var currentTotalPriceSet = order.currentTotalPriceSet.shopMoney;
    var decimalPrice = parseFloat(currentTotalPriceSet.amount).toFixed(2);
    var returnVal = parseFloat(currentTotalPriceSet.amount);

    if (currentTotalPriceSet.currencyCode != "USD") {
      var floatPrice = parseFloat(decimalPrice);
      // var conversionObject = {from: currentTotalPriceSet.currencyCode, to:"USD", amount: parseFloat(decimalPrice)}
      // var currencyConverter = new CC(conversionObject);
      // returnVal = await currencyConverter.convert().then((response: any) => {
      //     return response;
      // });
      returnVal = await Convert(floatPrice)
        .from(currentTotalPriceSet.currencyCode)
        .to("USD");
      //console.log('converted price from '+currentTotalPriceSet.currencyCode+' to USD '+floatPrice+' = '+returnVal);
    }

    return returnVal;
  } catch (error: any) {
    console.log(error.message);
    return 0;
  }
}

async function calculateTotalRevenue(
  orders: any[],
): Promise<{ totalOrdersRevenue: number; totalUpsellRevenue: number }> {
  let totalOrdersRevenue = 0;
  let totalUpsellRevenue = 0;

  for (const order of orders) {
    var convertedPriceUSD = await getConvertedPrice(order);
    // Sum the totalPrice for all orders
    if (!isNaN(convertedPriceUSD)) {
      totalOrdersRevenue += convertedPriceUSD;
    } else {
      throw new Error(
        `${order.name} ${order.id} returned value ${convertedPriceUSD}`,
      );
    }

    // Iterate through lineItems to calculate upsell revenue
    for (const lineItemEdge of order.lineItems.edges) {
      const lineItem = lineItemEdge.node;
      const isUpsellOrigin = getCustomAttributeValue(
        lineItem,
        "_isUpsellOrigin",
      );

      if (isUpsellOrigin === true) {
        // If _isUpsellOrigin is true, add discountedTotalSet.shopMoney.amount
        totalUpsellRevenue += lineItem.discountedTotalSet.shopMoney.amount;
      } else if (isUpsellOrigin === false) {
        // If _isUpsellOrigin is false, add discountedUnitPriceSet.shopMoney.amount * _upsellQuantity
        const upsellQuantity =
          getCustomAttributeValue(lineItem, "_upsellQuantity") || 0;
        totalUpsellRevenue +=
          lineItem.discountedUnitPriceSet.shopMoney.amount * upsellQuantity;
      }
    }
  }

  return { totalOrdersRevenue, totalUpsellRevenue };
}

async function fetchActiveUsageRecord(store: { shop: string }): Promise<any> {
  try {
    const activeRecord = await prisma.storeSubscriptionInfo.findFirst({
      where: {
        shop: store.shop,
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    return activeRecord;
  } catch (error) {
    console.error(
      `Failed to fetch pending usage record for shop ${store.shop}:`,
      error,
    );
    throw error;
  }
}
