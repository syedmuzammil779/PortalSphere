import { json } from "@remix-run/node";
import type { LoaderFunctionArgs } from "@remix-run/node";
import { handleCors } from "~/utils/cors.server";
import prisma from "~/db.server";
import { authenticate } from "~/shopify.server";
import { AdminApiContext } from "@shopify/shopify-app-remix/server";
import { appCache } from "~/utils/cache.server";
import { B2B_PLUS_NAMESPACE, setShopVolumeDiscountMetafield, setShopPaymentMethodsMetafield, setShopQuantityConfigMetafield, setVariantInclusionMetafield, setVariantMetafield, VOLUME_DISCOUNTS_KEY, setCollectionMetafieldForProduct, setCollectionInclusionMetafieldForProduct, getProductIdsInCollection } from "~/services/CustomerGroups.server";
import { groupConfigQuery } from "./app.customergroups";
import { getShopId } from "~/services/Settings.server";
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
        
    const dbId = 20;
    const segmentRecord = await prisma.shopSegmentsData.findFirst({
        where: {
            shop: shop,
            segmentName: 'Product with Collections'
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
    
    if(segmentRecord.storeDiscounts) {
        var storeDiscounts = typeof(segmentRecord.storeDiscounts) == 'string' ? JSON.parse(segmentRecord.storeDiscounts) : segmentRecord.storeDiscounts;
        var parsedSelectedPayments = segmentRecord.paymentMethods.split(', ');
        await setShopVolumeDiscountMetafield(admin, shopId, segmentRecord.tagID, segmentRecord.defaultDiscount.toString());
        await setShopPaymentMethodsMetafield(admin, shopId, segmentRecord.tagID, parsedSelectedPayments),
        await setShopQuantityConfigMetafield(admin, shopId, segmentRecord.tagID, {
            increment: storeDiscounts.volumeConfig.increments,
            maximum: storeDiscounts.volumeConfig.maximum,
            minimum: storeDiscounts.volumeConfig.minimum,
            breakdowns: storeDiscounts.priceConfig
        })
    }

    if(segmentRecord.productDiscounts) {
        var productDiscounts = typeof(segmentRecord.productDiscounts) == 'string' ? JSON.parse(segmentRecord.productDiscounts) : segmentRecord.productDiscounts;
        if(productDiscounts != null && productDiscounts.length > 0) {
            for(var i in productDiscounts) { 
                await setVariantMetafield(admin, productDiscounts[i].id, segmentRecord.tagID, {
                    volumeConfig: productDiscounts[i].volumeConfig,
                    priceConfig: productDiscounts[i].priceConfig,
                    type: productDiscounts[i].discount_type
                });
                await setVariantInclusionMetafield(admin, productDiscounts[i].id, segmentRecord.tagID)
            }
        }
    }

    //The logic here is that for every collection id passed in here,
    //We're gonna find out what products belong in each one of these collections.
    //For all those products we're gonna set a `product-level` metafield because
    //in Shopify Discount functions you can't read collections directly without knowing
    //what collection ids the product already belongs in
    if(segmentRecord.collectionDiscounts) {
        var collectionDiscounts = typeof(segmentRecord.collectionDiscounts) == 'string' ? JSON.parse(segmentRecord.collectionDiscounts) : segmentRecord.collectionDiscounts;
        if(collectionDiscounts && collectionDiscounts.length > 0) {
            for(var i in collectionDiscounts) {
                var collectionId = collectionDiscounts[i].id.split('gid://shopify/Collection/');
                collectionId = collectionId[1];
                collectionId = ensureGidFormat(collectionId, 'Collection');
                
                var productIdsInCollection = await getProductIdsInCollection(admin, collectionId);
                if(productIdsInCollection && productIdsInCollection.length > 0) {
                    for(var j in productIdsInCollection) {
                        var currentId = ensureGidFormat(productIdsInCollection[j], 'Product');
                        await setCollectionMetafieldForProduct(admin, currentId, segmentRecord.tagID, {
                            volumeConfig: collectionDiscounts[i].volumeConfig,
                            priceConfig: collectionDiscounts[i].priceConfig,
                            type: collectionDiscounts[i].discount_type,
                            discountValue: collectionDiscounts[i].discountValue
                        });
                        await setCollectionInclusionMetafieldForProduct(admin, currentId, segmentRecord.tagID)
                    }

                    var dbCollectionId = collectionId.replace('gid://shopify/Collection/', '')
                    await prisma.shopSegmentCollections.upsert({
                        where: {
                            segmentId_collectionId: {
                                segmentId: segmentRecord.id,
                                collectionId: dbCollectionId
                            }
                        },
                        create: {
                            segmentId: segmentRecord.id,
                            collectionId: dbCollectionId,
                            priceConfig: collectionDiscounts[i].priceConfig,
                            volumeConfig: collectionDiscounts[i].volumeConfig,
                            discount_type: collectionDiscounts[i].discount_type,
                            included: true
                        },
                        update: {
                            priceConfig: collectionDiscounts[i].priceConfig,
                            volumeConfig: collectionDiscounts[i].volumeConfig,
                            discount_type: collectionDiscounts[i].discount_type,
                            included: true
                        }
                    })
                } 
            }
        }
    }

    var queryAfterAll = `
        query {
            products(first:250) {
                edges {
                    node {
                        id
                        metafields(first:250) {
                            edges {
                                node {
                                    id
                                    key
                                    jsonValue
                                }
                            }
                        }
                    }
                }
            }
        }
    `;

    var afterAllResp = await admin.graphql(queryAfterAll);
    if(afterAllResp.ok) {
        var afterAllRespBody = await afterAllResp.json();
        metafieldsReturnArray = afterAllRespBody.data.products;
    }
 
    return json({meta: metafieldsReturnArray});
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