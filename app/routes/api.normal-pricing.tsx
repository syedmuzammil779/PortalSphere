import { json } from "@remix-run/node";
import type { LoaderFunctionArgs } from "@remix-run/node";
import crypto from "crypto";
import { getProductVariantNormalPriceConfig, getVariantFromProduct } from "~/services/ProductVolumePriceConfig.server";
import { unauthenticated } from "~/shopify.server";
import { handleCors } from "~/utils/cors.server";

const SHOPIFY_API_KEY = process.env.SHOPIFY_API_KEY;
const SHOPIFY_API_SECRET = process.env.SHOPIFY_API_SECRET;
const TIME_WINDOW = 3600; // 1 hour

// Helper function to validate request parameters
function validateRequestParams(url: URL) {
  const shop = url.searchParams.get("shop");
  const apiKey = url.searchParams.get("api_key");
  const timestamp = url.searchParams.get("timestamp");
  const hmac = url.searchParams.get("hmac");
  const productVariantId = url.searchParams.get("productVariantId");
  const productId = url.searchParams.get("productId");

  const missingParams: string[] = [];
  if (!shop) missingParams.push("shop");
  if (!apiKey) missingParams.push("api_key");
  if (!timestamp) missingParams.push("timestamp");
  if (!hmac) missingParams.push("hmac");
  if (!productVariantId && !productId) missingParams.push("product / variant id");

  if (missingParams.length > 0) {
    //console.debug(`Missing required parameters: ${missingParams.join(", ")}`); // Log missing parameters
    throw new Error(`Missing required parameters: ${missingParams.join(", ")}`);
  }

  return { shop, apiKey, timestamp, hmac, productVariantId, productId };
}

// Helper function to verify API key and HMAC
function verifyRequest(apiKey: string, timestamp: string, hmac: string) {
  if (apiKey !== SHOPIFY_API_KEY) {
    console.log("Invalid API key");
		return json({ error: "Invalid API key" }, { status: 401 });
  }

  const currentTime = Math.floor(Date.now() / 1000);
  if (Math.abs(currentTime - parseInt(timestamp)) > TIME_WINDOW) {
    console.log("Request expired");
        return json({ error: "Request expired" }, { status: 401 });
  }

  const message = apiKey + timestamp;
  const calculatedHmac = crypto
    .createHmac("sha256", SHOPIFY_API_SECRET || '')
    .update(message)
    .digest("hex");

  // console.log('calculatedHmac', calculatedHmac);
  //console.log('hmac', hmac);
  if (calculatedHmac !== hmac) {
    console.log("Invalid signature");
        return json({ error: "Invalid signature" }, { status: 401 });
  }
}

async function fetchNormalPricingData(shop: string, productVariantId: string) {
  const { admin } = await unauthenticated.admin(shop);
  //console.log('productVariantId', productVariantId);
  const retval = await getProductVariantNormalPriceConfig(admin, productVariantId);
  //console.log('getProductVariantNormalPriceConfig', retval);
  return retval;
}

async function fetchVariantFromProduct(shop: string, productId: string): Promise<string | null> {
  const { admin } = await unauthenticated.admin(shop);
  return getVariantFromProduct(admin, productId);
}

// Loader function with CORS support
export async function loader({ request }: LoaderFunctionArgs) {
  // Handle CORS first
  const corsResponse = handleCors(request);
  
  if (corsResponse instanceof Response) {
    return corsResponse;
  }

  // Handle OPTIONS request
  if (request.method === "OPTIONS") {
    return new Response(null, { headers: corsResponse });
  }

  try {
    //console.debug('STOREFRONT_API_KEY', SHOPIFY_API_KEY);
    //console.debug('SHOPIFY_API_KEY', SHOPIFY_API_SECRET);

    const url = new URL(request.url);
    let { shop, apiKey, timestamp, hmac, productVariantId, productId } = validateRequestParams(url);    
    verifyRequest(apiKey ?? '', timestamp ?? '', hmac ?? '');

    if (!productVariantId && productId) {
      productVariantId = await fetchVariantFromProduct(shop ?? '', productId);
    }

    const normalPricing = await fetchNormalPricingData(shop ?? '', productVariantId ?? '');
    //console.debug(`Loader: Fetched normal pricing data for shop: ${shop}`, JSON.stringify(normalPricing));
    
    return json(normalPricing, {
      headers: corsResponse
    });
  } catch (error) {
    const errorMessage = (error as Error).message;
    //console.debug(`Loader: Error occurred - ${errorMessage}`);
    
    return json(
      { error: errorMessage }, 
      { 
        status: 
          errorMessage.includes("Invalid") ? 401 :
          errorMessage.includes("Missing") ? 400 : 
          500,
        headers: corsResponse
      }
    );
  }
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