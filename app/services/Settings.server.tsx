import type { AdminApiContext, UnauthenticatedAdminContext } from "@shopify/shopify-app-remix/server";
import { authenticate, PORTALSPHERE_SUBSCRIPTION } from "../shopify.server";
import { removeAutomaticDiscounts } from "./Webhooks.server";
import { redirect } from "@remix-run/node";
import prisma from "~/db.server";
import { B2B_PLUS_NAMESPACE } from "./CustomerGroups.server";

interface MetafieldNode {
  id: string;
  key: string;
  value: string;
  namespace: string;
}

interface GraphQLResponse {
  data: {
    shop: {
      metafields: {
        edges: Array<{
          node: MetafieldNode;
        }>;
      };
    };
  };
}

export const isAppSettingsInitialized = async (
    admin: AdminApiContext
): Promise<boolean> => {
    try {
        const query = `
            query {
                shop {
                    metafields(
                        keys: ["b2bplus.enableTopProducts", "b2bplus.enableComplementaryProducts", "b2bplus.installDate", "b2bplus.trialEndDate", "b2bplus.trialHardStopEndDate"]
                        first: 10
                    ) {
                        edges {
                            node {
                                id
                                key
                                value
                                namespace
                            }
                        }
                    }
                }
            }
        `;

        const response = await admin.graphql(query);
        const result = await response.json() as GraphQLResponse;

        const metafields: MetafieldNode[] = result.data.shop.metafields.edges.map(
            (edge) => edge.node
        );
        
        const hasEnableTopProducts = metafields.some(
            (m) => m.key === "b2bplus.enableTopProducts"
        );
        const hasEnableComplementaryProducts = metafields.some(
            (m) => m.key === "b2bplus.enableComplementaryProducts"
        );
        const hasInstallDate = metafields.some(
            (m) => m.key === "b2bplus.installDate"
        );
        const hasTrialEndDate = metafields.some(
            (m) => m.key === "b2bplus.trialEndDate"
        );
        const hasTrialHardStopEndDate = metafields.some(
            (m) => m.key === "b2bplus.trialHardStopEndDate"
        );

        return hasEnableTopProducts && hasEnableComplementaryProducts && hasInstallDate && hasTrialEndDate && hasTrialHardStopEndDate;
    } catch (error) {
        console.error('Error checking app settings initialization:', error);
        console.error('Stack trace:', error instanceof Error ? error.stack : 'No stack trace available');
        throw error;
    }
};

export const initializeSettings = async (admin: AdminApiContext): Promise<void> => {
    try {
        const shopId = await getShopId(admin);
        const mutation = `
            mutation createMetafields($metafields: [MetafieldsSetInput!]!) {
                metafieldsSet(metafields: $metafields) {
                    metafields {
                        key
                        namespace
                        value
                    }
                    userErrors {
                        field
                        message
                    }
                }
            }
        `;

        const metafields = [
            {
                namespace: "b2bplus",
                key: "productVisibility",
                value: "{}",
                type: "string",
                ownerId: shopId
            },
            {
                namespace: "b2bplus",
                key: "enableTopProducts",
                value: "false",
                type: "boolean",
                ownerId: shopId
            },
            {
                namespace: "b2bplus",
                key: "enableComplementaryProducts",
                value: "false",
                type: "boolean",
                ownerId: shopId
            },
            {
                namespace: "b2bplus",
                key: "installDate",
                value: new Date().toISOString(),
                type: "date",
                ownerId: shopId
            },
            {
                namespace: "b2bplus",
                key: "trialEndDate",
                value: new Date(new Date().getTime() + 30 * 24 * 60 * 60 * 1000).toISOString(),
                type: "date",
                ownerId: shopId
            },
            {
                namespace: B2B_PLUS_NAMESPACE,
                key: "trialHardStopEndDate",
                value: new Date(new Date().getTime() + 60 * 24 * 60 * 60 * 1000).toISOString(),
                type: "date",
                ownerId: shopId
            }
        ];

        const response = await admin.graphql(
            mutation,
            {
                variables: {
                    metafields: metafields
                }
            }
        );

        const result = await response.json();

        if (result.data.metafieldsSet.userErrors.length > 0) {
            throw new Error(`Failed to create metafields: ${JSON.stringify(result.data.metafieldsSet.userErrors)}`);
        }
    } catch (error) {
        console.error('Error initializing settings:', error);
        console.error('Stack trace:', error instanceof Error ? error.stack : 'No stack trace available');
        throw error;
    }
};

export const getSettings = async (admin: AdminApiContext, key: string): Promise<string | null> => {
    try {
        const query = `
            query getMetafield($namespace: String!, $key: String!) {
                shop {
                    metafield(namespace: $namespace, key: $key) {
                        value
                    }
                }
            }
        `;

        const response = await admin.graphql(query, {
          variables: {
            namespace: B2B_PLUS_NAMESPACE,
            key: key
          } 
        });

        const result = await response.json();
        return result.data.shop.metafield ? result.data.shop.metafield.value : null;
    } catch (error) {
        console.error('Error getting settings:', error);
        console.error('Stack trace:', error instanceof Error ? error.stack : 'No stack trace available');
        throw error;
    }
};

export const updateSettings = async (admin: AdminApiContext, key: string, value: string): Promise<void> => {
    try {
        const isJson = (key === "shipping-discount-config");
        const mutation = `
            mutation updateMetafield($input: MetafieldsSetInput!) {
                metafieldsSet(metafields: [$input]) {
                    metafields {
                        key
                        namespace
                        value
                    }
                    userErrors {
                        field
                        message
                    }
                }
            }
        `;

        const metafieldInput = {
            namespace: "b2bplus",
            key: key,
            value: value,
            type: isJson ? "json" : "string",
            ownerId: await getShopId(admin)
        };

        const response = await admin.graphql(
            mutation,
            {
                variables: {
                    input: metafieldInput
                }
            }
        );

        const result = await response.json();

        if (result.data.metafieldsSet.userErrors.length > 0) {
            throw new Error(`Failed to update metafield: ${JSON.stringify(result.data.metafieldsSet.userErrors)}`);
        }
    } catch (error) {
        console.error('Error updating settings:', error);
        console.error('Stack trace:', error instanceof Error ? error.stack : 'No stack trace available');
        throw error;
    }
};

export const getShopId = async (admin: AdminApiContext, shop?: string|undefined|null): Promise<string> => {
  // First, query the db for the shop's ID
  var dbRecord = null;
  if(shop) {
    dbRecord = await prisma.session.findFirstOrThrow({
      where: {shop: shop},
      select: { id: true, shopId: true }
    });

    if(dbRecord.shopId) {
      return dbRecord.shopId
    }
  }

  const shopData = await admin.graphql(`
    query {
      shop {
        id
      }
    }
  `);

  const shopDataJson = await shopData.json();
  const shopGid = shopDataJson.data.shop.id;
  
  if(shop != null && dbRecord != null && dbRecord.id) {
    await prisma.session.update({
      data: { shopId: shopGid },
      where: { id: dbRecord.id }
    });
  }
  //console.log("Shop GID:", shopGid);
  return shopGid;
}

export const getShopIdManual = async (admin: any, shop?: string|undefined|null): Promise<any> => {
  try {
    // First, query the db for the shop's ID
    var dbRecord = null;
    if(shop) {
      dbRecord = await prisma.session.findFirstOrThrow({
        where: {shop: shop},
        select: { id: true, shopId: true }
      });

      if(dbRecord.shopId) {
        return dbRecord.shopId
      }
    }
    
    const response = await admin.request(`query { shop { id } }`);

    if(shop != null && dbRecord != null && dbRecord.id) {
      await prisma.session.update({
        data: { shopId: response.data.shop.id },
        where: { id: dbRecord.id }
      });
    }

    return response.data.shop.id;  
  } catch (error) {
    console.error(error);  
  }
}

export const getUnauthenticatedShopId = async (admin: UnauthenticatedAdminContext): Promise<string> => {
  // First, query for the shop's ID
  const shopData = await admin.admin.graphql(`
    query {
      shop {
        id
      }
    }
  `);
  const shopDataJson = await shopData.json();
  const shopGid = shopDataJson.data.shop.id;
  //console.log("Shop GID:", shopGid);
  return shopGid;
}

export const setStoreType = async (admin: AdminApiContext, storeType: string, shopId: string) => {
  const metafields = [{
    namespace: "b2bplus",
    key: "storeType",
    value: storeType,
    type: "single_line_text_field",
    ownerId: shopId
  }];

  //console.log(metafields);

  const mutation = `
    mutation createMetafields($metafields: [MetafieldsSetInput!]!) {
      metafieldsSet(metafields: $metafields) {
        metafields {
          key
          namespace
          value
        }
        userErrors {
          field
          message
        }
      }
    }
  `;

  try {
    const response = await admin.graphql(
      mutation,
      {
        variables: {
          metafields
        }
      }
    );

    if(response.ok){
      return true;
    }else{
        throw new Error(`Error updating customer tags`);
    }
  } catch (error) {
    console.error("Error creating metafields:", error);
    throw error;
  } 
}

export const isSubscriptionActive = async (admin: AdminApiContext | UnauthenticatedAdminContext): Promise<boolean> => {
  const query = `query getShopMetafield($namespace: String!, $key: String!) {
    shop {
      metafield(namespace: $namespace, key: $key) {
        id
        value
      }
    }
  }`;

  const variables = {
    namespace: "b2bplus",
    key: "subscriptionStatus",
  };

  try {

    const response = 'graphql' in admin ? await admin.graphql(query, { variables }) : await admin.admin.graphql(query, { variables });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const responseJson = await response.json();
    if (responseJson.data.errors) {
      throw new Error(`GraphQL errors: ${JSON.stringify(responseJson.data.errors)}`);
    }
  
    const metafield = responseJson.data.shop.metafield;

    //console.log("metafield", metafield);
    if (metafield && metafield.value) {
      // Check if the metafield value indicates an active subscription
      return metafield.value === "ACTIVE";
    } else {
      //console.log("No subscription status metafield found or value is empty.");
      return false; // Return false if the metafield is not found or has no value
    }
  } catch (error) {
    console.error("Error checking subscription status from metafield:", error);
    return false; // Return false if there is an error
  }
};

export const disableAllFeatures = async (shop: string, admin: AdminApiContext) => {
  try {
    await Promise.all([
      updateSettings(admin, "enableTopProducts", "false"),
      updateSettings(admin, "enableComplementaryProducts", "false"),  
      removeAutomaticDiscounts(shop, admin),
    ]);
    //console.log("All settings updated and automatic discounts removed successfully.");
  } catch (error) {
    console.error("Error disabling upsell settings:", error);

    // Get the redirect page from the passed environment variable or default to "/app"
    const redirectPage = process.env.ERROR_REDIRECT_PAGE || '/app';
    return redirect(redirectPage);
  }
};

export const getActiveSubscription = async (request: Request): Promise<any> => {
  const { admin } = await authenticate.admin(request);
  
  try {
    const response = await admin.graphql(`
      #graphql
      query AccessScopeList {
        currentAppInstallation {
          activeSubscriptions {
            id
            lineItems {
              id
            }
            status
            currentPeriodEnd
            name
          }
        }
      }
    `);
    
    const data = await response.json();
    
    // Check if there is an active subscription
    if(data.data.currentAppInstallation.activeSubscriptions){
      const activeSubscriptions = data.data.currentAppInstallation.activeSubscriptions;
      if(!activeSubscriptions) return null;
      for(var i in activeSubscriptions) {
        if(activeSubscriptions[i]['name'] == PORTALSPHERE_SUBSCRIPTION) {
          if(activeSubscriptions[i]['status'] == 'ACTIVE') {
            return activeSubscriptions[i];
          }
        }
      }      
    }
  } catch (error) {
    console.error("Error checking subscription status:", error);
  }

  return null;
};

export const setSubscriptionStatusMetafield = async (request: Request, status: string) => {
  const { admin } = await authenticate.admin(request);
  const shopId = await getShopId(admin);

  const metafieldInput = {
    ownerId: shopId,
    namespace: "b2bplus",
    key: "subscriptionStatus",
    value: status,
    type: "single_line_text_field"
  };

  const mutation = `
    mutation metafieldsSet($metafields: [MetafieldsSetInput!]!) {
      metafieldsSet(metafields: $metafields) {
        metafields {
          id
          namespace
          key
          value
        }
        userErrors {
          field
          message
        }
      }
    }
  `;


  try {
    const response = await admin.graphql(
      mutation,
      {
        variables: {
          metafields: [metafieldInput]
        }
      }
    );

    const result = await response.json();
    const { metafieldsSet } = result.data;

    if (metafieldsSet.userErrors.length > 0) {
      console.error("User errors:", metafieldsSet.userErrors);
      throw new Error("Failed to set subscription status metafield.");
    }

    //console.log(`Successfully set subscription status to: ${status}`);
    return metafieldsSet.metafields; // Return the created or updated metafield
  } catch (error) {
    console.error("Error setting subscription status metafield:", error);
    throw new Error("Failed to set subscription status metafield.");
  }
};
