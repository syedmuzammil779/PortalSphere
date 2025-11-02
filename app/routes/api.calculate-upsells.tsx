import { json } from "@remix-run/node";
import type { LoaderFunctionArgs } from "@remix-run/node";
import { handleCors } from "~/utils/cors.server";
import prisma from "~/db.server";
import { checkStoreInstallation, getActiveSubscriptionForStore, getAdminClient, getQueryObjectForStore, verifyActiveSubscription } from "~/services/CustomFunctions.server";
import { Convert } from "easy-currencies";

export async function loader({ request }: LoaderFunctionArgs) {
  const corsResponse = handleCors(request);

  if (corsResponse instanceof Response) {
    return corsResponse;
  }

  if (request.method === "OPTIONS") {
    return new Response(null, { headers: corsResponse });
  }

  try {

    var returnVal = {};

    const allStores = await prisma.session.findMany({
        where: {
            shop: {
                in: [
                    'portalsphere-demo-store.myshopify.com',
                    'goldenhempdistro.myshopify.com', 
                    'little-traverse-tileworks.myshopify.com'
                ]
            }
        }
    });

    if(!allStores) {
        throw new Error('No stores found!');
    }

    for(var i in allStores) {
        const currentStore = allStores[i];
        
        const checkInstall = await checkStoreInstallation(currentStore);
        if(!checkInstall) {
            continue;
        }

        var activeSub = await getActiveSubscriptionForStore(currentStore);
        if(!activeSub) {
            continue;
        }

        var currentSubscriptionId = await verifyActiveSubscription(currentStore, activeSub);
        if(!currentSubscriptionId) {
            continue;
        }
        
        returnVal[currentStore.shop] = new Array();    
        const admin = await getAdminClient(currentStore);
        const orders = await getOrdersForStore(admin);
 
        const { totalOrdersRevenue, totalUpsellRevenue } = await calculateTotalRevenue(orders);
        returnVal[currentStore.shop] = {
            totalOrdersRevenue: totalOrdersRevenue,
            totalUpsellRevenue: totalUpsellRevenue
        }
        
    }

    return json({
        status: true,
        message: 'here!',
        data: returnVal
    });
  } catch(err: any) {
    //console.trace(err);
    return json({
        status: false,
        message: err.message
    })
  }
}

async function getConvertedPrice(order: any) {
    try {
        var currentTotalPriceSet = order.currentTotalPriceSet.shopMoney;
        var decimalPrice = parseFloat(currentTotalPriceSet.amount).toFixed(2);
        var returnVal = parseFloat(currentTotalPriceSet.amount);
        
        if(currentTotalPriceSet.currencyCode != 'USD') {
            var floatPrice = parseFloat(decimalPrice);
            // var conversionObject = {from: currentTotalPriceSet.currencyCode, to:"USD", amount: parseFloat(decimalPrice)}
            // var currencyConverter = new CC(conversionObject);
            // returnVal = await currencyConverter.convert().then((response: any) => {
            //     return response;
            // });
            returnVal = await Convert(floatPrice).from(currentTotalPriceSet.currencyCode).to("USD");
            //console.log('converted price from '+currentTotalPriceSet.currencyCode+' to USD '+floatPrice+' = '+returnVal);
        } 

        return returnVal;
    } catch (error: any) {
        console.log(error.message);
        return 0;
    }
}

async function calculateTotalRevenue(orders: any[]): Promise<{ totalOrdersRevenue: number; totalUpsellRevenue: number; }> {
    let totalOrdersRevenue = 0;
    let totalUpsellRevenue = 0;

    for (const order of orders) {
        var convertedPriceUSD = await getConvertedPrice(order);
        // Sum the totalPrice for all orders
        if(!isNaN(convertedPriceUSD)) {
            totalOrdersRevenue += convertedPriceUSD;
        } else {
            throw new Error(`${order.name} ${order.id} returned value ${convertedPriceUSD}`);
        }
        
        // Iterate through lineItems to calculate upsell revenue
        for (const lineItemEdge of order.lineItems.edges) {
            const lineItem = lineItemEdge.node;
            const isUpsellOrigin = getCustomAttributeValue(lineItem, '_isUpsellOrigin');

            if (isUpsellOrigin) {
                // If _isUpsellOrigin is true, add discountedTotalSet.shopMoney.amount
                totalUpsellRevenue += parseFloat(lineItem.discountedTotalSet.shopMoney.amount);
            } else if (isUpsellOrigin === undefined) {
                // If _isUpsellOrigin is false, add discountedUnitPriceSet.shopMoney.amount * _upsellQuantity
                const upsellQuantity = getCustomAttributeValue(lineItem, '_upsellQuantity') || 0;
                if(upsellQuantity) 
                    totalUpsellRevenue += parseFloat(lineItem.discountedUnitPriceSet.shopMoney.amount) * upsellQuantity;
            }
        }
    }

    return { totalOrdersRevenue, totalUpsellRevenue };
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

async function getOrdersForStore(admin: any): Promise<any[]> {
    var cursor = null;
    var limit = 100;
    var hasNextPage = false;
    var returnVal = new Array();
    do {
        var queryObject = getQueryObjectForStore(cursor, limit, null);
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

        let response = await admin.request(query);
        if(response && response.hasOwnProperty('data') && response.data) {
            var orders = response.data.orders;
            
            if(orders && orders.hasOwnProperty('edges') && orders.edges.length) {
                for(var i in orders.edges) {
                    var node = orders.edges[i].node;
                    returnVal.push(node);
                    cursor = orders.edges[i].cursor;
                }

                hasNextPage = response.data.orders.pageInfo.hasNextPage;
            } 
        }

    } while (cursor != null && hasNextPage == true);
    
    return returnVal;
}

// Add action for handling non-GET requests
export async function action({ request }: LoaderFunctionArgs) {
  const corsResponse = handleCors(request);
  
  if (corsResponse instanceof Response) {
    return corsResponse;
  }

  if (request.method === "OPTIONS") {
    return new Response(null, { headers: corsResponse });
  }

  return json(
    { error: "Method not allowed" },
    { 
      status: 405,
      headers: corsResponse
    }
  );
}