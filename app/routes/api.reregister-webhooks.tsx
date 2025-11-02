import { json } from "@remix-run/node";
import type { LoaderFunctionArgs } from "@remix-run/node";
import { handleCors } from "~/utils/cors.server";
import prisma from "~/db.server";
import { authenticate } from "~/shopify.server";
import { checkWebhooksURLMatch, registerWebhooksForStore, removeWebhooksForStore } from "~/services/CustomFunctions.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const corsResponse = handleCors(request);

  if (corsResponse instanceof Response) {
    return corsResponse;
  }

  if (request.method === "OPTIONS") {
    return new Response(null, { headers: corsResponse });
  }

  const url = new URL(request.url);
  const {admin, session} = await authenticate.admin(request);
  const { shop } = session;
  const store = await prisma.session.findFirst({where: { shop: shop }});

  await removeWebhooksForStore(store);
  await registerWebhooksForStore(store);
  
  return json({status: true, message: 'ok', baseURL: `${process.env.SHOPIFY_APP_URL}/webhooks`});
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