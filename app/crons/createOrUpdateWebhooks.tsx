import prisma from "~/db.server";
import { checkStoreInstallation, checkWebhooksURLMatch, registerWebhooksForStore, removeWebhooksForStore } from "~/services/CustomFunctions.server";

export const createOrUpdateWebhooks = async (): Promise<boolean> => {
    
    const stores = await prisma.session.findMany();

    if(!stores) {
        return false;
    }

    for await(var store of stores) {

        var checkInstallation = await checkStoreInstallation(store);
        if(!checkInstallation) {
            continue;
        }

        const checkWebhookValid = await checkWebhooksURLMatch(store);
        if(!checkWebhookValid) {
            await removeWebhooksForStore(store);
            await registerWebhooksForStore(store);
        } 
    }
    
    return true;
};

