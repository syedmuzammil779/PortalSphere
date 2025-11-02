import prisma from '../db.server';
import moment from 'moment';
import { B2B_PLUS_NAMESPACE } from '~/services/CustomerGroups.server';
import { 
    makeAGraphQLAPICallToShopify, 
    getQueryObjectForStore, 
    sendSlackNotification, 
    getActiveSubscriptionForStore, 
    checkStoreInstallation,
    verifyActiveSubscription,
    getShopMetafields 
} from '~/services/CustomFunctions.server';
    
export const updateNetTermsOrderToDraftOrder = async (): Promise<boolean> => {
    const processEnv = process.env.NODE_ENV;
    var storeArr;
    var customerIds;
    if(processEnv == 'development') {
        storeArr = [
            'portalsphere-test-store.myshopify.com'
        ];

        customerIds = {
            'portalsphere-test-store.myshopify.com': new Array()
        };
    } else {
        storeArr = [
            // 'portalsphere-demo-store.myshopify.com', 
            // 'goldenhempdistro.myshopify.com',
            'little-traverse-tileworks.myshopify.com',
            '2t0iff-uh.myshopify.com'
        ];

        customerIds = {
            'little-traverse-tileworks.myshopify.com': new Array(),
            '2t0iff-uh.myshopify.com': new Array()
        };
    }

    const allStores = await prisma.session.findMany({
        where: {
            shop: {
                in: storeArr
            }
        }
    });

    if(!allStores || Object.keys(allStores).length < 1) {
        return false;
    }

    const metafieldsBody = `
        metafields (first: 100, namespace:"${B2B_PLUS_NAMESPACE}") {
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

    const queryObject = getQueryObjectForStore(null, 50, moment().subtract(12, 'hours').format('YYYY-MM-DD'));
    const shopifyOrdersQuery = `{
        orders(${queryObject}) {
            edges {
                node {
                    id
                    name
                    customer { id tags ${metafieldsBody} }
                    tags
                    email
                    lineItems(first: 100) {
                        edges {
                            node { 
                                id quantity
                                variant { id price } 
                            }
                        }
                    }
                    billingAddress {
                        address1 address2 city company 
                        firstName lastName provinceCode country zip
                    }
                    shippingAddress {
                        address1 address2 city company 
                        firstName lastName provinceCode country zip
                    }
                    totalPriceSet {
                        shopMoney {
                            amount
                            currencyCode
                        }
                    }
                    paymentTerms {
                        dueInDays
                        id
                        paymentTermsName
                        paymentTermsType
                        translatedName
                    }
                }
                cursor
            }
            pageInfo {
                hasNextPage
            }
        }
    }`;

    for(var i in allStores) {
        const currentStore = allStores[i];

        try {
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

            const shopMetafields = await getShopMetafields(currentStore);
            
            const shopifyOrdersResponse = await makeAGraphQLAPICallToShopify(currentStore, {query: shopifyOrdersQuery});
            const hasShopifyOrders = shopifyOrdersResponse.respBody?.data?.orders?.edges || null;
    
            if(hasShopifyOrders) {
                for await (let shopifyOrder of shopifyOrdersResponse.respBody.data.orders.edges) {
                    shopifyOrder = shopifyOrder.node;
    
                    if(!shopifyOrder) {
                        continue;
                    }
    
                    const existingDbRecord = await prisma.shopNetTermsOrdersToDraftOrders.findFirst({
                        where: {
                            shop: currentStore.shop,
                            shopifyOrderId: shopifyOrder.id //Not checking with draft order id to prevent multiple times running cron
                        }
                    });

                    if(existingDbRecord) {
                        continue;
                    }
                    /**
                     * Right now we're checking the db, after the new scope is added we will check order tags
                     */
                    // const splitTags = typeof(shopifyOrder.tags) == 'string' ? shopifyOrder.tags.split(', ') : shopifyOrder.tags;
                    // if(splitTags.includes(targetTag)) {
                    //     continue;   
                    // }

                    const isNetTermsOrder = checkIfOrderIsANetTermsOrder(shopifyOrder);
                    if(!isNetTermsOrder) {
                        continue;
                    }

                    const doesCustomerQualify = checkIfCustomerQualifiesForConversion(shopifyOrder, shopMetafields, customerIds, currentStore);
                    if(!doesCustomerQualify.status) {
                        continue;
                    }

                    const draftOrder = await createDraftOrderOffOfOrder(currentStore, shopifyOrder);
                    let draftOrderId = null;
                    if(draftOrder != null && draftOrder.hasOwnProperty('orderId') && draftOrder.orderId) {
                        //After scope updates, we will enable these two lines back up
                        // const archiveOrderResp = await archiveOrder(currentStore, shopifyOrder);
                        // const updateOrderTagsResp = await updateOrderTags(currentStore, targetTag, shopifyOrder);
                        draftOrderId = draftOrder.orderId;
                        const messageForSlack = `
                            Store - ${currentStore.shop} \n
                            Order converted to a draft order ${shopifyOrder.id} \n
                            Draft Order: ${JSON.stringify(draftOrder)} \n
                        `;

                        await sendSlackNotification(messageForSlack);
                    }

                    await prisma.shopNetTermsOrdersToDraftOrders.create({
                        data: {
                            shop: currentStore.shop,
                            shopifyOrderId: shopifyOrder.id,
                            draftOrderId: draftOrderId,
                            draftOrderResp: JSON.stringify(draftOrder)
                        }
                    });
                }
            }    
        } catch (error: any) {
            console.trace(error);
            await sendSlackNotification('Error net terms order cron in line 227: for store - '+currentStore.shop+' '+error.message);
        }
    }
        
    return true;
}

async function updateOrderTags(currentStore: any, targetTag: any, shopifyOrder: any) {

    var orderTags = typeof(shopifyOrder.tags) == 'string' ? shopifyOrder.tags.split(', ') : shopifyOrder.tags;
    if(!orderTags.includes(targetTag)) {
        orderTags.push(targetTag);
    }

    var query = `
        mutation OrderUpdate($input: OrderInput!) {
            orderUpdate(input: $input) {
                order {
                    id
                    tags
                }
                userErrors {
                    field
                    message
                }
            }
        }
    `;

    var variables = {
        input: {
            id: shopifyOrder.id,
            tags: orderTags.join(',')
        }
    }

    var response = await makeAGraphQLAPICallToShopify(currentStore, {query: query, variables: variables});
    // console.log('response for updating order with tags');
    // console.log(JSON.stringify(response.respBody));

    return {
        updateTags: response.respBody.data?.orderUpdate?.order?.tags || null
    }
}

async function archiveOrder(currentStore: any, shopifyOrder: any) {
    var query = `mutation OrderClose($input: OrderCloseInput!) {
        orderClose(input: $input) {
            order {
                closedAt
                cancelReason
                cancelledAt
                closed
            }
            userErrors {
                field
                message
            }
        }
    }`;

    var variables = {
        input: {
            id: shopifyOrder.id
        }
    }

    var response = await makeAGraphQLAPICallToShopify(currentStore, {query: query, variables: variables});
    // console.log('response for closing the order');
    // console.log(JSON.stringify(response.respBody));

    return {
        closedAt: response.respBody.data?.orderClose?.order?.closedAt || 'N/A'
    }
}

async function createDraftOrderOffOfOrder(currentStore: any, shopifyOrder: any) {

    var query = `mutation draftOrderCreate($input: DraftOrderInput!) {
        draftOrderCreate(input: $input) {
            draftOrder {
                id
            }
        }
    }`;

    var lineItemsInput = new Array();
    for(var i in shopifyOrder.lineItems.edges) {
        lineItemsInput.push({
            variantId: shopifyOrder.lineItems.edges[i].node.variant.id,
            quantity: shopifyOrder.lineItems.edges[i].node.quantity
        })
    }

    var variables = {
        input: {
            customerId: shopifyOrder.customer.id,
            note: "Draft Order Copy for "+shopifyOrder.id.replace('gid://shopify/Order/', ''),
            email: shopifyOrder.email,
            tags: typeof(shopifyOrder.tags) == 'string' ? shopifyOrder.tags.split(', ') : shopifyOrder.tags,
            billingAddress: {
                address1: shopifyOrder.billingAddress.address1,
                address2: shopifyOrder.billingAddress.address2,
                city: shopifyOrder.billingAddress.city,
                province: shopifyOrder.billingAddress.province,
                country: shopifyOrder.billingAddress.country,
                zip: shopifyOrder.billingAddress.zip
            },
            shippingAddress: {
                address1: shopifyOrder.shippingAddress.address1,
                address2: shopifyOrder.shippingAddress.address2,
                city: shopifyOrder.shippingAddress.city,
                province: shopifyOrder.shippingAddress.province,
                country: shopifyOrder.shippingAddress.country,
                zip: shopifyOrder.shippingAddress.zip
            },
            lineItems: lineItemsInput
        }
    }

    const response = await makeAGraphQLAPICallToShopify(currentStore, {query: query, variables: variables});
    // console.log('response for creating a new order');
    // console.log(JSON.stringify(response.respBody));

    return {
        orderId: response.respBody?.data?.draftOrderCreate?.draftOrder?.id || false
    }
}

function checkIfOrderIsANetTermsOrder(shopifyOrder: any): boolean {
    const paymentTerms = shopifyOrder.paymentTerms;
    //console.log('payment Terms', paymentTerms);
    if(paymentTerms && paymentTerms.hasOwnProperty('paymentTermsType')) {
        //console.log('payment type for order', paymentTerms.paymentTermsType);
        return paymentTerms.paymentTermsType === 'NET';
    }

    return false;
}

function checkIfCustomerQualifiesForConversion(shopifyOrder: any, shopMetafields: any, customerIds: any, currentStore: any): any {

    var returnVal = {
        status: false,
        message: 'Not found!'
    };

    var customerTags = shopifyOrder.customer.tags;

    if(customerIds != null && customerIds.hasOwnProperty(currentStore.shop) && customerIds[currentStore.shop].includes(shopifyOrder.customer.id)) {
        return {
            status: true,
            message: 'Found in customer ids array'
        };
    }

    customerTags = typeof(customerTags) == 'string' ? customerTags.split(',') : customerTags;
    if(customerTags != null && customerTags.length > 0) {
        var paymentMethodOptions = shopMetafields.PaymentMethodOptions;
        var stringToLookFor = 'PortalSphere_'+shopMetafields.storeType;
        for(var i in customerTags) {
            if(customerTags[i].startsWith(stringToLookFor)) {
                var paymentMethodOption = paymentMethodOptions.find((node: any) => node.hasOwnProperty('tag') && node.tag === customerTags[i]);
                if(paymentMethodOption) {
                    returnVal = {
                        status: paymentMethodOption.hasOwnProperty('selectedPayments') && paymentMethodOption.selectedPayments.includes('NetTerms'),
                        message: 'Checked with payment method options'
                    }
                    break;
                }
            } 
        }
    }

    return returnVal;
}