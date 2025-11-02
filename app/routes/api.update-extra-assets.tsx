import { json } from "@remix-run/node";
import type { LoaderFunctionArgs } from "@remix-run/node";
import { handleCors } from "~/utils/cors.server";
import prisma from "~/db.server";
import { authenticate } from "~/shopify.server";
import { defaultExtraAssets, setThemeMetafieldForStore } from "~/services/ThemeFunctions.server";
import { checkStoreInstallation, getActiveSubscriptionForStore, getAdminClient, verifyActiveSubscription } from "~/services/CustomFunctions.server";

export async function loader({ request }: LoaderFunctionArgs) {
    const corsResponse = handleCors(request);

    if (corsResponse instanceof Response) {
      return corsResponse;
    }

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsResponse });
    }

    const {admin, session} = await authenticate.admin(request);
    const { shop } = session;
    
    const storeAssets = await prisma.shopThemeAssets.findMany();
    for(var i in storeAssets) {
      const currentStoreAsset = storeAssets[i];
      const extraAssets = defaultExtraAssets();
      await prisma.shopThemeAssets.update({
        where: {id: currentStoreAsset.id},
        data: {extraAssets: extraAssets}
      });

      const shopRecord = await prisma.session.findFirst({ where: { shop: currentStoreAsset.shop }});
      if(shopRecord) {
        const checkInstall = await checkStoreInstallation(shopRecord);
        if(!checkInstall) {
          continue;
        }

        var activeSub = await getActiveSubscriptionForStore(shopRecord);
        if(!activeSub) {
          continue;
        }

        var currentSubscriptionId = await verifyActiveSubscription(shopRecord, activeSub);
        if(!currentSubscriptionId) {
          continue;
        }
        const adminClient = await getAdminClient(shopRecord);
        setTimeout(async() => { await setThemeMetafieldForStore(shopRecord, adminClient); }, 10);
      }
    }    
    
    return json({data: 'ok'});
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