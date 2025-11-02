import { json } from "@remix-run/node";
import type { LoaderFunctionArgs } from "@remix-run/node";
import crypto from "crypto";
import { getCustomerGroupTag } from "~/services/ProductVolumePriceConfig.server";
import { isSubscriptionActive } from "~/services/Settings.server";
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
  const customerId = url.searchParams.get("customer");

  const missingParams: string[] = [];
  if (!shop) missingParams.push("shop");
  if (!apiKey) missingParams.push("api_key");
  if (!timestamp) missingParams.push("timestamp");
  if (!hmac) missingParams.push("hmac");
  if (!customerId) missingParams.push("customer");

  if (missingParams.length > 0) {
    //console.debug(`Missing required parameters: ${missingParams.join(", ")}`); // Log missing parameters
    throw new Error(`Missing required parameters: ${missingParams.join(", ")}`);
  }

  return { shop, apiKey, timestamp, hmac, customerId };
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

  if (calculatedHmac !== hmac) {
    console.log("Invalid signature");
        return json({ error: "Invalid signature" }, { status: 401 });
  }
}

async function fetchCustomerTag(shop: string, customerId: string): Promise<string | null> {
  const { admin } = await unauthenticated.admin(shop);
  const subActive = await isSubscriptionActive(admin);
  return subActive ? getCustomerGroupTag(admin, customerId, shop) : null;
}

// Loader function
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
    let { shop, apiKey, timestamp, hmac, customerId } = validateRequestParams(url);
    //console.debug(`Loader: Validated parameters for shop: ${shop}, customerId: ${customerId}`);
    
    verifyRequest(apiKey ?? '', timestamp ?? '', hmac ?? '');

    const customertag = await fetchCustomerTag(shop ?? '', customerId ?? '');
    //console.debug(`Loader: Fetched customer tag for shop: ${shop}`, JSON.stringify(customertag));
    
    return json(customertag, {
      headers: corsResponse
    });
  } catch (error) {
    const errorMessage = (error as Error).message;
    //console.debug(`Loader: Error occurred - ${errorMessage}`);
    
    // Return error with CORS headers
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

// Add action for handling other HTTP methods
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