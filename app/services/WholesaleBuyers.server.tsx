import type { WholesalePricingBuyers } from "@prisma/client";
// @ts-ignore
import SibApiV3Sdk from 'sib-api-v3-sdk';
import db from "../db.server";
import { uuidv7 } from "uuidv7";
import crypto from "crypto";
import type { FieldError } from "~/models/FieldError";
import type { WholesaleBuyersRequest, WholesaleBuyersResponse } from "~/models/WholesaleBuyersParams";
import type { GraphQLClient } from "node_modules/@shopify/shopify-app-remix/dist/ts/server/clients/types";
import type { AdminOperations } from "node_modules/@shopify/admin-api-client/dist/ts/graphql/types";
import type { AdminApiContext } from "@shopify/shopify-app-remix/server";
import { deriveTagFromSegment } from "./GroupConfig.server";
// import { readFile } from "fs/promises";
// import path from "path";
import Mustache from "mustache";
import { CUSTOMER_TAG } from "./CustomerGroups.server";
const pageLink = "wholesale-registration";

export interface WholesalePricingBuyersWithGroup extends WholesalePricingBuyers {
    customerGroup?: string; // Append the customerGroup field 
}

export const getWholesalerRegistrationPage = async (
    admin: AdminApiContext
): Promise<string | null> => {
    try {
        const query = `
            query {
                pages(first: 250) {
                    nodes {
                        id
                        title
                        handle
                        body
                    }
                }
            }
        `;

        const response = await admin.graphql(query);
        const responseJson = await response.json();
        const page = responseJson?.data?.pages?.nodes?.find(
            (page: any) => page.handle === pageLink
        );

        if (page) {
            //console.log('Page does exist already for wholesale registration');
            return page.id;
        }

        console.error("Wholesaler registration page not found");
        return null;
    } catch (error) {
        console.error("Error fetching wholesaler registration page:", error);
        console.error("Stack trace:", error instanceof Error ? error.stack : "No stack trace available");
        return null;
    }
};

export const updateWholesalerRegistrationForm = async (
    shop: string,
    admin: AdminApiContext,
    requestUrl: string
): Promise<void> => {
    try {
        const existingPageId = await getWholesalerRegistrationPage(admin);
        const SHOPIFY_API_KEY = process.env.SHOPIFY_API_KEY;
        const SHOPIFY_API_SECRET = process.env.SHOPIFY_API_SECRET;
        const timestamp = Math.floor(Date.now() / 1000);
        const message = (SHOPIFY_API_KEY ?? "") + timestamp;
        const hmac = crypto.createHmac("sha256", SHOPIFY_API_SECRET || "").update(message).digest("hex");

        //The `wholesale_template` column in Session table has default value 'default'.

        const dbRecord = await db.session.findFirst({
            where: { shop: shop },
            select: { id: true, shop: true, wholesale_template: true }
        });

        const templateName = dbRecord?.wholesale_template || 'default';
        //The new logic checks in DB and then dynamically renders mustache files
        const template = await db.wholesaleRegFormTemplates.findUnique({
            where: { name: templateName },
        });

        if (!template) {
            return;
        }
        
        const data = {
            shop: shop,
            SHOPIFY_API_KEY: SHOPIFY_API_KEY,
            timestamp: timestamp,
            hmac: hmac,
            requestUrl: requestUrl
        }
        
        const htmlbody = template.content ? Mustache.render(template.content, data) : null; 
        
        if(htmlbody) {
            if (!existingPageId && template.content) {
                const createPageMutation = `
                    mutation createPage {
                        pageCreate(
                            page: { title: "Wholesaler Registration", body: ${JSON.stringify(htmlbody)}, handle: "${pageLink}" }
                        ) {
                            page { id }
                            userErrors { field message }
                        }
                    }
                `;

                const response = await admin.graphql(createPageMutation);
                const responseJson = await response.json();

                if (responseJson?.data?.pageCreate?.userErrors?.length) {
                    throw new Error(
                        `Failed to create page: ${responseJson.data.pageCreate.userErrors[0].message}`
                    );
                }
            } else {
                const updatePageMutation = `mutation updatePage($id: ID!, $input: PageUpdateInput!) {
                    pageUpdate(id: $id, page: $input) {
                        page { id }
                        userErrors { field message }
                    }
                }`;

                const response = await admin.graphql(updatePageMutation, {
                    variables: {
                        id: existingPageId,
                        input: {
                            body: htmlbody,
                            title: "Wholesale Registration",
                            handle: pageLink
                        }
                    }
                });

                const responseJson = await response.json();

                if (responseJson?.data?.pageUpdate?.userErrors?.length) {
                    throw new Error(
                        `Failed to update page: ${responseJson.data.pageUpdate.userErrors[0].message}`
                    );
                }
            }
        }
    } catch (error) {
        console.error("Error updating wholesaler registration form:", error);
        console.error("Stack trace:", error instanceof Error ? error.stack : "No stack trace available");
        throw error;
    }
};

export const getWholesaleBuyers = async (
    shop: string,
    params: WholesaleBuyersRequest
): Promise<WholesaleBuyersResponse> => {
    try {
        const buyers = await db.wholesalePricingBuyers.findMany({
            where: { shop },
            skip: (params.page - 1) * params.size,
            take: params.size,
            orderBy: { [params.sortBy ?? "productTitle"]: params.order ?? "asc" },
        });

        const [rejectedTotal, approvedTotal, pendingTotal] = await Promise.all([
            db.wholesalePricingBuyers.count({
                where: { shop, status: { equals: "Rejected" } },
            }),
            db.wholesalePricingBuyers.count({
                where: { shop, status: { equals: "Approved" } },
            }),
            db.wholesalePricingBuyers.count({
                where: { shop, status: { equals: "Pending" } },
            }),
        ]);

        const totalBuyers = rejectedTotal + approvedTotal + pendingTotal;
        const totalPages = Math.ceil(totalBuyers / params.size);
        
        return {
            ...params,
            totalBuyers,
            totalPages,
            shop,
            buyers,
            rejectedTotal,
            approvedTotal,
            pendingTotal,
        };
    } catch (error) {
        console.error("Error getting wholesale buyers:", error);
        console.error("Stack trace:", error instanceof Error ? error.stack : "No stack trace available");
        throw error;
    }
};

export const addWholesalePricingBuyers = async (
    shop: string,
    buyer: WholesalePricingBuyers,
    extraData: any
): Promise<FieldError[] | void> => {
    try {
        await db.wholesalePricingBuyers.create({
            data: {
                ...buyer,
                id: `${shop}/${uuidv7()}`,
                shop,
                createdAt: new Date(),
                modifiedAt: new Date(),
                status: "Pending",
                info: JSON.stringify(extraData)
            },
        });
    } catch (error) {
        console.error("Error adding wholesale pricing buyers:", error);
        console.error("Stack trace:", error instanceof Error ? error.stack : "No stack trace available");
        throw error;
    }
};

export const rejectWholesalePricingBuyers = async (
    buyers: WholesalePricingBuyers[],
    graphql: GraphQLClient<AdminOperations>
): Promise<void> => {
    try {
        for (const buyer of buyers) {
            if (buyer.shopifyCustomerId) {
                const removeTagMutation = `
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

                const variables = {
                    variables: {
                        input: {
                            id: buyer.shopifyCustomerId,
                            tags: [],
                        },
                    },
                };

                const response = await graphql(removeTagMutation, variables);
                const responseJson = await response.json();

                if (responseJson?.data?.customerUpdate?.userErrors?.length) {
                    throw new Error(
                        `Failed to update customer: ${responseJson.data.customerUpdate.userErrors[0].message}`
                    );
                }
            }

            await db.wholesalePricingBuyers.update({
                where: { id: buyer.id },
                data: {
                    status: "Rejected",
                    modifiedAt: new Date(),
                },
            });
        }
    } catch (error) {
        console.error("Error rejecting wholesale pricing buyers:", error);
        console.error("Stack trace:", error instanceof Error ? error.stack : "No stack trace available");
        throw error;
    }
};

export const approveWholesalePricingBuyers = async (
    buyers: WholesalePricingBuyersWithGroup[],
    graphql: GraphQLClient<AdminOperations>
): Promise<void> => {
    for (const buyer of buyers) {
        if(buyer.emailAddress) {
            let shopifyCustomerId = await getCustomerIdFromShopify(
                buyer.emailAddress,
                graphql
            );

            const tagInfo = await deriveTagFromSegment(graphql, buyer.customerGroup ?? '');
            if (!tagInfo) {
                throw new Error(`Could not derive tag info for customer group: ${buyer.customerGroup}`);
            }

            const groupTag = tagInfo.tag;
            if (!shopifyCustomerId) {
                // create shopify customer if email does not exist
                const createCustomerMutation = `
                    mutation CreateCustomer($input: CustomerInput!) {
                        customerCreate(input: $input) {
                            customer {
                                id
                                email
                                firstName
                                lastName
                                taxExempt
                                tags
                            }
                            userErrors {
                                field
                                message
                            }
                        }
                    }
                `;
                const variables = {
                    variables: {
                        input: {
                            email: buyer.emailAddress,
                            firstName: buyer.contactFirstName,
                            lastName: buyer.contactLastName,
                            taxExempt: true,
                            addresses: [{
                                address1: buyer.companyAddress,
                                phone: buyer.phoneNumber
                            }],
                            tags: [`${groupTag}`],
                            metafields: [{
                                namespace: CUSTOMER_TAG,
                                key: "group_tag",
                                value: groupTag,
                                type: "single_line_text_field",
                            }]
                        },
                    },
                };
                const response = await graphql(createCustomerMutation, variables);
                const responseJson: any = await response.json();
                //console.debug('create customer response', JSON.stringify(responseJson));
                if (responseJson?.data?.customerCreate?.userErrors?.length) {
                    throw new Error(
                        `Failed to create customer ${responseJson.customerCreate.userErrors[0].message}`
                    );
                }
                shopifyCustomerId =
                    responseJson?.data?.customerCreate?.customer?.id;
            } else {
                const updateCustomerMutation = `
                    mutation UpdateCustomer($input: CustomerInput!) {
                        customerUpdate(input: $input) {
                            customer {
                                id
                                email
                                firstName
                                lastName
                                taxExempt
                                tags
                            }
                            userErrors {
                                field
                                message
                            }
                        }
                    }
                `;
                const variables = {
                    variables: {
                        input: {
                            id: shopifyCustomerId,
                            email: buyer.emailAddress,
                            firstName: buyer.contactFirstName,
                            lastName: buyer.contactLastName,
                            taxExempt: true,
                            addresses: [{
                                address1: buyer.companyAddress,
                                phone: buyer.phoneNumber
                            }],
                            tags: [`${groupTag}`],
                            metafields: [{
                                namespace: CUSTOMER_TAG,
                                key: "group_tag",
                                value: groupTag,
                                type: "single_line_text_field",
                            }]
                        }
                    }
                };
                const response = await graphql(updateCustomerMutation, variables);
                const responseJson: any = await response.json();
                //console.debug('update response', JSON.stringify(responseJson));
                if (responseJson?.data?.customerCreate?.userErrors?.length) {
                    throw new Error(
                        `Failed to update customer ${responseJson.customerCreate.userErrors[0].message}`
                    );
                }
            }
            
            try {
                if (buyer.emailAddress && shopifyCustomerId) {
                    await sendShopifyInviteEmail(shopifyCustomerId, graphql);
                }
            } catch (error) {
                console.error("Error sending Shopify invite email:", error);
            }

            const { customerGroup, ...buyerWithoutGroup } = buyer;

            await db.wholesalePricingBuyers.upsert({
                where: { id: buyerWithoutGroup.id },
                create: {
                    ...buyerWithoutGroup,
                    id: buyerWithoutGroup.id,
                    locationCount: buyer.locationCount ? Number.parseInt(buyer.locationCount.toString()) : 0,
                    status: "Approved",
                    modifiedAt: new Date(),
                    shopifyCustomerId: shopifyCustomerId ?? "none",
                },
                update: {
                    ...buyerWithoutGroup,
                    locationCount: buyer.locationCount ? Number.parseInt(buyer.locationCount.toString()) : 0,
                    status: "Approved",
                    modifiedAt: new Date(),
                    shopifyCustomerId: shopifyCustomerId ?? "none",
                },
            });
        }
    }
    //Todo code to send email
};

export const checkCustomerExistsOnShopify = async (
    email: string,
    graphql: GraphQLClient<AdminOperations>
): Promise<boolean> => {
    const query = `
        query ($email: String!) {
        customers(first: 1, query: $email) {
            edges {
            node {
                id
            }
            }
        }
        }
    `;

    const variables = { variables: { email } };
    const response = await graphql(query, variables);

    const responseJson: any = await response.json();
    //console.debug(responseJson);
    return responseJson.data.customers.edges.length > 0;
};

export const getCustomerIdFromShopify = async (
    email: string,
    graphql: GraphQLClient<AdminOperations>
): Promise<string | null> => {
    const query = `
        query ($email: String!) {
        customers(first: 1, query: $email) {
            edges {
            node {
                id
            }
            }
        }
        }
    `;

    const variables = { variables: { email } };
    const response = await graphql(query, variables);

    const responseJson: any = await response.json();
    //console.debug(JSON.stringify(responseJson));
    if (responseJson.data.customers.edges.length > 0) {
        return responseJson.data.customers.edges[0].node.id;
    }
    return null;
};

export const validateBuyer = (buyer: WholesalePricingBuyers): FieldError[] => {
    const errors: FieldError[] = [];
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const phoneRegex = /^\+?[1-9]\d{1,14}$/;

    if (!buyer.companyName) {
        errors.push({
            field: "companyName",
            error: "Company Name is required",
        });
    }
    if (!buyer.companyAddress) {
        errors.push({
            field: "companyAddress",
            error: "Company Address is required",
        });
    }
    if (!buyer.contactFirstName) {
        errors.push({
            field: "contactFirstName",
            error: "First Name is required",
        });
    }
    if (!buyer.contactLastName) {
        errors.push({
            field: "contactLastName",
            error: "Last Name is required",
        });
    }
    if (!buyer.emailAddress || !emailRegex.test(buyer.emailAddress)) {
        errors.push({
            field: "emailAddress",
            error: "Email Address is invalid",
        });
    }
    if (!buyer.phoneNumber || !phoneRegex.test(buyer.phoneNumber)) {
        errors.push({
            field: "phoneNumber",
            error: "Phone Number is required",
        });
    }
    if (!buyer.locationCount || buyer.locationCount <= 0) {
        errors.push({
            field: "locationCount",
            error: "Location Owned/Services is invalid",
        });
    }
    return errors;
};

export const removeAllWholesaleBuyers = async (shop: string): Promise<void> => {
    try {
        await db.wholesalePricingBuyers.deleteMany({
            where: {
                shop: shop,
            },
        });
        //console.debug("Wholesale Buyers deleted");
    } catch (error) {
        console.error("Error deleting wholesale buyers:", error);
        throw new Error(`Failed to delete wholesale buyers for shop ${shop}`);
    }
};

export const removeWholesaleBuyerByEmail = async (
    shop: string,
    emailAddress: string
): Promise<void> => {
    try {
        const result = await db.wholesalePricingBuyers.deleteMany({
            where: {
                shop: shop,
                emailAddress: emailAddress,
            },
        });

        if (result.count === 0) {
            throw new Error(
                `No wholesale buyer found with email ${emailAddress} for shop ${shop}`
            );
        }
    } catch (error) {
        console.error("Error deleting wholesale buyer:", error);
        throw error;
    }
};


export const checkPendingWholesaleBuyerByEmail = async (email: string, shop: string): Promise<boolean> => {
    try {
        const buyer = await db.wholesalePricingBuyers.findFirst({
            where: {
                emailAddress: email,
                shop: shop,
                status: "Pending",
            },
        });

        // Return true if a pending buyer is found, otherwise false
        return buyer !== null;
    } catch (error) {
        console.error("Error checking pending wholesale buyer by email:", error);
        console.error("Stack trace:", error instanceof Error ? error.stack : "No stack trace available");
        throw error; // Rethrow the error for handling in the calling function
    }
};

export const hasApprovedOrRejectedWholesaleBuyer = async (
    shop: string,
): Promise<boolean> => {
    try {
        const result = await db.wholesalePricingBuyers.findFirst({
            where: {
                shop: shop,
                status: {
                    in: ["Approved", "Rejected"],
                },
            },
        });

        return result !== null;
    } catch (error) {
        console.error("Error checking wholesale buyer status:", error);
        throw error;
    }
};

export async function getStoreOwnerEmail(admin: any): Promise<string> {
    try {
      const response = await admin.graphql(`
        query {
          shop {
            email
          }
        }
      `);
      
      const responseJson = await response.json();
      return responseJson.data.shop.email;
    } catch (error) {
      console.error('Error fetching store owner email:', error);
      return process.env.FALLBACK_EMAIL || 'devs@b2bplus.io';
    }
  }

  export async function sendWholesaleRegistrationEmail(
    formData: Partial<WholesalePricingBuyers>, 
    shopDomain: string,
    notificationEmails: string[],
    ignoreLocationAndBuyerCount: Boolean,
    extraData: any|null
  ): Promise<boolean> {
    try {
      // Configure the Brevo API client
      const appName = process.env.APP_NAME || 'portalsphereb2b';
      const defaultClient = SibApiV3Sdk.ApiClient.instance;
      const apiKey = defaultClient.authentications['api-key'];
      apiKey.apiKey = process.env.BREVO_API_KEY || '';
      
      if (!process.env.BREVO_API_KEY) {
        console.error('Missing BREVO_API_KEY in environment variables');
        return false;
      }
      
      // If no email was provided, log error and return
      if (!notificationEmails || notificationEmails.length === 0) {
        console.error(`No email provided for store ${shopDomain}`);
        return false;
      }
      
      // Create a new email API instance
      const apiInstance = new SibApiV3Sdk.TransactionalEmailsApi();
      
      // Set up the email content
      const sender = {
        email: process.env.NOTIFICATION_EMAIL || 'notifications@b2bplus.io',
        name: 'PortalSphere Notifications'
      };

      const storeName = shopDomain.split('.')[0];

      let extraDataHTML = '';
      if(extraData != null) {
        for(var key in extraData) {
            extraDataHTML += `
                <tr>
                    <td style="border: 1px solid #dddddd; padding: 8px;">${key.split('_').filter(Boolean).map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()).join(' ')}</td>
                    <td style="border: 1px solid #dddddd; padding: 8px;">${extraData[key]}</td>
                </tr>    
            `;
        }
      }

      let locationAndBuyerCountHTML;
      if(ignoreLocationAndBuyerCount) {
        locationAndBuyerCountHTML = null;
      } else {
        locationAndBuyerCountHTML = `
            <tr>
                <td style="border: 1px solid #dddddd; padding: 8px;">Buyer Type</td>
                <td style="border: 1px solid #dddddd; padding: 8px;">${formData.buyerType ? formData.buyerType : 'N/A'}</td>
            </tr>
            <tr>
                <td style="border: 1px solid #dddddd; padding: 8px;">Location Count</td>
                <td style="border: 1px solid #dddddd; padding: 8px;">${formData.locationCount ? formData.locationCount : 'N/A'}</td>
            </tr>
        `;
      }

      const formattedData = `
      <tr>
        <td style="border: 1px solid #dddddd; padding: 8px;">Company Name</td>
        <td style="border: 1px solid #dddddd; padding: 8px;">${formData.companyName}</td>
      </tr>
      <tr>
        <td style="border: 1px solid #dddddd; padding: 8px;">Company Address</td>
        <td style="border: 1px solid #dddddd; padding: 8px;">${formData.companyAddress}</td>
      </tr>      
      <tr>
        <td style="border: 1px solid #dddddd; padding: 8px;">Contact Name</td>
        <td style="border: 1px solid #dddddd; padding: 8px;">${formData.contactFirstName} ${formData.contactLastName}</td>
      </tr>
      <tr>
        <td style="border: 1px solid #dddddd; padding: 8px;">Email</td>
        <td style="border: 1px solid #dddddd; padding: 8px;">${formData.emailAddress}</td>
      </tr>
      <tr>
        <td style="border: 1px solid #dddddd; padding: 8px;">Phone Number</td>
        <td style="border: 1px solid #dddddd; padding: 8px;">${formData.phoneNumber}</td>
      </tr>
      ${locationAndBuyerCountHTML}
      ${extraDataHTML}
      `;

      // Create the email
      const email = {
        sender,
        to: notificationEmails.map(email => ({ email })),
        subject: 'New wholesale registration request',
        htmlContent: `
            <h2>New wholesale registration request for ${storeName}</h2>
            <p>A new customer has submitted a wholesale registration request from your store.</p>
            <p>You can review this request in your Shopify admin at: 
                <a href="https://admin.shopify.com/store/${storeName}/apps/${appName}/app/wholesaleportalaccess"><b>PortalSphere Admin: Wholesale Portal</b></a>
            </p>
            <h2>Customer Information:</h2>
            <table style="width: 100%; border-collapse: collapse;">
                <thead>
                <tr>
                    <th style="border: 1px solid #dddddd; padding: 8px; text-align: left;">Field</th>
                    <th style="border: 1px solid #dddddd; padding: 8px; text-align: left;">Value</th>
                </tr>
                </thead>
                <tbody>
                ${formattedData}
                </tbody>
            </table>
        `
      };
      
      // Send the email
      await apiInstance.sendTransacEmail(email);
      return true;
    } catch (error) {
      console.error('Error sending wholesale registration email:', error);
      return false;
    }
  }

export const sendShopifyInviteEmail = async (
    shopifyCustomerId: string,
    graphql: GraphQLClient<AdminOperations>
): Promise<void> => {
    const inviteCustomerMutation = `
        mutation CustomerSendAccountInviteEmail($customerId: ID!) {
            customerSendAccountInviteEmail(customerId: $customerId) {
                customer {
                    id
                }
                userErrors {
                    field
                    message
                }
            }
        }
    `;

    const response = await graphql(inviteCustomerMutation, {
        variables: {
            customerId: shopifyCustomerId, // Use the Shopify customer ID
        },
    });

    const responseJson: any = await response.json();

    if (responseJson?.data?.customerSendAccountInviteEmail?.userErrors?.length) {
        throw new Error(
            `Failed to send invite email: ${responseJson.customerSendAccountInviteEmail.userErrors[0].message}`
        );
    }
};