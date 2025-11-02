import prisma from "~/db.server";
import { DiscountCreator, PaymentFunctionCreator } from "~/services/AutomaticDiscountApp.server";
//import { setThemeMetafieldForStore } from "~/services/ThemeFunctions.server";
import { 
  checkStoreInstallation, getActiveSubscriptionForStore, 
  getAdminClient, getShopIdCustom, verifyActiveSubscription 
} from "~/services/CustomFunctions.server";

import { 
  getCustomerCountForStore, getComplementaryProductsCounts, getUpsellTopProductsEnabled, 
  getUpsellComplementaryProductsEnabled, getOnlineStoreSetupStatus, getStoreType,
  //getCustomerSegmentsForStore, getCustomerGroupMemberCount, hasCustomerGroupIncludedProducts,
} from "~/services/DashboardFunctions.server";

export const calculateDashboardMetrics = async (): Promise<boolean> => {
  const stores = await prisma.session.findMany({
    distinct: ["shop"],
  });

  if (!stores) {
    return false;
  }


  for(var store of stores) {
    try {
      console.log('Setting dashboard metrics for store '+store.shop);

      const checkInstall = await checkStoreInstallation(store);
      if (!checkInstall) {
        continue;
      }

      var activeSub = await getActiveSubscriptionForStore(store);
      if (!activeSub) {
        continue;
      }

      var currentSubscriptionId = await verifyActiveSubscription(
        store,
        activeSub,
      );
      if (!currentSubscriptionId) {
        continue;
      }

      const shop = store.shop;
      const shopId = await getShopIdCustom(store);
      const admin = await getAdminClient(store);

      const dashboardMetricsRowCount = await prisma.dashboardMetrics.count({
        where: { shop: shop },
      });

      if (dashboardMetricsRowCount <= 0) {
        await prisma.dashboardMetrics.create({
          data: { shop: shop },
        });
      }

      const dbDashboardMetricsRow = await prisma.dashboardMetrics.findFirst({
        where: { shop: shop },
      });

      //The reason `null` is getting passed in these function calls is because
      //In the background cron processes, you can't create a AdminApiContext object.
      //And every function is getting sent a takeDatabaseValue = false
      //because when the background cron is running, i don't want the existing database values
      //I need fresh calculation

      await DiscountCreator.checkAndCreateDiscount(null, "Product", store);
      await PaymentFunctionCreator.createPaymentFunction(admin);
      
      await getCustomerCountForStore(null, store, dbDashboardMetricsRow, false);
      await getComplementaryProductsCounts(
        null,
        shopId,
        store,
        dbDashboardMetricsRow,
        false,
      );

      /*
      let customerGroups = await getCustomerSegmentsForStore(null, store, false);
      if(customerGroups.length > 0) {
        for(let i = 0; i < customerGroups.length; i++) { 
          await getCustomerGroupMemberCount(null, store, customerGroups[i], false);
          const groupQuery: string[] = customerGroups[i].query.split(" ");
          let groupTag = groupQuery[groupQuery.length-1];
          groupTag = groupTag.replace(/^'|'$/g, '');
          await hasCustomerGroupIncludedProducts(null, store, customerGroups[i], groupTag, false);
        };
      }
      */

      const storeType = await getStoreType(
        null,
        store,
        dbDashboardMetricsRow,
        false,
      );

      if (storeType && storeType === "Hybrid") {
        await Promise.all([
          DiscountCreator.checkAndCreateDiscount(null, "Shipping", store),
          DiscountCreator.checkAndCreateShippingDiscountConfig(
            null,
            shopId,
            store,
          ),
        ]);
      }

      await getOnlineStoreSetupStatus(
        null,
        store,
        dbDashboardMetricsRow,
        false,
      );
      await getUpsellTopProductsEnabled(
        null,
        store,
        dbDashboardMetricsRow,
        false,
      );
      await getUpsellComplementaryProductsEnabled(
        null,
        store,
        dbDashboardMetricsRow,
        false,
      );

      //await setThemeMetafieldForStore(store, admin); //This will be activated later
    } catch (error: any) {
      console.log("Dashboard metrics error for store " + store.shop);
      console.log(error.message);
      console.trace(error);
    }
  }

  return true;
};
