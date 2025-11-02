import { addComplementaryProduct, deleteComplementaryProduct, updateComplementaryProductTitle } from '~/services/ComplementaryProducts.server';
import prisma from '../db.server';
import { getAdminClient, getOrderForStore, saveGraphQLOrderDetailsInDB, sendSlackNotification, updateProductInDBFromWebhook } from '~/services/CustomFunctions.server';    
import { removeWholesaleBuyerByEmail } from '~/services/WholesaleBuyers.server';
import { processAddCustomerToGroup } from '~/services/Customers.server';

export const processWebhooks = async (): Promise<boolean> => {

    //First delete the true status columns to keep the table light
    await prisma.webhookJobs.deleteMany({
        where: {status: true}
    });

    const rows = await prisma.webhookJobs.findMany({
        where: { status: false },
        take: 20 //Keep a lower number here so graphql api limits don't hit limits
    });

    if(!rows) {
        return false;
    }

    let idArray = new Array();
    let detailsArr = new Array();
    let errorIds = new Array();

    for(var i in rows) {
        var currentRow = rows[i];
        if(currentRow.shop && currentRow.body) {
            var dbShop = await prisma.session.findFirst({ where: { shop: currentRow.shop } });
            if(dbShop) {
                const admin = await getAdminClient(dbShop);
                const payload = JSON.parse(currentRow.body);

                switch (currentRow.topic) {
                    case "ORDERS_CREATE":
                        if(payload && payload.hasOwnProperty('id')) {
                            const order = await getOrderForStore(dbShop, admin, payload.admin_graphql_api_id);
                            if(order) {
                                await saveGraphQLOrderDetailsInDB(dbShop, order);
                                console.log(`Order ${payload.id} saved in DB! Store - ${dbShop.shop}`);
                            }
                        }
                        break;

                    case "ORDERS_UPDATED":
                        if(payload && payload.hasOwnProperty('id')) {
                            const order = await getOrderForStore(dbShop, admin, payload.admin_graphql_api_id);
                            if(order) {
                                await saveGraphQLOrderDetailsInDB(dbShop, order);
                                console.log(`Order ${payload.id} updated in DB! Store - ${dbShop.shop}`);
                            }
                        }
                        break;
                    
                    case "PRODUCTS_CREATE":
                        if (payload && payload.hasOwnProperty('variant_gids') && payload.variant_gids && Array.isArray(payload.variant_gids)) {
                            try {
                                await updateProductInDBFromWebhook(admin, dbShop, payload);
                            } catch (error: any) {
                                console.log('error in updating product from webhook', error.message);
                            }
                            for (const variant of payload.variants) {
                                try {
                                    await addComplementaryProduct(admin, dbShop, variant);
                                } catch (error: any) {
                                    errorIds.push(currentRow.id);
                                    detailsArr.push({
                                        id: currentRow.id,
                                        gid: variant.admin_graphql_api_id, 
                                        dbShop: dbShop.shop, 
                                        topic: 'PRODUCTS_CREATE', 
                                        message: error.message
                                    });
                                }
                            }
                        } 
                        break;
                    
                    case "PRODUCTS_UPDATE":
                        if (payload && payload.hasOwnProperty('variant_gids') && payload.variant_gids && Array.isArray(payload.variant_gids)) {
                            try {
                                await updateProductInDBFromWebhook(admin, dbShop, payload);                            
                            } catch (error: any) {
                                console.log('error in updating product', error.message);
                            }
                            for (const variant of payload.variants) {
                                try {
                                    await updateComplementaryProductTitle(admin, dbShop, variant);
                                } catch (error: any) {
                                    errorIds.push(currentRow.id);
                                    detailsArr.push({id: currentRow.id, topic: 'PRODUCTS_UPDATE', message: error.message});
                                }
                            }
                        }
                        break;
                    
                    case "PRODUCTS_DELETE":
                        if (payload && payload.hasOwnProperty('variant_gids') && payload.variant_gids && Array.isArray(payload.variant_gids)) {
                            for (const variant of payload.variants) {
                                try {
                                    await deleteComplementaryProduct(admin, dbShop, variant.admin_graphql_api_id);
                                } catch (error: any) {
                                    errorIds.push(currentRow.id);
                                    detailsArr.push({id: currentRow.id, topic: 'PRODUCTS_DELETE', message: error.message});
                                }
                            }
                        } 
                        break;

                    case "CUSTOMERS_REDACT":
                        try {
                            await removeWholesaleBuyerByEmail(payload.shop_domain, payload.customer.email);
                        } catch (error: any) {
                            errorIds.push(currentRow.id);
                            detailsArr.push({id: currentRow.id, topic: 'CUSTOMERS_REDACT', message: error.message});
                        }
                        break;

                    case "CUSTOMERS_CREATE":
                        try {
                            await processAddCustomerToGroup(payload, dbShop.shop, admin);
                        } catch (error: any) {
                            errorIds.push(currentRow.id);
                            detailsArr.push({id: currentRow.id, topic: 'CUSTOMERS_CREATE', message: error.message});
                        }
                        break;

                    case "CUSTOMERS_UPDATE":
                        try {
                            var result = await processAddCustomerToGroup(payload, dbShop.shop, admin, "update");
                            console.log('[Customers update]', result);    
                        } catch (error: any) {
                            errorIds.push(currentRow.id);
                            detailsArr.push({id: currentRow.id, topic: 'CUSTOMERS_UPDATE', message: error.message});
                        }
                        break;

                    case "APP_UNINSTALLED":
                        try {
                            await sendSlackNotification(`Shop ${dbShop.shop} uninstalled the app!`);    
                        } catch (error: any) {
                            errorIds.push(currentRow.id);
                            detailsArr.push({id: currentRow.id, topic: 'APP_UNINSTALLED', message: error.message});
                        }
                        break;

                    default:
                        console.log("Unhandled webhook topic "+currentRow.topic, { status: 404 });

                    /*
                    case "CUSTOMERS_DATA_REQUEST":
                        console.log("Customer data requested:", payload);
                        break;

                    case "SHOP_REDACT":
                        console.log("Shop data redacted:", payload);
                        // await deleteAllComplementaryProducts(payload.shop_id)
                        // await removeTopProductsList(admin);
                        // await removeAllWholesaleBuyers(payload.shop_domain);
                        break;
                    
                    case "ORDERS_PAID":
                        console.log("Order paid:", payload);
                        try {
                            await createPaidOrder({
                            id: payload.id.toString(),
                            orderNumber: payload.order_number.toString(),
                            shop: shop,
                            orderTotal: parseFloat(payload.total_price),
                            createdAt: new Date(payload.processed_at),
                            transactionMonth: new Date(payload.processed_at).getMonth() + 1,
                            transactionYear: new Date(payload.processed_at).getFullYear()
                            });
                            console.log(`Successfully recorded paid order: ${payload.order_number}`);
                        } catch (error) {
                            console.error(`Error recording paid order ${payload.order_number}:`, error);
                        }
                        break;

                    case "APP_SUBSCRIPTIONS_UPDATE":
                        if (payload.plan && Object.hasOwn(payload.plan, "name") && payload.plan.name === PORTALSPHERE_SUBSCRIPTION && (payload.status === 'EXPIRED' || payload.status === 'CANCELLED' || payload.status === 'DECLINED')) {
                            try {
                                await setSubscriptionStatusMetafield(request, "UNSUBSCRIBED");
                                await disableAllFeatures(shopId, admin);
                                console.log(`Features disabled due to subscription status: ${payload.status} for shop: ${shop}`);
                            } catch (error) {
                                console.error("Error updating subscription settings:", error);
                            }
                        } else if (payload.plan && Object.hasOwn(payload.plan, "name") && payload.plan.name === PORTALSPHERE_SUBSCRIPTION && payload.status === 'ACTIVE') {
                            await setSubscriptionStatusMetafield(request, "ACTIVE");
                            console.log(`Features enabled due to subscription status: ${payload.status} for shop: ${shop}`);
                        }
                        break;
                    */
                } 
            }
        }

        idArray.push(currentRow.id);
    }

    if(errorIds.length > 0) {

        const failedIdsMessage = `These webhooks failed to process in queue: ${errorIds.join(', ')}`;
        const detailedMessage = `Details: ${JSON.stringify(detailsArr)}`;

        console.log(failedIdsMessage);
        console.log(detailedMessage);

        await sendSlackNotification(failedIdsMessage);
        await sendSlackNotification(detailedMessage);
        await prisma.webhookJobs.updateMany({
            data: { status: true },
            where: {
                id: {
                    in: errorIds
                }
            }
        });
    }

    if(idArray.length > 0) {
        await prisma.webhookJobs.deleteMany({
            where: {
                id: {
                    in: idArray
                }
            }
        });
    }

    return true;
}