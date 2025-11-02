import prisma from '../db.server';
import moment from 'moment';
import axios from 'axios';
import { calculatePricing } from '~/lib/pricing';
import { PORTALSPHERE_SUBSCRIPTION } from "../shopify.server";
const dateFormat = 'YYYY-MM-DD';
const daysFrequency = Number(process.env.BILLING_INTERVAL_DAYS || '30');
import { Convert } from "easy-currencies";
import { getActiveSubscriptionForStore, sendSlackNotification } from '~/services/CustomFunctions.server';
    
export const checkStoreUsageBilling = async (): Promise<boolean> => {
    const todayMoment = moment().startOf('day');
    
    const allStores = await prisma.session.findMany({
        where: {
            billingFlag: true
        },
        distinct: ['shop']
    });

    if(!allStores) {
        return false;
    }

    for(var i in allStores) {

        const currentStore = allStores[i];

        var installationValid = await checkStoreInstallation(currentStore);
        if(!installationValid) {
            continue;
        }

        var activeSubscriptionForStore = await getActiveSubscriptionForStore(currentStore);

        try {
            if(!activeSubscriptionForStore) {
                continue;
            }

            var activeFlag = false;
            const activeSubs = activeSubscriptionForStore.respBody?.data?.currentAppInstallation?.activeSubscriptions || null;
            
            if(activeSubs) {
                for(var sub in activeSubs) {
                    if(activeSubs[sub].hasOwnProperty('status') && activeSubs[sub].status == 'ACTIVE') {
                        activeFlag = true; break;
                    }
                }
            }

            if(!activeFlag) {
                continue;
            }
        } catch (error: any) {
            await sendSlackNotification(`Store ${currentStore.shop} faced error in biiling script ${error.message}`);
            continue;
        }
                
        var lastChecked = moment(currentStore.createdAt);

        var lastCheckRow = await prisma.storeUsageBillingInfo.findFirst({
            where: {
                paymentFlag: 1,
                shop: currentStore.shop
            },
            orderBy: {
                createdAt: 'desc'
            }
        });

        if(lastCheckRow) {
            lastChecked = moment(lastCheckRow.lastChecked);
        }

        //Now that we have lastChecked in moment object check if today and lastChecked diff is greater than the frequency
        var daysDiff = todayMoment.diff(lastChecked, 'days');
        
        if(daysDiff < daysFrequency) {
            continue;
        }

        var orders = await getOrdersForStore(currentStore, lastChecked.format(dateFormat));
        
        /*
        //We're gonna charge them even if there's no orders
        if(orders.length == 0) {
            await sendSlackNotification(`[BILLING_SCRIPT] No orders found for shop ${currentStore.shop}, so skipping it for billing`);
            continue;
        }
        */
        
        var currentAppInstallation = activeSubscriptionForStore.respBody.data.currentAppInstallation;
        let currentSubscriptionId = null; //This is needed because we will place charge on this one.
        try {
            for(var i in currentAppInstallation.activeSubscriptions) {
                var currentSub = currentAppInstallation.activeSubscriptions[i];

                if(currentSub['status'] == 'ACTIVE' && currentSub['name'] == PORTALSPHERE_SUBSCRIPTION) {
                    currentSubscriptionId = currentSub.lineItems[0]['id'];
                }
            }
        } catch(error: any) {
            await sendSlackNotification(`[BILLING_SCRIPT] Error in finding current sub id for shop ${currentStore.shop} - ${error.message}`);
            console.log(error.message);
        }

        if(!currentSubscriptionId) {
            await sendSlackNotification(`[BILLING_SCRIPT] Current Sub ID not found for shop ${currentStore.shop}`);
            continue;
        }

        // Update usage record after processing orders
        try {
            await updateUsageRecord(currentStore, orders, todayMoment.format(dateFormat), currentSubscriptionId);    
        } catch (error: any) {
            await sendSlackNotification(`[BILLING_SCRIPT] Error in charging shop ${currentStore.shop} - ${error.message}`);
        }   
    }

    const trueVal = true;
    return trueVal;
};

async function getOrdersForStore(store: any, lastChecked: string): Promise<any[]> {
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

        let response = await makeAGraphQLAPICallToShopify(store, {query: query});
        if(response && response.hasOwnProperty('status') && response.status) {
            var respBody = response.respBody;
            if(respBody && respBody.hasOwnProperty('data') && respBody.data.hasOwnProperty('orders')) {
                var orders = respBody.data.orders;
                if(orders && orders.hasOwnProperty('edges') && orders.edges.length) {
                    for(var i in orders.edges) {
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

function getQueryObjectForStore(cursor = null, limit = 25, lastChecked: string) {
    var returnVal = new Array();
    returnVal.push(`first: ${limit}`);

    if(cursor != null) {
        returnVal.push(`after: "${cursor}"`);
    }

    returnVal.push(`query: "created_at:>'${lastChecked}T00:00:00Z'"`);
    
    return returnVal.join(', ');
}

async function checkStoreInstallation(store: any) {
    try {
        var query = `query {
            shop {
                id
                name
            }
        }`;
    
        var response = await makeAGraphQLAPICallToShopify(store, {query: query});
        return response.respBody != null && response.respBody.data.shop.id;    
    } catch (error) {
        return false;
    }
}

async function makeAGraphQLAPICallToShopify(store: any, payload: object) {
    let reqResult = null;
    try {
        var API_VERSION = '2024-10';
        
        let endpoint = `https://${store.shop}/admin/api/${API_VERSION}/graphql.json`;
        let headers = {
            "Content-Type": "application/json",
            "X-Shopify-Access-Token": store.accessToken
        }

        reqResult = await axios.post(endpoint, payload, {headers: headers})
        .then((res) => {
            return {
                "status": true,
                "respBody": res.data
            };
        })
        .catch(function (error) {
            if (error.response) {
                return {
                    "status": false,
                    "respBody": error.response.data,
                    "statusCode": error.response.status
                }
            } else {
                return {
                    "status": false,
                    "message": "ERROR",
                    "respBody": error
                }
            }
        });
    } catch (error: any) {
        reqResult = {
            "status": false,
            "respBody": null,
            "message": error.message
        }
    }
    return reqResult;
}

// Updated function to update usage records
async function updateUsageRecord(store: any, orders: any[], todaysDate: string, currentSubscriptionId: string): Promise<void> {

    //const activeUsageRecord = await fetchActiveUsageRecord(store);
    const { totalOrdersRevenue, totalUpsellRevenue } = await calculateTotalRevenue(orders);

    let computedTotalEarnings = null;
    let computedUpsellEarnings = null;

    computedTotalEarnings = totalOrdersRevenue;
    computedUpsellEarnings = totalUpsellRevenue;

    // Calculate pricing tier
    let { tier, basePrice, additionalUpsellFee, totalPrice, bumpedTier, originalTier } = calculatePricing(computedTotalEarnings, computedUpsellEarnings);

    if(store.fixedBillAmount) {
        basePrice = store.fixedBillAmount;
    }

    var paymentFlag = false;
    var description = bumpedTier ? 'Bumped to: ' : '';
    description += `Tier ${tier.tier.toString()} Total Earnings: ${computedTotalEarnings}, Upsell earnings: ${computedUpsellEarnings}`
    var mutation = `mutation {
        appUsageRecordCreate(
            subscriptionLineItemId: "${currentSubscriptionId}",
            description: "${description}",
            price: {
                amount: ${basePrice},
                currencyCode: USD
            }
        ) {
            userErrors {
                field
                message
            },
            appUsageRecord {
                id
            }
        }
    }`;

    var paymentResponse = await makeAGraphQLAPICallToShopify(store, {query: mutation});
    if(paymentResponse.status) {
        try {
            var paymentId = paymentResponse.respBody.data.appUsageRecordCreate.appUsageRecord.id;
            if(paymentId) {
                paymentFlag = true;
            }    
        } catch (error: any) {
            console.log('error at line 312');
            console.log(error.message);            
        }
    }

    await prisma.storeUsageBillingInfo.create({
        data: {
            shop: store.shop,
            apiResponse: JSON.stringify({
                "description": description,
                "apiResponse": paymentResponse
            }),
            lastChecked: todaysDate,
            paymentFlag: paymentFlag ? 1 : 0
        },
    });
    
    // Create a new record if no active usage record exists
    await prisma.storeSubscriptionInfo.create({
        data: {
            shop: store.shop,
            currentTier: tier.tier.toString(),
            totalEarnings: computedTotalEarnings.toString(),
            upsellEarnings: computedUpsellEarnings.toString(),
            createdAt: new Date(),
            updatedAt: new Date(),
        },
    });
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
        
        if(currentTotalPriceSet.currencyCode != 'USD') {
            var floatPrice = parseFloat(decimalPrice);
            returnVal = await Convert(floatPrice).from(currentTotalPriceSet.currencyCode).to("USD");
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
                    totalUpsellRevenue += parseFloat(lineItem.discountedUnitPriceSet.shopMoney.amount) * parseInt(upsellQuantity);
            }
        }
    }

    return { totalOrdersRevenue, totalUpsellRevenue };
}