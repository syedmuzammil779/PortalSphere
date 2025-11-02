import { Session } from "@prisma/client";
import moment from "moment";
import prisma from "~/db.server";
import { checkStoreInstallation, getAdminClient, getOrdersForStore, saveGraphQLOrderDetailsInDB, sendSlackNotification } from "~/services/CustomFunctions.server";

export const syncOrders = async (): Promise<boolean> => {

    const stores = await prisma.session.findMany();

    if(!stores) {
        return false;
    }

    for (var store of stores) {
        var checkInstallation = await checkStoreInstallation(store);
        if(!checkInstallation) {
            continue;
        }

        const admin = await getAdminClient(store);
        var orders = await getOrdersForStore(store, admin, {val: 3, type: 'months', status: 'any'});
        if(orders != null && orders.length > 0) {
            for(var i in orders) {
                var currentOrder = orders[i];
                await saveGraphQLOrderDetailsInDB(store, currentOrder);
            }
        }    
    }

    return true;
}
