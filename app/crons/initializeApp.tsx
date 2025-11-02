import prisma from "~/db.server";
//import { B2B_PLUS_NAMESPACE } from "~/services/CustomerGroups.server";
import { 
    checkStoreInstallation, getActiveSubscriptionForStore, initializeComplementaryProducts, 
    initializeSettings, initializeTopProducts, isAppSettingsInitialized, isComplementaryProductsInitialized, 
    isTopProductsInitialized, sendSlackNotification, verifyActiveSubscription 
} from "~/services/CustomFunctions.server";

export const initializeApp = async (): Promise<boolean> => {
    const parentAppSettings = await prisma.parentAppSettings.findFirst();
    
    if(!parentAppSettings) {
        return false;
    }

    //Get stores that do NOT have these values. Only they will be updated like this once.
    //If you wish to re-run this logic later
    const stores = await prisma.session.findMany({
        where: {
            appUrl: parentAppSettings.appUrl
        }
    });

    if(!stores) {
        return false;
    }

    for await(var store of stores) {
        try {
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

            const appSettingsInitialized = await isAppSettingsInitialized(store);
            //const topProductsInitialized = await isTopProductsInitialized(store);
            const complementaryProducts  = await isComplementaryProductsInitialized(store);
            
            var initializedSettingsResult = true;
            if (!appSettingsInitialized) {
                initializedSettingsResult = await initializeSettings(store);
            }

            var topProductsInitializedResult = true;
            if (!store.topProductsFlag) {
                topProductsInitializedResult = await initializeTopProducts(store);
            }

            var complementaryProductsResult = true;
            if (!complementaryProducts) {
                complementaryProductsResult = await initializeComplementaryProducts(store);
            } 

            await prisma.session.update({ 
                where: { id: store.id }, 
                data: { 
                    appUrl: parentAppSettings.appUrl, 
                    topProductsFlag: true 
                } 
            });
            
            var debugMessage = {
                initializedSettingsResult: initializedSettingsResult,
                topProductsInitializedResult: topProductsInitializedResult,
                complementaryProductsResult: complementaryProductsResult
            }

            if(!(initializedSettingsResult && topProductsInitializedResult && complementaryProductsResult)) {
                await sendSlackNotification(`Initialize error for shop ${store.shop} - ${JSON.stringify(debugMessage)}`)
            }    
        } catch (error: any) {
            await sendSlackNotification(`Error caught for shop in initialize cron ${store.shop} - ${error.message}`);
        }
    }
    
    return true;
};

