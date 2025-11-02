import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server";

export async function action({ request }: { request: Request }) {
  const { admin } = await authenticate.admin(request);

  const mutation = `
    mutation {
      appUsageRecordCreate(
        subscriptionLineItemId: "gid://shopify/AppSubscriptionLineItem/24497324095?v=1&index=0",
        description: "USAGE RECORD 1,000,000 revenue",
        price: {
          amount: 1.00,
          currencyCode: USD
        }
      ) {
        appUsageRecord {
          id
        }
        userErrors {
          field
          message
        }
      }
    }
  `;

  const response = await admin.graphql(mutation);
  const responseJson = await response.json();
  //console.debug(JSON.stringify(responseJson.data));
  

  return json(responseJson.data);
}
