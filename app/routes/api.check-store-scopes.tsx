import { json } from "@remix-run/node";
import type { LoaderFunctionArgs } from "@remix-run/node";
import { handleCors } from "~/utils/cors.server";
import prisma from "~/db.server";
import { authenticate } from "~/shopify.server";
import { checkStoreInstallation, getAdminClient } from "~/services/CustomFunctions.server";
import { getAccessScopes } from "~/services/DashboardFunctions.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const corsResponse = handleCors(request);

  if (corsResponse instanceof Response) {
    return corsResponse;
  }

  if (request.method === "OPTIONS") {
    return new Response(null, { headers: corsResponse });
  }

  const { admin, session } = await authenticate.admin(request);
  var returnVal = {};
  var allStores = await prisma.session.findMany();
  for (var i in allStores) {
    const currentStore = allStores[i];
    const adminClient = await getAdminClient(currentStore);
    var checkInstallation = await checkStoreInstallation(currentStore);
    if (checkInstallation) {
      const accessScopes = await getAccessScopes(adminClient);
      returnVal[currentStore.shop] = accessScopes;
    }
  }

  return json(returnVal);
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
