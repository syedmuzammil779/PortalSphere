import prisma from "~/db.server";
import { 
    checkStoreInstallation, getActiveSubscriptionForStore, 
    getAdminClient, 
    sendSlackNotification, verifyActiveSubscription 
} from "~/services/CustomFunctions.server";
import { getQueryObjectForStore, getVariantsForThisProduct, syncProductsInDB } from "~/services/ShopifyProductsFunctions.server";
import { appCache } from "~/utils/cache.server";

export const syncProductsData = async (): Promise<boolean> => {
    
    const stores = await prisma.session.findMany();

    if(!stores) {
        return false;
    }

    for await(var store of stores) {
    
        const checkInstall = await checkStoreInstallation(store);
        if(!checkInstall) {
            continue;
        }

        var activeSub = await getActiveSubscriptionForStore(store);
        if(!activeSub) {
            continue;
        }

        var currentSubscriptionId = await verifyActiveSubscription(store, activeSub);
        if(!currentSubscriptionId) {
            continue;
        }

        const admin = await getAdminClient(store);

        const lastProductCursor = `ProductSync:${store.shop}`;
        const MAX_LIMIT = 100;
        
        let customerGroups = await prisma.shopSegmentsData.findMany({ where: { shop: store.shop }});
        
        let formattedCustomerGroups = {};
        if(customerGroups != null && customerGroups.length > 0) {
            for(var k in customerGroups) {
                if(customerGroups[k] != null && customerGroups[k].hasOwnProperty('tagID') && customerGroups[k].tagID) {
                    formattedCustomerGroups[customerGroups[k].tagID] = customerGroups[k];
                }
            }
        }
            
        try {
            var cursor:string|null = appCache.has(lastProductCursor) ? appCache.get(lastProductCursor) as string : null;
            var returnVal = new Array();
            var limit = 250;
            var hasNextPage;
            do {
                var queryObject = getQueryObjectForStore(cursor, limit);
                var query = `query {
                    products(${queryObject}) {
                        edges {
                            node {
                                id title handle     
                                productType status     
                                tags totalInventory tracksInventory
                                variantsCount { count } vendor     
                            }
                            cursor
                        }
                        pageInfo { hasNextPage }
                    }
                }`;

                const respBody = await admin.request(query);
                
                if (respBody && respBody.hasOwnProperty("data") && respBody.data.hasOwnProperty("products")) {
                    var products = respBody.data.products;
                    if (products && products.hasOwnProperty("edges") && products.edges.length > 0) {
                        for (var i in products.edges) {
                            var node = products.edges[i].node;
                            node.variants = await getVariantsForThisProduct(admin, node.id);
                            returnVal.push(node);

                            cursor = products.edges[i].cursor;
                            appCache.set(lastProductCursor, cursor, 120);
                        }

                        hasNextPage = respBody.data.products.pageInfo.hasNextPage;
                    } else {
                        appCache.del(lastProductCursor);
                        cursor = null;
                        hasNextPage = false;
                    }
                }
                
            } while (cursor != null && hasNextPage == true && returnVal.length < MAX_LIMIT);
            
            await syncProductsInDB(returnVal, store, formattedCustomerGroups); 

            return true;
        }catch(err: any) {
            await sendSlackNotification(`Error in shopify store ${store.shop} product sync data ${err.message}`);
        }
    } 

    return true;
}