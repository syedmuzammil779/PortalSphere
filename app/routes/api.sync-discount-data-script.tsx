import { json } from "@remix-run/node";
import type { LoaderFunctionArgs } from "@remix-run/node";
import { handleCors } from "~/utils/cors.server";
import prisma from "~/db.server";
import { authenticate } from "~/shopify.server";
import { getSettings, getShopId } from "~/services/Settings.server";
import { ensureGidFormat } from "~/services/ProductVolumePriceConfig.server";
import { B2B_PLUS_NAMESPACE, VOLUME_DISCOUNTS_KEY } from "~/services/CustomerGroups.server";

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
    
    let metafieldsReturnArray = new Array();
    let segmentsArray = {};
    
    var limit: Number = 100;
    var cursor: string|null = null;
    do {
        var hasNextPage: Boolean = false;
        var queryObject = getQueryObject(limit, cursor);
        var query = `query {
            productVariants(${queryObject}) {
                pageInfo {
                    hasNextPage
                }
                edges {
                    cursor
                    node {
                        id
                        metafield(namespace: "${B2B_PLUS_NAMESPACE}", key: "${VOLUME_DISCOUNTS_KEY}") {
                            id
                            jsonValue
                        }
                    }
                }
            }
        }`;

        var response = await admin.graphql(query);
        if(response.ok) {
            var respBody = await response.json();
            //console.log('respBody', JSON.stringify(respBody));
            if(respBody && respBody.data && respBody.data.productVariants) {
                var productVariants = respBody.data.productVariants || null;
                if(productVariants) {
                    hasNextPage = productVariants.pageInfo?.hasNextPage || false;
                    if(productVariants.edges && productVariants.edges.length > 0) {
                        for(var i in productVariants.edges) {
                            var currentEdge = productVariants.edges[i];
                            cursor = currentEdge.cursor;
                            const currentNode = currentEdge.node;
                            if(currentNode.metafield != null && currentNode.metafield.hasOwnProperty('jsonValue') && currentNode.metafield.jsonValue) {
                                const currentJSONValue = currentNode.metafield.jsonValue;
                                for(var k in currentJSONValue) {
                                    if(!segmentsArray.hasOwnProperty(currentJSONValue[k].tag)) {
                                        segmentsArray[currentJSONValue[k].tag] = new Array();
                                    }

                                    segmentsArray[currentJSONValue[k].tag].push({
                                        variantId: currentNode.id,
                                        volumeConfig: currentJSONValue[k].volumeConfig,
                                        priceConfig: currentJSONValue[k].priceConfig,
                                        tagID: currentJSONValue[k].tag,
                                        type: currentJSONValue[k].type
                                    });
                                }
                            }
                        }
                    } 
                } 
            } 
        } 
    } while(hasNextPage);

    if(segmentsArray && Object.keys(segmentsArray).length > 0) {
        for(var tag_id in segmentsArray) {
            var tempUpdatePayload = new Array();
            var storeDiscountsArr = {};
            if(segmentsArray[tag_id].length > 0) {
                for(var l in segmentsArray[tag_id]) {
                    var tempVolumeConfig = {
                        maximum: segmentsArray[tag_id][l].volumeConfig.maximum,
                        minimum: segmentsArray[tag_id][l].volumeConfig.minimum,
                        increments: segmentsArray[tag_id][l].volumeConfig.increment
                    }

                    var tempPriceConfig = new Array();
                    for(var m in segmentsArray[tag_id][l].priceConfig) {
                        tempPriceConfig.push({
                            quantity: segmentsArray[tag_id][l].priceConfig[m].quantity,
                            value: segmentsArray[tag_id][l].priceConfig[m].percentage
                        })
                    } 
                    tempUpdatePayload.push({
                        id: segmentsArray[tag_id][l].variantId,
                        type: 'variant',
                        priceConfig: tempPriceConfig,
                        volumeConfig: tempVolumeConfig,
                        discountValue: tempPriceConfig != null && tempPriceConfig.length > 0 ? tempPriceConfig[0].value : 0,
                        discount_type: segmentsArray[tag_id][l].type == 'percentage' ? 'percentage':'fixed'
                    });

                    
                }
            }

            const dbRow = await prisma.shopSegmentsData.findFirst({
                where: {
                    shop: shop,
                    tagID: tag_id
                }
            });

            if(dbRow) {
                await prisma.shopSegmentsData.update({
                    where: {
                        id: dbRow.id
                    },
                    data: {
                        productDiscounts: tempUpdatePayload
                    }
                });
            }
        }
    }

    const dbRows = await prisma.shopSegmentsData.findMany({
        where: {
            shop: shop
        }
    });

    if(dbRows && dbRows.length > 0) {
        for(var i in dbRows) {
            const dbRow = dbRows[i];
            if(dbRow.tagID) {
                const tagLevelVolumeDiscounts = await getSettings(admin, dbRow.tagID);
                if(tagLevelVolumeDiscounts != null) {
                    const parsedDVolDiscounts = JSON.parse(tagLevelVolumeDiscounts);
                    storeDiscountsArr = {
                        discount: dbRow.defaultDiscount,
                        priceConfig: [],
                        volumeConfig: {
                            maximum: parsedDVolDiscounts.maximum,
                            minimum: parsedDVolDiscounts.minimum,
                            increments: parsedDVolDiscounts.increment
                        },
                        discount_type: "percentage"
                    }
                } else {
                        storeDiscountsArr = {
                        discount: dbRow.defaultDiscount,
                        priceConfig: [],
                        volumeConfig: {
                            maximum: null,
                            minimum: 1,
                            increments: 1
                        },
                        discount_type: "percentage"
                    }
                }

                await prisma.shopSegmentsData.update({
                    where: {
                        id: dbRow.id
                    },
                    data: {
                        storeDiscounts: storeDiscountsArr
                    }
                });
            }
        }
    }
                    
    return json({data: segmentsArray});
}

function getQueryObject(limit: Number, cursor:string|null = null) {
  var returnVal = new Array(); 
  returnVal.push(`first: ${limit}`);
  if(cursor) {
    returnVal.push(`after: "${cursor}"`);
  }

  return returnVal.join(', ');
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