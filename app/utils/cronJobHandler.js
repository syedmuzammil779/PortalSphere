import cron from 'node-cron';
import { checkStoreUsageBilling } from '../crons/checkStoreUsageBilling';
//import { updateDraftOrderWithDiscount } from '~/crons/updateDraftOrderWithDiscount'; 
//import { dailyStoreUsageBilling } from '~/crons/dailyStoreUsageBilling';
//import { initializeApp } from '~/crons/initializeApp';
import { updateNetTermsOrderToDraftOrder } from '~/crons/updateNetTermsOrderToDraftOrder';
import { createOrUpdateWebhooks } from '~/crons/createOrUpdateWebhooks';
import { calculateDashboardMetrics } from '~/crons/calculateDashboardMetrics';
import { processWebhooks } from '~/crons/processWebhooks';
import { updateShopPricingConfig } from '~/crons/updateShopPricingConfig';
import { createSegment } from '~/crons/createSegment';
import { syncProductsData } from '~/crons/syncProductsData';
import { syncOrders } from '~/crons/syncOrders';

const checkInterval = process.env.BILLING_CHECK_INTERVAL || '0 */6 * * *'; //Converted to 6 hours instead of 2
//const draftOrdersInterval = '0 */1 * * * *';
//const dailyUsageInterval = '0 0 */12 * * *'; //Updated to every 12 hours
const netTermsToDraftOrderCron = '0 */1 * * *';
const updateOrCreateWebhooksCron = process.env.NODE_ENV == 'production' ? '0 */2 * * *' : '0 */1 * * *'; //2 hours for production and 1 hour for local
const dashboardMetricsCron = '*/55 * * * *'; //55 minutes
const webhooksInterval = '*/30 * * * * *';
const csvMetafieldProcessInterval = '*/30 * * * * *';
const segmentInterval = '*/30 * * * * *'; //Changed to 30 seconds
const productSyncInterval = process.env.NODE_ENV == 'production' ? '0 */6 * * *' : '*/60 * * * * *'; //PROD - 6 hours, local - 1 min
const ordersSyncInterval = process.env.NODE_ENV == 'production' ? '0 */2 * * *' : '*/60 * * * * *'; //PROD - 2 hours, local - 1 min

export function startCronJob() {

  cron.schedule(segmentInterval, async () => {
    try {
      await createSegment();
    } catch (error) {
      console.error('Error executing create segments cron job:', error);
    }
  })

  cron.schedule(webhooksInterval, async () => {
    try {
      await processWebhooks();
    } catch (error) {
      console.error('Error executing cron job:', error);
    }
  })

  cron.schedule(netTermsToDraftOrderCron, async() => {
    try {
      await updateNetTermsOrderToDraftOrder();
    } catch (error) {
      console.error('Error executing cron job:', error);
    }
  });

  cron.schedule(dashboardMetricsCron, async() => {
    try {
      await calculateDashboardMetrics();
    } catch (error) {
      console.error('Error executing cron job:', error);
    }
  })

  cron.schedule(updateOrCreateWebhooksCron, async () => {
    try{
      await createOrUpdateWebhooks();
      //await initializeApp(); //Not used anymore
    } catch(error) {
      console.error('Error executing webhook update or create cron job:', error);
    }
  })
 
  cron.schedule(checkInterval, async () => {
    try {
      await checkStoreUsageBilling();
    } catch (error) {
      console.error('Error executing cron job:', error);
    }
  });

  cron.schedule(csvMetafieldProcessInterval, async () => {
    try {
      await updateShopPricingConfig();
    } catch (error) {
      console.error('Error executing daily cron job:', error);
    }
  });

  cron.schedule(productSyncInterval, async () => {
    try {
      await syncProductsData();
    } catch (error) {
      console.error('Error executing daily cron job:', error);
    }
  });

  cron.schedule(ordersSyncInterval, async () => {
    try {
      await syncOrders();
    } catch (error) {
      console.error('Error executing daily cron job:', error);
    }
  });
}
