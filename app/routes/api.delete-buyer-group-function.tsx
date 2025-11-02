import { json } from "@remix-run/node";
import type { LoaderFunctionArgs } from "@remix-run/node";
import { handleCors } from "~/utils/cors.server";
import prisma from "~/db.server";
import { authenticate } from "~/shopify.server";
import {  deleteCollectionMetafield, deleteSegment, deleteShopDiscountMetafield, deleteVariantMetafield, getCustomersByTag, getProductIdsInCollection, removeCustomerTags, removeTagFromCustomer, VOLUME_DISCOUNTS_KEY } from "~/services/CustomerGroups.server";
import { getSettings, getShopId } from "~/services/Settings.server";
import { ensureGidFormat } from "~/services/ProductVolumePriceConfig.server";

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
    const dbRecord = await prisma.session.findFirst({where: { shop: shop }});
    const shopId = await getShopId(admin, shop);
        
    const dbId = 4;
    const segmentRecord = await prisma.shopSegmentsData.findFirst({
        where: {
            shop: shop,
            id: dbId
        }
    });

    if(!segmentRecord) {
        return json({data: 'record not found', where: {
            shop: shop,
            id: dbId
        }});
    }

    if(!segmentRecord.tagID) {
        return json({data: 'tag id not found!'});
    }

    if(!segmentRecord.defaultDiscount) {
        return json({data: 'default discount not found'});
    }

    if(!segmentRecord.paymentMethods) {
        return json({data: 'payment methods not found'});
    }

    if(!segmentRecord || !segmentRecord.tagID || !segmentRecord.defaultDiscount || !segmentRecord.paymentMethods) return json({data: 'something is empty'});
    if(!dbRecord) return json({data: 'data record not found'});

    let metafieldsReturnArray = {};

    if(segmentRecord.productDiscounts) {
        var productDiscounts = typeof(segmentRecord.productDiscounts) == 'string' ? JSON.parse(segmentRecord.productDiscounts) : segmentRecord.productDiscounts;
        for(var i in productDiscounts) {
            var currentProductDiscount = productDiscounts[i];
            await deleteVariantMetafield(admin, currentProductDiscount.id, segmentRecord.tagID);
        }
    }

    if(segmentRecord.collectionDiscounts) {
        var collectionDiscounts = typeof(segmentRecord.collectionDiscounts) == 'string' ? JSON.parse(segmentRecord.collectionDiscounts) : segmentRecord.collectionDiscounts;
        for(var j in collectionDiscounts) {
            var currentCollection = collectionDiscounts[j];
            var collectionId = currentCollection.id;
            collectionId = collectionId.split('gid://shopify/Collection/');
            collectionId = ensureGidFormat(collectionId[1], 'Collection');

            await deleteCollectionMetafield(admin, collectionId, segmentRecord.tagID);
        }
    }

    await deleteShopDiscountMetafield(admin, shopId, segmentRecord.tagID);
    //remove customer tags
    await removeCustomerTags(admin, segmentRecord.tagID);
    //remove segment
    await deleteSegment(admin, segmentRecord.segmentId);

    await prisma.shopSegmentsBuyers.deleteMany({ where: { segmentId: segmentRecord.id } });
    await prisma.shopSegmentCollections.deleteMany({ where: { segmentId: segmentRecord.id } });
    await prisma.shopSegmentVariants.deleteMany({ where: { segmentId: segmentRecord.id } });
    await prisma.shopSegmentsData.delete({ where: {id: segmentRecord.id} });
    await prisma.volumePricingData.deleteMany({ where: { shop: shop, tag: segmentRecord.tagID } });
                    
    return json({data: metafieldsReturnArray});
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