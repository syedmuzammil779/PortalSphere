// app/services/discountCreator.server.ts
import { AdminApiContext } from "@shopify/shopify-app-remix/server";
import { escapeObjectForGraphQL } from "~/helpers/metafieldHelpers";
import { makeAGraphQLAPICallToShopify } from "./CustomFunctions.server";
import { getAccessScopes } from "./DashboardFunctions.server";

export class DiscountCreator {
  /**
   * Get the function ID for B2B volume discount
   */
  public static async getFunctionId(admin: AdminApiContext|null, apiType: string, title: string, dbShop: any|null): Promise<string> {
    try {
      const gQLQuery = `#graphql
      query getFunctions {
        shopifyFunctions(first: 250) {
          nodes {
            apiType
            title
            id
          }
        }
      }`;

      let response, json;
      if(admin) {
        response = await admin.graphql(gQLQuery);
        json = await response.json();
      } else {
        response = await makeAGraphQLAPICallToShopify(dbShop, {query: gQLQuery});
        json = response.respBody;
      }
      
      const b2bFunction = json.data.shopifyFunctions.nodes.find(
        (node: any) => node.apiType === apiType && node.title === title
      );

      if (!b2bFunction) {
        throw new Error("B2B volume discount function not found");
      }

      //console.log(`Found B2B function ID: ${b2bFunction.id}`);
      return b2bFunction.id;
    } catch (error) {
      console.error(`Error getting B2B function ID: ${error}`);
      throw error;
    }
  }

  /**
   * Check if there are any active automatic discounts
   */
  public static async checkExistingDiscounts(admin: AdminApiContext|null, title: string, dbShop: any|null): Promise<boolean> {
    try {

      const gQLQuery = `query discounts {
        discountNodes(first: 1, query: "title:'${title}'") {
          edges {
            node {
              discount {
                ... on DiscountAutomaticApp {
                  title
                  appDiscountType {
                    functionId
                    title
                  }
                }
              }
            }
          }
        }
      }`;

      let response;
      let json;

      if(admin) {
        response = await admin.graphql(gQLQuery);
        json = await response.json();
      } else {
        response = await makeAGraphQLAPICallToShopify(dbShop, {query: gQLQuery});
        json = response.respBody;
      }
      
      const activeDiscounts = json.data.discountNodes.edges.filter(({ node }: any) => node.discount?.title === title);
      return activeDiscounts.length > 0;
    } catch (error) {
      console.error(`Error checking existing discounts: ${error}`);
      throw error;
    }
  }

  /**
   * Create a new automatic discount using B2B function
   */
  static async createAutomaticDiscount(admin: AdminApiContext|null, functionId: string, type: string = "Product", dbShop: any|null): Promise<string> {
    const discountInput = {
        title: `B2B Wholesale Discount`,
        startsAt: new Date().toISOString()
    };
    const productDiscounts = type === "Product" ? false : true
    const shippingDiscounts = type === "Shipping" ? false : true

    try {
      const variables = {
        variables: {
          title: discountInput.title,
          functionId: functionId,
          startsAt: discountInput.startsAt,
          orderDiscounts: true,
          productDiscounts: productDiscounts,
          shippingDiscounts: shippingDiscounts
        }
      } 

      const gQLQuery = `#graphql
        mutation discountCreate($title: String!, $functionId: String!, $startsAt: DateTime!, $orderDiscounts: Boolean!, $productDiscounts: Boolean!, $shippingDiscounts: Boolean!) {
          discountAutomaticAppCreate(
            automaticAppDiscount: {
              title: $title
              functionId: $functionId
              startsAt: $startsAt
              combinesWith: {
                orderDiscounts: $orderDiscounts
                productDiscounts: $productDiscounts
                shippingDiscounts: $shippingDiscounts
              }
            }
          ) {
            automaticAppDiscount {
              discountId
            }
            userErrors {
              field
              message
            }
          }
        }
      `;

      let response;
      let json;
      if(admin) {
        response = await admin.graphql(gQLQuery, variables);
        json = await response.json();
      } else {
        response = await makeAGraphQLAPICallToShopify(dbShop, {query: gQLQuery, variables: variables.variables});
        json = response.respBody;
      }

      const { automaticAppDiscount, userErrors } = json.data.discountAutomaticAppCreate;

      if (userErrors.length > 0) {
        const errorMessage = userErrors.map((e: any) => e.message).join(', ');
        throw new Error(`Failed to create discount: ${errorMessage}`);
      }

      return automaticAppDiscount.discountId;
    } catch (error) {
      console.error(`Error creating automatic discount: ${error}`);
      throw error;
    }
  }

  /**
   * Check for active discounts and create one if none exists
   */
  static async checkAndCreateDiscount(admin: AdminApiContext|null, type: string = "Product", dbShop: any|null): Promise<void> {
    const functionConfig = (type === "Product") ? 
      {type: "product_discounts", title: "b2b-volume-discount"} : 
      {type: "shipping_discounts", title: "portalSphere-shipping-discount"} ;
    
    try {
      const hasAutomaticDiscount = await this.checkExistingDiscounts(admin, `B2B Wholesale Discount`, dbShop);
      if (!hasAutomaticDiscount) {
        const functionId = await this.getFunctionId(admin, functionConfig.type, functionConfig.title, dbShop);
        const newDiscountId = await this.createAutomaticDiscount(admin, functionId, type, dbShop);
      } 
    } catch (error) {
      console.error(`Error in checkAndCreateDiscount: ${error}`);
      throw error;
    }
  }

  static async checkAndCreateShippingDiscountConfig(admin: AdminApiContext|null, shopId: string, dbShop: any|null): Promise<void> {

    const defaultConfig = {
      minimumPurchaseAmount: 0,
      flatRate: 0,
      status: "inactive"
    };

    try {
      const gQLQuery = `
        query getShippingConfig {
          shop {
            metafield(namespace: "b2bplus", key: "shipping-discount-config") {
              id
              value
            }
          }
        }
      `;

      let response, data;
      if(admin) {
        response = await admin.graphql(gQLQuery);
        data = await response.json();
      } else {
        response = await makeAGraphQLAPICallToShopify(dbShop, {query: gQLQuery});
        data = response.respBody;
      }

      // Check if metafield exists      
      // If metafield doesn't exist, create it
      if (!data.data.shop.metafield) {

        const createQuery = `mutation createShippingConfig {
          metafieldsSet(metafields: [
            {
              namespace: "b2bplus"
              key: "shipping-discount-config"
              type: "json"
              value: "${escapeObjectForGraphQL(defaultConfig)}"
              ownerId: "${shopId}"
            }
          ]) {
            metafields {
              id
            }
            userErrors {
              field
              message
            }
          }
        }`;

        let response, responseJson;
        if(admin) {
          response = await admin.graphql(createQuery);
          responseJson = await response.json();
        } else {
          response = await makeAGraphQLAPICallToShopify(dbShop, {query: createQuery});
          responseJson = response.respBody;
        }

        if (responseJson.data.metafieldsSet.userErrors.length > 0) {
          const errorMessage = responseJson.data.metafieldsSet.userErrors.map((e: any) => e.message).join(', ');
          throw new Error(`Failed to create shipping discount config: ${errorMessage}`);
        }
      }
    } catch (error) {
      console.error('Error managing shipping discount config:', error);
      throw error;
    }
  }
}
export class PaymentFunctionCreator {
  public static async getFunctionId(admin: any, apiType: string, title: string): Promise<string> {
    try {
      const gQLQuery = `#graphql
      query getFunctions {
        shopifyFunctions(first: 250) {
          nodes {
            apiType
            title
            id
          }
        }
      }`;

      let response = await admin.request(gQLQuery);
      
      const b2bFunction = response.data.shopifyFunctions.nodes.find(
        (node: any) => node.apiType === apiType && node.title === title
      );

      if (!b2bFunction) {
        throw new Error("B2B volume discount function not found");
      }

      return b2bFunction.id;
    } catch (error) {
      console.error(`Error getting B2B function ID: ${error}`);
      throw error;
    }
  }
  /**
   * Get all the current payment customizations currently on shopify admin
   * @param admin 
   */
  public static async getResource(admin: any) {
    try {
      const query = `
        query {
          paymentCustomizations(first:25) {
            edges {
              node {
                id
                functionId
                enabled
                title
                shopifyFunction {
                  id
                  title
                }
              }
            }
          }
        }
      `;

      const response = await admin.request(query);
      console.log('response', JSON.stringify(response.data));

      return response;
    } catch (error: any) {
      console.log('error message in get resource');
      console.log(error.message);
    }

    return null;
  }

  public static async createPaymentFunction(admin: any) {
    try {
      const accessScopes = await getAccessScopes(admin);
      const hasPermission = accessScopes != null && (accessScopes.includes('read_payment_customizations') || accessScopes.includes('write_payment_customizations'));
      if(!hasPermission) return;

      const existingPaymentDiscounts = await this.getResource(admin);
      if(existingPaymentDiscounts != null && existingPaymentDiscounts.data.paymentCustomizations.edges) {
        const edges = existingPaymentDiscounts.data.paymentCustomizations.edges;
        if(edges.length > 0) {
          console.log('Found one already!');
          return true;
        }
      }
      console.log('creating one now');
      const mutation = `
        mutation paymentCustomizationCreate($paymentCustomization: PaymentCustomizationInput!) {
          paymentCustomizationCreate(paymentCustomization: $paymentCustomization) {
            paymentCustomization {
              id
              functionId
              enabled
              title
            }
            userErrors {
              field
              message
            }
          }
        }
      `;

      const functionId = await this.getFunctionId(admin, 'payment_customization', 'payment-customization');
      const inputQuery = {
        variables: {
          paymentCustomization: {
            enabled: true,
            functionId: functionId,
            title: "PortalSphere Net Terms Function"
          }
        }
      };

      const response = await admin.request(mutation, inputQuery);
      console.log('response for creating payment function', JSON.stringify(response.data));
    } catch (error:any) {
      console.log('error in creating payment function', error.message);
    }

    return true;
  }
}

