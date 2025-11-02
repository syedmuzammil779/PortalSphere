import { json } from "@remix-run/node";
import type { LoaderFunctionArgs } from "@remix-run/node";
import { B2B_PLUS_NAMESPACE, VOLUME_DISCOUNTS_KEY } from "~/services/CustomerGroups.server";
import { PORTALSPHERE_SUBSCRIPTION, unauthenticated } from "~/shopify.server";
import { handleCors } from "~/utils/cors.server";
import prisma from "~/db.server";
import { checkStoreInstallation, getActiveSubscriptionForStore, makeAGraphQLAPICallToShopify, sendSlackNotification } from "~/services/CustomFunctions.server";
const targetTag = 'PORTALSPHERE_DISCOUNT_APPLIED';

// Loader function
export async function loader({ request }: LoaderFunctionArgs) {
  const corsResponse = handleCors(request);

  if (corsResponse instanceof Response) {
    return corsResponse;
  }

  if (request.method === "OPTIONS") {
    return new Response(null, { headers: corsResponse });
  }

  try {
    // Get shop from URL parameters
    const url = new URL(request.url);
    const shop = url.searchParams.get('shop');
    const orderId = url.searchParams.get('orderid');
    
    if (!shop) {
      return json({message: 'Missing shop parameter'}, {headers: corsResponse});
    }

    if(!orderId) {
        return json({message: 'Missing orderId parameter'}, {headers: corsResponse});
    }

    const dbShop = await prisma.session.findFirst({ where: { shop: shop }});

    const metafieldsBody = `
        metafields (first: 25, namespace:"${B2B_PLUS_NAMESPACE}") {
            edges {
                node {
                    namespace
                    key
                    jsonValue
                    value
                }
            }
        }
    `;

    const draftOrderQuery = `query {
        draftOrder(id: "gid://shopify/DraftOrder/${orderId}") {
            id
            name
            customer { id tags ${metafieldsBody} }
            tags
            lineItems(first: 250) {
                edges {
                    node { 
                        id uuid quantity appliedDiscount { title value valueType }
                        variant { id price ${metafieldsBody} } 
                    }
                }
            }
            status
            totalPriceSet {
                shopMoney {
                    amount
                    currencyCode
                }
            }
        }   
    }`;

    const checkInstall = await checkStoreInstallation(dbShop);
    if(!checkInstall) {
        return json({message: 'Store invalid/empty!'}, {headers: corsResponse});
    }

    var activeSub = await getActiveSubscriptionForStore(dbShop);
    if(!activeSub) {
        return json({message: 'Please get the paid plan for PortalSphere to avail this feature.'}, {headers: corsResponse});
    }

    var currentAppInstallation = activeSub.respBody.data.currentAppInstallation;
    let currentSubscriptionId = null;
    try {
        for(var i in currentAppInstallation.activeSubscriptions) {
            var currentSub = currentAppInstallation.activeSubscriptions[i];

            if(currentSub['status'] == 'ACTIVE' && currentSub['name'] == PORTALSPHERE_SUBSCRIPTION) {
                currentSubscriptionId = currentSub.lineItems[0]['id'];
            }
        }
    } catch(error: any) {
        console.log(error.message);
        await sendSlackNotification('Invalid sub line 106: for store - '+dbShop?.shop+' ActiveSub '+JSON.stringify(activeSub));
    }

    if(!currentSubscriptionId) {
        return json({message: 'Your store does not seem to be on a paid plan to be able to use this feature.'}, {headers: corsResponse});
    }

    const shopMetafield = await getShopMetafield(dbShop);
    const draftOrderResponse = await makeAGraphQLAPICallToShopify(dbShop, {query: draftOrderQuery});
               
    let draftOrder = draftOrderResponse.respBody.data.draftOrder;
        
    if(!draftOrder) {
        return json({message: 'Invalid order details.'}, {headers: corsResponse});
    }

    if(draftOrder.status != 'OPEN') {
        return json({message: 'Draft order has an invalid status. Only OPEN status is allowed. Detected status '+draftOrder.status}, {headers: corsResponse});
    }
    
    const splitTags = typeof(draftOrder.tags) == 'string' ? draftOrder.tags.split(', ') : draftOrder.tags;
    if(splitTags.includes(targetTag)) {
        return json({message: 'The order seems to have been already processed.'}, {headers: corsResponse});   
    }
    
    var customerTagToLookFor = null;

    var draftOrderhasCustomerTags = false;
    if(draftOrder.hasOwnProperty('customer') && draftOrder.customer != null && draftOrder.customer.hasOwnProperty('tags') && draftOrder.customer.tags != null) {
        draftOrderhasCustomerTags = true;   
    }

    if(!draftOrderhasCustomerTags) {
        return json({message: 'The customer associated to this order does not seem to have valid tags associated with them.'}, {headers: corsResponse});
    }

    const customerSplitTags = typeof(draftOrder.customer.tags) == 'string' ? draftOrder.customer.tags.split(', ') : draftOrder.customer.tags;
    for(var i in customerSplitTags) {
        var currentTagToLookFor = customerSplitTags[i];
        if(!customerTagToLookFor && shopMetafield?.discountConfig.hasOwnProperty(currentTagToLookFor)) {
            customerTagToLookFor = {
                tag: currentTagToLookFor,
                discount: parseFloat(shopMetafield.discountConfig[currentTagToLookFor]['discount']).toFixed(2),
                config: shopMetafield.tagSpecificDiscounts[currentTagToLookFor]
            }
        }
    }

    if(!customerTagToLookFor) {
        return json({message: 'The customer associated to this order does not seem to have a valid tag.'}, {headers: corsResponse});
    }

    var formattedDraftOrder = {
        id: draftOrder.id, 
        shopMetafield: shopMetafield,
        name: draftOrder.name, 
        customerTagSelected: customerTagToLookFor,
        totalPrice: draftOrder.totalPriceSet.shopMoney, 
        status: draftOrder.status, 
        tags: [],
        customer: draftOrder.customer,
        lineItems: {}
    };

    try {
        if(draftOrder.lineItems.edges) {
            for(var j in draftOrder.lineItems.edges) {
                var currentNode = draftOrder.lineItems.edges[j].node;
                if(currentNode.variant.metafields.edges) {
                    if(!Object.keys(formattedDraftOrder.lineItems).includes(currentNode.variant.id)) 
                        formattedDraftOrder.lineItems[currentNode.variant.id] = {
                            id: currentNode.uuid, 
                            variant_id: currentNode.variant.id, 
                            quantity: currentNode.quantity, 
                            variant_price: parseFloat(currentNode.variant.price).toFixed(2),
                            applied_discount: currentNode.appliedDiscount,
                            metafields: new Array()
                        };
                    
                    for(var k in currentNode.variant.metafields.edges) {
                        var currentMeta = currentNode.variant.metafields.edges[k].node;
                        if(typeof(currentMeta.jsonValue) != 'string') {
                            var formattedJSONValue = {};
                            for(var l in currentMeta.jsonValue) {
                                formattedJSONValue[currentMeta.jsonValue[l].tag] = currentMeta.jsonValue;
                            }
                            formattedDraftOrder.lineItems[currentNode.variant.id].metafields.push({
                                key: currentMeta.key,
                                jsonValue: formattedJSONValue
                            });
                        }
                    }
                }
            }
        }
    } catch (error: any) {
        await sendSlackNotification('Error draft order cron in line 213: for store - '+dbShop?.shop+' '+error.message);
    }

    try {
        //After arranging the order properly, check the tag if that's present. If yes, then don't apply it.
        await applyDiscount(formattedDraftOrder, dbShop);     
    } catch (error: any) {
        await sendSlackNotification('Error draft order cron in line 221: for store - '+dbShop?.shop+' '+error.message);
    }

    return json({ message: 'Order processed! Please refresh the page now. Thank you.' }, {
      headers: corsResponse
    });

  } catch (error) {
    const errorMessage = (error as Error).message;
    
    return json({ error: 'Oops! It seems like we have encountered an issue trying to process this order. Do not worry, we have already notified the team about it.' }, { 
        status: errorMessage.includes("Invalid") ? 401 : errorMessage.includes("Missing") ? 400 : 500,
        headers: corsResponse
    });
  }
}

async function applyDiscount(draftOrder: any, store: any) {
    for(var lineItemId in draftOrder.lineItems) {
        var lineItemLevelDiscount = await findTheDiscountToApplyForLineItem(draftOrder.shopMetafield, draftOrder.customerTagSelected, draftOrder.lineItems[lineItemId]);
        draftOrder['lineItems'][lineItemId]['discountConfig'] = lineItemLevelDiscount;
    }

    var lineItemInputs = new Array();
    for(var lineItemId in draftOrder.lineItems) {
        var draftOrderCurrentLineItem = draftOrder['lineItems'][lineItemId];
        var baseQuery = `
            uuid: "${draftOrderCurrentLineItem['id']}",
            quantity: ${draftOrderCurrentLineItem['quantity']},
            variantId: "${draftOrderCurrentLineItem['variant_id']}",
        `;
        if(draftOrderCurrentLineItem.hasOwnProperty('applied_discount') && draftOrderCurrentLineItem['applied_discount'] != null && draftOrderCurrentLineItem.applied_discount.hasOwnProperty('title') && draftOrderCurrentLineItem.applied_discount.title != null) {
            baseQuery += `
                appliedDiscount: {
                    valueType: ${draftOrderCurrentLineItem.applied_discount.valueType},
                    value: ${draftOrderCurrentLineItem.applied_discount.value},
                    title: "Wholesale Price"
                }
            `;
        } else {
            if(draftOrderCurrentLineItem.discountConfig.hasOwnProperty('status') && draftOrderCurrentLineItem.discountConfig.status) {
                baseQuery += `
                    appliedDiscount: {
                        valueType: ${draftOrderCurrentLineItem.discountConfig.discount_type},
                        value: ${draftOrderCurrentLineItem.discountConfig.valueOff},
                        title: "Wholesale Price"
                    }
                `;
            }
        }

        lineItemInputs.push(`{ ${baseQuery} }`);
    }

    if(lineItemInputs.length > 0) {
        draftOrder.tags.push(targetTag);
        var mutation = `
            mutation {
                draftOrderUpdate (input: { lineItems: [${lineItemInputs.join(',')}], tags: ${JSON.stringify(draftOrder.tags)}}, id:"${draftOrder.id}") {
                    userErrors {
                        field
                        message
                    }
                }
            }
        `;

        const updateResponse = await makeAGraphQLAPICallToShopify(store, {query: mutation});
        await sendSlackNotification('Update draftOrder '+draftOrder.id+' for shop '+store.shop+': '+JSON.stringify(updateResponse));
    } 
}

async function findTheDiscountToApplyForLineItem(shopmetafield: any, customerTagSelected: any, lineItem: any) {
    try {
        var lineItemDiscountInfo = null;
        if(lineItem.hasOwnProperty('metafields') && lineItem.metafields.length > 0) {
            //First attempt to see if there are tiered discount set for the line Item.
            //If yes, check for the quantity, using the closest possible largest priceConfig
            for(var i in lineItem.metafields) {
                var currentLineItemMF = lineItem.metafields[i];
                if(currentLineItemMF != null && currentLineItemMF.hasOwnProperty('key') && currentLineItemMF.key === 'volumeDiscounts') {
                    if(currentLineItemMF.hasOwnProperty('jsonValue') && currentLineItemMF.jsonValue.hasOwnProperty(customerTagSelected.tag)) {
                        var configArr = currentLineItemMF.jsonValue[customerTagSelected.tag];
                        if(configArr) {
                            for(var j in configArr) {
                                const innerCondition = configArr[j] != null && configArr[j].hasOwnProperty('tag') && configArr[j].tag == customerTagSelected.tag && configArr[j].hasOwnProperty('volumeConfig') && configArr[j].hasOwnProperty('priceConfig') && configArr[j].priceConfig.length > 0 && configArr[j].hasOwnProperty('type');
                                //console.log('innerCondition', innerCondition);
                                if(innerCondition) {
                                    var minimumSatisfied = configArr[j].volumeConfig.hasOwnProperty('minimum') && configArr[j].volumeConfig.minimum != null && configArr[j].volumeConfig.minimum != '' ? lineItem.quantity >= parseInt(configArr[j].volumeConfig.minimum) : true;
                                    var maximumSatisfied = configArr[j].volumeConfig.hasOwnProperty('maximum') && configArr[j].volumeConfig.maximum != null && configArr[j].volumeConfig.maximum != '' ? lineItem.quantity <= parseInt(configArr[j].volumeConfig.maximum) : true;
                                    if(minimumSatisfied && maximumSatisfied) {
                                        lineItemDiscountInfo = configArr[j];
                                        break;
                                    } 
                                }
                            }
                        }
                    }
                }
            }
        }   
        
        if(!lineItemDiscountInfo) {
            //Line Item metafields don't exist, now just check against the quantity and apply it
            var storeLevelConfig = customerTagSelected.config;

            var minimumSatisfied = storeLevelConfig.hasOwnProperty('minimum') && storeLevelConfig.minimum != '' ? lineItem.quantity >= parseInt(storeLevelConfig.minimum) : true;
            var maximumSatisfied = storeLevelConfig.hasOwnProperty('maximum') && storeLevelConfig.maximum != '' ? lineItem.quantity <= parseInt(storeLevelConfig.maximum) : true;

            if(storeLevelConfig != null && minimumSatisfied && maximumSatisfied) {
                return {
                    status: true,
                    valueOff: parseFloat(customerTagSelected.discount).toFixed(2),
                    discount_type: 'PERCENTAGE'
                }
            }
        } else {
            //Find the quantity that applies and then check if it's fixed discount or percentage discount
            var isPercentage = lineItemDiscountInfo.type == 'percentage';
            var priceConfigArr = null;
            for(var i in lineItemDiscountInfo.priceConfig) {
                if(lineItem.quantity >= parseInt(lineItemDiscountInfo.priceConfig[i].quantity)) {
                    if(priceConfigArr != null) {
                        if(parseInt(lineItemDiscountInfo.priceConfig[i]['quantity']) > parseInt(priceConfigArr['quantity'])) {
                            priceConfigArr = lineItemDiscountInfo.priceConfig[i];
                        }
                    } else {
                        priceConfigArr = lineItemDiscountInfo.priceConfig[i];
                    }
                }
            }

            if(priceConfigArr != null && priceConfigArr.hasOwnProperty('percentage')) {
                var variantPrice = parseFloat(lineItem.variant_price).toFixed(2);
                if(isPercentage) {
                    return {
                        status: true,
                        valueOff: parseFloat(priceConfigArr.percentage).toFixed(2),
                        discount_type: 'PERCENTAGE'
                    }
                } else {
                    var priceDiff = parseFloat(variantPrice - parseFloat(priceConfigArr.percentage).toFixed(2)).toFixed(2);
                    
                    if(priceDiff > 0) {
                        return {
                            status: true,
                            valueOff: priceDiff,
                            discount_type: 'FIXED_AMOUNT'
                        }
                    }
                }
            } 
        }

        return {
            status: false,
            valueOff: 0,
            discount_type: 'PERCENTAGE'
        }
    } catch (error: any) {
        console.trace(error);
        //await sendSlackNotification('Error in draft order update line 215: '+error.message);
        return {
            status: false,
            message: "Error: "+error.message
        }
    }
}

async function getShopMetafield(store: any) {
    var query = `{
        shop {
            id
            metafields(first: 250, namespace:"${B2B_PLUS_NAMESPACE}") {
                nodes {
                    id
                    key
                    jsonValue
                }
            }
        }
    }`;

    const shopMetafieldResponse = await makeAGraphQLAPICallToShopify(store, {query: query});
    if(shopMetafieldResponse.status) {
        var nodes = shopMetafieldResponse.respBody.data.shop.metafields.nodes;
        if(nodes.length) {
            const tagSpecificDiscounts = await getTagSpecificDiscount(nodes);
            for(var i in nodes) {
                if(nodes[i].hasOwnProperty('key') && nodes[i]['key'] == VOLUME_DISCOUNTS_KEY) {
                    var jsonValue = nodes[i].jsonValue;
                    if(typeof(jsonValue) != 'string') {
                        var returnVal = {};
                        for(var i in jsonValue) {
                            returnVal[jsonValue[i]['tag']] = jsonValue[i];
                        }

                        return {
                            "id": nodes[i].id,
                            "key": nodes[i].key,
                            "discountConfig": returnVal,
                            "jsonValue": jsonValue,
                            "tagSpecificDiscounts": tagSpecificDiscounts 
                        }
                    }
                }
            }
        }
    }

    return null;
}

async function getTagSpecificDiscount(nodes: any) {
    var returnVal = {};
    const b2bTag = String(process.env.B2B_PREFIX);
    const b2cTag = String(process.env.B2C_PREFIX);
    for await (var node of nodes) {
        if(node.hasOwnProperty('key') && (node.key.startsWith(b2bTag) || node.key.startsWith(b2cTag))) {
            returnVal[node.key] = node.jsonValue;
        }
    }

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