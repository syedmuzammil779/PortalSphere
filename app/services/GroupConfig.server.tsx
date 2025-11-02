import { AdminApiContext } from "@shopify/shopify-app-remix/server";
import { GraphQLClient } from "node_modules/@shopify/shopify-app-remix/dist/ts/server/clients/types";
import type { AdminOperations } from "node_modules/@shopify/admin-api-client/dist/ts/graphql/types";

export const removeCustomerTag = async (customerId: string, tag: string, admin: AdminApiContext) => {
  try {
    // First, fetch the current tags of the customer
    const getCustomerQuery = `
      query getCustomer($id: ID!) {
        customer(id: $id) {
          tags
        }
      }
    `;

    const getCustomerVariables = { id: customerId };

    const customerResponse = await admin.graphql(getCustomerQuery, { variables: getCustomerVariables });
    const customerResult = await customerResponse.json() as { data?: { customer: { tags: string[] } }, errors?: { message: string }[] };

    if (customerResult.errors && customerResult.errors.length > 0) {
      throw new Error(customerResult.errors[0].message);
    }

    if (!customerResult.data || !customerResult.data.customer) {
      throw new Error('Customer data not found in the response');
    }

    const currentTags = customerResult.data.customer.tags;

    // Remove the specified tag from the current tags
    const updatedTags = currentTags.filter((currentTag: string) => currentTag !== tag);

    // Now update the customer with the new set of tags
    const updateQuery = `
      mutation customerUpdate($input: CustomerInput!) {
        customerUpdate(input: $input) {
          customer {
            id
            tags
          }
          userErrors {
            field
            message
          }
        }
      }
    `;

    const updateVariables = {
      input: {
        id: customerId,
        tags: updatedTags
      }
    };

    const updateResponse = await admin.graphql(updateQuery, { variables: updateVariables });
    const updateResult = await updateResponse.json();

    if (updateResult.data.customerUpdate.userErrors.length > 0) {
      throw new Error(updateResult.data.customerUpdate.userErrors[0].message);
    }

    return updateResult.data.customerUpdate.customer;
  } catch (error) {
    console.error('Error removing customer tag:', error);
    throw error;
  }
}

export async function deriveTagFromSegment(graphql: GraphQLClient<AdminOperations>, groupId: string): Promise<{tag: string, id: string, name: string} | null> {
  try {
      const query = `
          query getSegment($id: ID!) {
              segment(id: $id) {
                  id
                  name
                  query
              }
          }
      `;
      
      const response = await graphql(query, { variables: { id: groupId } });
      const dataJson = await response.json();
      
      if (!dataJson.data.segment) {
          console.error("Segment not found");
          return null;
      }

      const segment = dataJson.data.segment;
      const tag = segment.query.split(" ").slice(-1)[0].replaceAll(/'/g, "");
      
      return {tag, id: segment.id, name: segment.name};
  } catch (error) {
      console.error("Error fetching segment:", error);
      return null; // Return null in case of an error
  }
}