import { json } from "@remix-run/node";
import type { LoaderFunctionArgs } from "@remix-run/node";
import { handleCors } from "~/utils/cors.server";

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

  // Return a simple health check response
  return json({ status: "UP", timestamp: new Date().toISOString() }, {
    headers: corsResponse
  });
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