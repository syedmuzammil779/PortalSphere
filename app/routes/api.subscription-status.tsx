import { json } from "@remix-run/node";
import type { LoaderFunctionArgs } from "@remix-run/node";
import { unauthenticated } from "~/shopify.server";
import { handleCors } from "~/utils/cors.server";


// Loader function
export async function loader({ request }: LoaderFunctionArgs) {
  const corsResponse = handleCors(request);
  
  if (corsResponse instanceof Response) {
    return corsResponse;
  }

  if (request.method === "OPTIONS") {
    return new Response(null, { headers: corsResponse });
  }

  try {
    // Get shop from URL parameters
    const url = new URL(request.url);
    const shop = url.searchParams.get('shop');
    
    if (!shop) {
      throw new Error('Missing shop parameter');
    }

    const { admin } = await unauthenticated.admin(shop);
    const response = await admin.graphql(
      `query {
        shop {
          metafield(namespace: "b2bplus", key: "subscriptionDate") {
            value
          }
        }
      }`
    );
    
    const data = await response.json();
    const subscriptionDate = data?.data?.shop?.metafield?.value;

    // If not subscribed, return null
    if (!subscriptionDate) {
      return json(null, {
        headers: corsResponse
      });
    }

    return json({ subscriptionDate }, {
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