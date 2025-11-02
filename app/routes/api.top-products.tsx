import { json, type LoaderFunctionArgs } from "@remix-run/node";
import crypto from "crypto";
import { unauthenticated } from "~/shopify.server";
import { handleCors } from "~/utils/cors.server";
import { getTopProducts, getVariantAndPriceConfig } from "~/services/TopProducts.server";
import { getCustomerGroupTag } from "~/services/ProductVolumePriceConfig.server";

const SHOPIFY_API_KEY = process.env.SHOPIFY_API_KEY;
const SHOPIFY_API_SECRET = process.env.SHOPIFY_API_SECRET;
const TIME_WINDOW = 3600; // 1 hour

function validateRequestParams(params: URLSearchParams) {
  const requiredParams = ['shop', 'api_key', 'timestamp', 'hmac', 'customer'];
  for (const param of requiredParams) {
    if (!params.get(param)) {
      throw new Error(`Missing required parameter: ${param}`);
    }
  }
}

function verifyRequest(params: URLSearchParams) {
  const apiKey = params.get("api_key")!;
  const timestamp = params.get("timestamp")!;
  const hmac = params.get("hmac")!;

  // Verify API key
  if (apiKey !== SHOPIFY_API_KEY) {
    throw new Error("Invalid API key");
  }

  // Check if the request is within the valid time window
  const currentTime = Math.floor(Date.now() / 1000);
  if (Math.abs(currentTime - parseInt(timestamp)) > TIME_WINDOW) {
    throw new Error("Request expired");
  }

  // Recreate the message and calculate the HMAC
  const message = apiKey + timestamp;
  const calculatedHmac = crypto
    .createHmac("sha256", SHOPIFY_API_SECRET || '')
    .update(message)
    .digest("hex");

  // Compare the calculated HMAC with the provided HMAC
  if (calculatedHmac !== hmac) {
    throw new Error("Invalid signature");
  }
}

export async function action({ request }: LoaderFunctionArgs) {
  // Handle CORS first
  const corsResponse = handleCors(request);
  
  if (corsResponse instanceof Response) {
    return corsResponse;
  }

  // Handle OPTIONS request
  if (request.method === "OPTIONS") {
    return new Response(null, { headers: corsResponse });
  }

  const url = new URL(request.url);
  const params = url.searchParams;

  try {
    validateRequestParams(params);
    verifyRequest(params);

    const shop = params.get("shop")!;
    const customerId = params.get("customer")!;
    const { admin } = await unauthenticated.admin(shop);

    // Parse the request body
    const body = await request.json();
    const { lineItems } = body;

    const topProducts = await getTopProducts(admin, true);

    const lineItemProductIds = lineItems && lineItems.length > 0 
      ? lineItems.map((item: any) => `gid://shopify/Product/${item.product_id}`) 
      : [];

    // Get past ordered items
    const pastOrderedItems = await getPastOrders(shop, `gid://shopify/Customer/${customerId}`);
    const pastOrderedProductIds = pastOrderedItems.map(item => item.productId);

    // Combine current cart items and past ordered items
    const excludedProductIds = new Set([...lineItemProductIds, ...pastOrderedProductIds]);
    var firstAvailableTopProduct = topProducts.find(product => 
      product.productId 
      && (
        product.productInfo?.tracksInventory ? (
          product?.productInfo?.inventory != null && product?.productInfo?.inventory > 0
        ) : 
        true
      ) && 
      !excludedProductIds.has(product.productId)
    );

    let variantConfiguration = {};
    var tag = await getCustomerGroupTag(admin, customerId, shop);

    if(firstAvailableTopProduct != null && firstAvailableTopProduct.hasOwnProperty('variantIds') && Array.isArray(firstAvailableTopProduct.variantIds) && tag) {
      for(var i in firstAvailableTopProduct.variantIds) {
        const currentVariantId = firstAvailableTopProduct.variantIds[i];
        variantConfiguration[currentVariantId] = await getVariantAndPriceConfig(admin, currentVariantId, tag);
      }
    }

    if (firstAvailableTopProduct) {
      firstAvailableTopProduct.variantsConfiguration = variantConfiguration;
      return json(firstAvailableTopProduct, {
        headers: corsResponse
      });
    } else {
      return json({ message: "No available top product found" }, {
        headers: corsResponse
      });
    }
  } catch (error: any) {
    console.error("Error:", error.message);
    return json(
      { error: error.message }, 
      { 
        status: 
          error.message.includes("Invalid") ? 401 :
          error.message.includes("Missing") ? 400 : 
          500,
        headers: corsResponse
      }
    );
  }
}

// Add loader for handling GET requests
export async function loader({ request }: LoaderFunctionArgs) {
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

async function getPastOrders(shop: string, customerId: string) {
  const {admin} = await unauthenticated.admin(shop);
  
  const query = `
    query GetCustomerOrders($customerId: ID!, $cursor: String) {
      customer(id: $customerId) {
        orders(first: 250, after: $cursor) {
          edges {
            node {
              lineItems(first: 250) {
                edges {
                  node {
                    product {
                      id
                    }
                    variant {
                      id
                    }
                  }
                }
              }
            }
          }
          pageInfo {
            hasNextPage
            endCursor
          }
        }
      }
    }
  `;

  const items = new Set<{ productId: string; variantId: string }>();
  let hasNextPage = true;
  let cursor: string | null = null;

  while (hasNextPage) {
    const response: any = await admin.graphql(query, {
      variables: { customerId, cursor },
    });

    const data = await response.json();
    const orders = data.data.customer.orders;

    orders.edges.forEach((edge: any) => {
      edge.node.lineItems.edges.forEach((lineItem: any) => {
        items.add({
          productId: lineItem.node.product.id,
          variantId: lineItem.node.variant.id,
        });
      });
    });

    hasNextPage = orders.pageInfo.hasNextPage;
    cursor = orders.pageInfo.endCursor;
  }

  return Array.from(items);
}
