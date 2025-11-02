import { json } from "@remix-run/node";
import type { LoaderFunctionArgs } from "@remix-run/node";
import { handleCors } from "~/utils/cors.server";
import prisma from "~/db.server";
import { authenticate } from "~/shopify.server";
import { appCache } from "~/utils/cache.server";
import { getQueryObjectForStore, getVariantsForThisProduct, syncProductsInDB } from "~/services/ShopifyProductsFunctions.server";

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
    const lastProductCursor = `ProductSync:${shop}`;
    const MAX_LIMIT = 5;
    const dbRecord = await prisma.session.findFirst({ where: { shop: shop } });
    let customerGroups = await prisma.shopSegmentsData.findMany({ where: { shop: shop }});
    let formattedCustomerGroups = {};

    if(customerGroups != null && customerGroups.length) {
        for(var k in customerGroups) {
            if(customerGroups[k] != null && customerGroups[k].hasOwnProperty('tagID'))
                formattedCustomerGroups[customerGroups[k].tagID] = customerGroups[k];
        }
    }

    if(!dbRecord) {
        return json({error: 'Store not found!'});
    }
        
    try {
        var cursor:string|null = appCache.has(lastProductCursor) ? appCache.get(lastProductCursor) as string : null;
        var returnVal = new Array();
        var limit = 250;
        var hasNextPage;
        do {
            var queryObject = getQueryObjectForStore(cursor, limit);
            var query = `query {
                products(${queryObject}) {
                    edges {
                        node {
                            id title handle     
                            productType status     
                            tags totalInventory tracksInventory
                            variantsCount { count } vendor     
                        }
                        cursor
                    }
                    pageInfo { hasNextPage }
                }
            }`;

            const response = await admin.graphql(query);
            if(response.ok) {
                const respBody = await response.json();
                if (respBody && respBody.hasOwnProperty("data") && respBody.data.hasOwnProperty("products")) {
                    var products = respBody.data.products;
                    if (products && products.hasOwnProperty("edges") && products.edges.length > 0) {
                        for (var i in products.edges) {
                            var node = products.edges[i].node;
                            node.variants = await getVariantsForThisProduct(admin, node.id);
                            returnVal.push(node);

                            cursor = products.edges[i].cursor;
                            appCache.set(lastProductCursor, cursor, 120);
                        }

                        hasNextPage = respBody.data.products.pageInfo.hasNextPage;
                    } else {
                        appCache.del(lastProductCursor);
                        cursor = null;
                        hasNextPage = false;
                    }
                }
            } 
        } while (cursor != null && hasNextPage == true && returnVal.length < MAX_LIMIT);
        
        await syncProductsInDB(returnVal, dbRecord, formattedCustomerGroups); 

        return json({
            data: returnVal
        });
    }catch(err: any) {
        return json({
            error: err.message
        });
    }
}

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