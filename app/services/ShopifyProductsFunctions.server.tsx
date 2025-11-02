import { GraphqlClient } from "@shopify/shopify-api";
import { AdminApiContext } from "@shopify/shopify-app-remix/server";
import { B2B_PLUS_NAMESPACE, VOLUME_DISCOUNTS_KEY } from "./CustomerGroups.server";
import { Session } from "@prisma/client";
import prisma from "~/db.server";

export const getVariantsForThisProduct = async (admin: AdminApiContext|GraphqlClient, productId: string): Promise<any> => {
    var returnVal = new Array();
    try {
        var cursor = null;
        var limit = 250;
        var hasNextPage;
        do {
            var queryObject = getQueryObjectForStore(cursor, limit, productId);
            var query = `query {
                productVariants(${queryObject}) {
                    edges {
                        node {
                            id compareAtPrice
                            title displayName   
                            inventoryPolicy
                            inventoryQuantity
                            price sku 
                            metafields(first: 250, namespace:"${B2B_PLUS_NAMESPACE}") {
                                nodes {
                                    id
                                    key
                                    jsonValue
                                }
                            }    
                        }
                        cursor
                    }
                    pageInfo { hasNextPage }
                }
            }`;

            var respBody = null;
            if('graphql' in admin) {
                const response = await admin.graphql(query);
                if(response.ok) {
                    respBody = await response.json();
                }   
            } else {
                respBody = await admin.request(query);
            }

            if (respBody && respBody.hasOwnProperty("data") && respBody.data.hasOwnProperty("productVariants")) {
                var productVariants = respBody.data.productVariants;
                if (productVariants && productVariants.hasOwnProperty("edges") && productVariants.edges.length) {
                    for (var i in productVariants.edges) {
                        var node = productVariants.edges[i].node;
                        returnVal.push(node);
                        cursor = productVariants.edges[i].cursor;
                    }

                    hasNextPage = respBody.data.productVariants.pageInfo.hasNextPage;
                }
            }
            
        } while (cursor != null && hasNextPage == true);
        
    } catch (error:any) {
        return {error: error.message};
    }

    return returnVal
}

export const syncProductsInDB = async (returnVal: any, dbRecord: Session, formattedCustomerGroups: any) => {
    if(returnVal && returnVal.length > 0) {
        for(var i in returnVal) {
            const currentProduct = returnVal[i];
            const currentProductId = parseInt(currentProduct.id.replace('gid://shopify/Product/', ''));
            await prisma.shopProducts.upsert({
                where: {
                    productId_storeId: {
                        storeId: dbRecord.table_id,
                        productId: currentProductId
                    }
                },
                update: {
                    title: currentProduct.title,
                    handle: currentProduct.handle,
                    productType: currentProduct.productType,
                    status: currentProduct.status,
                    tags: JSON.stringify(currentProduct.tags),
                    totalInventory: currentProduct.totalInventory,
                    tracksInventory: currentProduct.tracksInventory,
                    variantsCount: currentProduct.variantsCount.count,
                    vendor: currentProduct.vendor
                },
                create: {
                    storeId: dbRecord?.table_id,
                    productId: currentProductId,
                    title: currentProduct.title,
                    handle: currentProduct.handle,
                    productType: currentProduct.productType,
                    status: currentProduct.status,
                    tags: JSON.stringify(currentProduct.tags),
                    totalInventory: currentProduct.totalInventory,
                    tracksInventory: currentProduct.tracksInventory,
                    variantsCount: currentProduct.variantsCount.count,
                    vendor: currentProduct.vendor
                }
            });

            for(var j in currentProduct.variants) {
                var currentVariant = currentProduct.variants[j];
                var currentVariantId = parseInt(currentVariant.id.replace("gid://shopify/ProductVariant/", ''))
                await prisma.shopVariants.upsert({
                    where: {
                        storeId_productId_variantId: {
                            storeId: dbRecord.table_id,
                            productId: currentProductId,
                            variantId: currentVariantId
                        }
                    },
                    create: {
                        storeId: dbRecord.table_id,
                        productId: currentProductId,
                        variantId: currentVariantId,
                        compareAtPrice: currentVariant.compareAtPrice,
                        title: currentVariant.title,
                        displayName: currentVariant.displayName,
                        inventoryPolicy: currentVariant.inventoryPolicy,
                        inventoryQuantity: currentVariant.inventoryQuantity,
                        price: currentVariant.price,
                        sku: currentVariant.sku
                    },
                    update: {
                        compareAtPrice: currentVariant.compareAtPrice,
                        title: currentVariant.title,
                        displayName: currentVariant.displayName,
                        inventoryPolicy: currentVariant.inventoryPolicy,
                        inventoryQuantity: currentVariant.inventoryQuantity,
                        price: currentVariant.price,
                        sku: currentVariant.sku
                    }
                });

                if(currentVariant.metafields && currentVariant.metafields.nodes) {
                    for(var index in currentVariant.metafields.nodes) {
                        var currentMetaNode = currentVariant.metafields.nodes[index];
                        if(currentMetaNode.key == VOLUME_DISCOUNTS_KEY) {
                            var jsonValue = currentMetaNode.jsonValue;
                            if(jsonValue != null && jsonValue.length > 0) {
                                for(var counter in jsonValue) {
                                    try {
                                        var tag = jsonValue[counter].tag;
                                        if(formattedCustomerGroups != null && formattedCustomerGroups.hasOwnProperty(tag)) {
                                            await prisma.shopSegmentVariants.upsert({
                                                where: {
                                                    segmentId_variantId: {
                                                        segmentId: formattedCustomerGroups[tag].id,
                                                        variantId: currentVariantId
                                                    }
                                                },
                                                create: {
                                                    segmentId: formattedCustomerGroups[tag].id,
                                                    variantId: currentVariantId,
                                                    discount_type: jsonValue[counter].type,
                                                    priceConfig: jsonValue[counter].priceConfig,
                                                    volumeConfig: jsonValue[counter].volumeConfig
                                                },
                                                update: {
                                                    discount_type: jsonValue[counter].type,
                                                    priceConfig: jsonValue[counter].priceConfig,
                                                    volumeConfig: jsonValue[counter].volumeConfig
                                                }
                                            })
                                        }    
                                    } catch (error) {
                                        console.error(error);
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}

export const getQueryObjectForStore = (cursor:string|null|undefined = null, limit = 25, productId:string|null = null) => {
  var returnVal = new Array();
  returnVal.push(`first: ${limit}`);

  if (cursor != null) {
    returnVal.push(`after: "${cursor}"`);
  }

  if(productId != null) {
    returnVal.push(`query: "product_id:${productId.replace('gid://shopify/Product/', '')}"`);
  }

  return returnVal.join(", ");
}