import type { ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import prisma from "~/db.server";
import { webHookTopics } from "~/services/CustomFunctions.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { topic, shop, admin, payload } = await authenticate.webhook(request);
  if (!admin) {
    // The admin context isn't returned if the webhook fired after a shop was uninstalled.
    throw new Response();
  }

  //Get the webhook Id so we have a unique identifier
  const webhookId = request.headers.get('x-shopify-webhook-id');

  setTimeout(async () => {
    if(webhookId != null) {
      if(webHookTopics.includes(topic)) {
        await prisma.webhookJobs.upsert({
          where: {
            shop_webhookId: {
              shop: shop,
              webhookId: webhookId
            }
          },
          update: {
            body: JSON.stringify(payload)
          },
          create: {
            shop: shop,
            webhookId: webhookId,
            topic: topic,
            body: JSON.stringify(payload)
          } 
        })
      }
    }
  }, 500);
  
  throw new Response();
};
