import { json } from "@remix-run/node";
import type { LoaderFunctionArgs } from "@remix-run/node";
import { handleCors } from "~/utils/cors.server";
import prisma from "~/db.server";
import { authenticate } from "~/shopify.server";
import { getSettings, getShopId } from "~/services/Settings.server";
import { ensureGidFormat } from "~/services/ProductVolumePriceConfig.server";
import { B2B_PLUS_NAMESPACE, VOLUME_DISCOUNTS_KEY } from "~/services/CustomerGroups.server";
import { makeAGraphQLAPICallToShopify } from "~/services/CustomFunctions.server";

export async function loader({ request }: LoaderFunctionArgs) {
    const corsResponse = handleCors(request);

    if (corsResponse instanceof Response) {
        return corsResponse;
    }

    if (request.method === "OPTIONS") {
        return new Response(null, { headers: corsResponse });
    }

    const {admin, session} = await authenticate.admin(request);
    const url = new URL(request.url);
    const shop_url = url.searchParams.get("shop_url");
    const token = url.searchParams.get("token");

    const shopObject = {
        shop: shop_url,
        accessToken: token
    };    
    
    let productsArr = new Array();
    
    var limit: Number = 100;
    var cursor: string|null = null;
    do {
        var hasNextPage: Boolean = false;
        var queryObject = getQueryObject(limit, cursor);
        var query = `query {
            products(${queryObject}) {
                pageInfo {
                    hasNextPage
                }
                edges {
                    cursor
                    node {
                        id
                        metafield(namespace: "${B2B_PLUS_NAMESPACE}", key: "${VOLUME_DISCOUNTS_KEY}") {
                            id
                            value
                        }
                        variants(first: 250) {
                            edges {
                                node {
                                    id
                                    metafield(namespace: "${B2B_PLUS_NAMESPACE}", key: "${VOLUME_DISCOUNTS_KEY}") {
                                        id
                                        value
                                    }           
                                }
                            }
                        }
                    }
                }
            }
        }`;

        const response = await makeAGraphQLAPICallToShopify(shopObject, {query: query}); 
        if(response.status) {
            const products = response.respBody.data.products;
            hasNextPage = products.pageInfo.hasNextPage;
            if(products && products.edges) {
                for(var i in products.edges) {
                    cursor = products.edges[i].cursor;
                    productsArr.push(products.edges[i].node);   
                }
            }

        } 

    } while(hasNextPage);
                
    return json({data: productsArr});
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