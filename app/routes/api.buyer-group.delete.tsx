import { json, type LoaderFunctionArgs } from "@remix-run/node";
import { handleCors } from "~/utils/cors.server";
import prisma from "~/db.server";
import { authenticate } from "~/shopify.server";
import { deleteCollectionMetafield, deleteSegment, deleteShopDiscountMetafield, deleteVariantMetafield, removeCustomerTags } from "~/services/CustomerGroups.server";
import { ensureGidFormat } from "~/services/ProductVolumePriceConfig.server";
import { getShopId } from "~/services/Settings.server";

export async function loader({ request }: LoaderFunctionArgs) {
    const corsResponse = handleCors(request);

    if (corsResponse instanceof Response) {
        return corsResponse;
    }

    if (request.method === "OPTIONS") {
        return new Response(null, { headers: corsResponse });
    }

    let returnVal = null;
    const { admin, session } = await authenticate.admin(request);
    const { shop } = session;
    const dbRecord = await prisma.session.findFirst({where: { shop: shop }});
    const shopId = await getShopId(admin, shop);
    
    try {
        const url = new URL(request.url);
        const segmentId = url.searchParams.get('segmentId') || null;

        if(!segmentId) {
            throw new Error('Invalid segmentId value.');
        }

        const segmentRecord = await prisma.shopSegmentsData.findFirst({
        where: {
            shop: shop,
            segmentId: segmentId
            }
        });

        if(segmentRecord) {
            await prisma.shopSegmentsBuyers.deleteMany({ where: { segmentId: segmentRecord.id } });
            await prisma.shopSegmentCollections.deleteMany({ where: { segmentId: segmentRecord.id } });
            await prisma.shopSegmentVariants.deleteMany({ where: { segmentId: segmentRecord.id } });
            await prisma.shopSegmentsData.delete({ where: {id: segmentRecord.id} });
            await prisma.volumePricingData.deleteMany({ where: { shop: shop, tag: segmentRecord.tagID } });
        }
        
        if(!segmentRecord) {
            throw new Error('record not found');
        }

        if(!segmentRecord.tagID) {
            throw new Error('tag id not found!');
        }

        if(!segmentRecord.defaultDiscount) {
            throw new Error('default discount not found');
        }

        if(!segmentRecord.paymentMethods) {
            throw new Error('payment methods not found');
        }

        if(!segmentRecord || !segmentRecord.tagID || !segmentRecord.defaultDiscount || !segmentRecord.paymentMethods) 
            throw new Error('something is empty');
        
        if(!dbRecord) 
            throw new Error('data record not found');

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
        
        returnVal = {
            status: true,
            message: 'Segment deleted successfully!'
        };

    } catch(err: any) {
        console.error(err.message);
        returnVal = {status: false, message: 'error in delete buyer groups api', error: err.message, data: null};
    }

    return json( returnVal );
}

// Add action for handling non-GET requests
export async function action({ request }: LoaderFunctionArgs) {
    const corsResponse = handleCors(request);
    
    if (corsResponse instanceof Response) {
        return corsResponse;
    }

    if (request.method === "OPTIONS") {
        return new Response(null, { 
            headers: corsResponse 
        });
    }

    return json({ 
      error: "Method not allowed" 
    }, { 
      status: 405,
      headers: corsResponse
    });
}