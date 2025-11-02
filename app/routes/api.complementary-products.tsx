import { json } from "@remix-run/node";
import type { LoaderFunctionArgs } from "@remix-run/node";
import crypto from "crypto";
import { getComplementaryProduct } from "~/services/ComplementaryProducts.server";
import { ensureGidFormat } from "~/services/ProductVolumePriceConfig.server";
import { unauthenticated } from "~/shopify.server";
import { handleCors } from "~/utils/cors.server";

const SHOPIFY_API_KEY = process.env.SHOPIFY_API_KEY;
const SHOPIFY_API_SECRET = process.env.SHOPIFY_API_SECRET;
const TIME_WINDOW = 3600; // 1 hour

export async function loader({ request }: LoaderFunctionArgs) {
  // Handle CORS first
  const corsResponse = handleCors(request);
  
  // If it's an unauthorized CORS request, return early
  if (corsResponse instanceof Response) {
    return corsResponse;
  }

  // Handle OPTIONS request
  if (request.method === "OPTIONS") {
    return new Response(null, { headers: corsResponse });
  }
  
  const url = new URL(request.url);
  const apiKey = url.searchParams.get("api_key");
  const timestamp = url.searchParams.get("timestamp");
  const hmac = url.searchParams.get("hmac");

  const shop = url.searchParams.get("shop");
  let productId = url.searchParams.get("productId");
  let variantId = url.searchParams.get("variantId");

  if(!productId || !variantId) {
    return json({ error: "Missing required parameters - ProductId VariantID" }, { 
      status: 400,
      headers: corsResponse 
    });
  }

  productId = ensureGidFormat(productId, 'Product');
  variantId = ensureGidFormat(variantId, 'ProductVariant');
  
  // Check if all required parameters are present
  if (!apiKey || !timestamp || !hmac) {
    return json({ error: "Missing required parameters" }, { 
      status: 400,
      headers: corsResponse 
    });
  }

  // Verify API key
  if (apiKey !== SHOPIFY_API_KEY) {
    return json({ error: "Invalid API key" }, { 
      status: 401,
      headers: corsResponse 
    });
  }

  // Check if the request is within the valid time window
  const currentTime = Math.floor(Date.now() / 1000);
  if (Math.abs(currentTime - parseInt(timestamp)) > TIME_WINDOW) {
    return json({ error: "Request expired" }, { 
      status: 401,
      headers: corsResponse 
    });
  }

  // Recreate the message
  const message = apiKey + timestamp;

  // Calculate the HMAC
  const calculatedHmac = crypto
    .createHmac("sha256", SHOPIFY_API_SECRET || '')
    .update(message)
    .digest("hex");

  // Compare the calculated HMAC with the provided HMAC
  if (calculatedHmac !== hmac) {
    return json({ error: "Invalid signature" }, { 
      status: 401,
      headers: corsResponse 
    });
  }

  if (!shop) {
    return json({ error: "Missing required parameters" }, { 
      status: 400,
      headers: corsResponse 
    });
  }

  try {
    const admin = await unauthenticated.admin(shop);
    const complementaryProduct = await getComplementaryProduct(admin, variantId);
    
    return json(complementaryProduct, {
      headers: corsResponse
    });
  } catch (error) {
    console.error("Error fetching complementary product:", error);
    return json({ error: "Internal server error" }, { 
      status: 500,
      headers: corsResponse 
    });
  }
}

// Add action function for handling other HTTP methods
export async function action({ request }: LoaderFunctionArgs) {
  // Handle CORS for non-GET requests
  const corsResponse = handleCors(request);
  
  if (corsResponse instanceof Response) {
    return corsResponse;
  }

  if (request.method === "OPTIONS") {
    return new Response(null, { headers: corsResponse });
  }

  return json({ error: "Method not allowed" }, { 
    status: 405,
    headers: corsResponse 
  });
}