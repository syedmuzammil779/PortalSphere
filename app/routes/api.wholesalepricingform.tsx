import type { WholesalePricingBuyers } from "@prisma/client";
import { type ActionFunctionArgs, json, type LoaderFunctionArgs } from "@remix-run/node";
import crypto from "crypto";
import { checkCustomerByEmail } from "~/services/Customers.server";
import { getSettings } from "~/services/Settings.server";
import { addWholesalePricingBuyers, checkPendingWholesaleBuyerByEmail, getStoreOwnerEmail, sendWholesaleRegistrationEmail } from "~/services/WholesaleBuyers.server";
import { unauthenticated } from "~/shopify.server";
import { handleCors } from "~/utils/cors.server";
import prisma from "~/db.server";

const SHOPIFY_API_KEY = process.env.SHOPIFY_API_KEY;
const SHOPIFY_API_SECRET = process.env.SHOPIFY_API_SECRET;
const TIME_WINDOW = 43800 * 60 * 6; // 6 months

//Helper function to capture any other data coming into the request from wholesale registration
function filterObject(inputObj: object, keysToIgnore: any) {
  return Object.fromEntries(Object.entries(inputObj).filter(([key]) => !keysToIgnore.includes(key)));
}

// Helper function to validate request parameters
function validateRequestParams(jsonData: any) {
    const requiredParams = ['shop', 'api_key', 'timestamp', 'hmac'];
    for (const param of requiredParams) {
        if (!jsonData[param]) {
            throw new Error(`Missing required parameter: ${param}`);
        }
    }
}

// Helper function to verify API key and HMAC
function verifyRequest(params: any) {
    const apiKey = params.api_key;
    const timestamp = params.timestamp;
    const hmac = params.hmac;

    if (apiKey !== SHOPIFY_API_KEY) {
        throw new Error("Invalid API key");
    }

    const currentTime = Math.floor(Date.now() / 1000);
    if (Math.abs(currentTime - parseInt(timestamp)) > TIME_WINDOW) {
        throw new Error("Request expired");
    }

    const message = apiKey + timestamp;
    const calculatedHmac = crypto
        .createHmac("sha256", SHOPIFY_API_SECRET || '')
        .update(message)
        .digest("hex");

    if (calculatedHmac !== hmac) {
        throw new Error("Invalid signature");
    }
}

function validateFormDataLittleTraverse(data: any): string[] {
    const errors: string[] = [];
    
    if (!data.companyName || data.companyName.trim() === '') {
        errors.push('Company Name is required');
    }

    if (!data.companyAddress || data.companyAddress.trim() === '') {
        errors.push('Company Address is required');
    }

    if (!data.contactFirstName || data.contactFirstName.trim() === '') {
        errors.push('Contact First Name is required');
    }

    if (!data.contactLastName || data.contactLastName.trim() === '') {
        errors.push('Contact Last Name is required');
    }

    if (!data.emailAddress || data.emailAddress.trim() === '') {
        errors.push('Email Address is required');
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.emailAddress)) {
        errors.push('Invalid Email Address');
    }

    if (!data.phoneNumber && data.phoneNumber !== '') {
        errors.push('Phone Number is required = phonenumber');
    } else {
        const cleanedPhoneNumber = data.phoneNumber.replace(/\D/g, '');
        if (cleanedPhoneNumber.length === 0) {
            errors.push('Phone Number is required - cleanedphonenumber');
        } else if (cleanedPhoneNumber.length !== 10) {
            errors.push(`Invalid Phone Number (must be 10 digits, got ${cleanedPhoneNumber.length})`);
        } 
    }
    
    return errors;
}

// Function to validate form data
function validateFormData(data: Partial<WholesalePricingBuyers>): string[] {
    const errors: string[] = [];
    
    if (!data.companyName || data.companyName.trim() === '') {
        errors.push('Company Name is required');
    }

    if (!data.companyAddress || data.companyAddress.trim() === '') {
        errors.push('Company Address is required');
    }

    if (!data.contactFirstName || data.contactFirstName.trim() === '') {
        errors.push('Contact First Name is required');
    }

    if (!data.contactLastName || data.contactLastName.trim() === '') {
        errors.push('Contact Last Name is required');
    }

    if (!data.emailAddress || data.emailAddress.trim() === '') {
        errors.push('Email Address is required');
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.emailAddress)) {
        errors.push('Invalid Email Address');
    }

    if (!data.phoneNumber && data.phoneNumber !== '') {
        errors.push('Phone Number is required = phonenumber');
    } else {
        const cleanedPhoneNumber = data.phoneNumber.replace(/\D/g, '');
        if (cleanedPhoneNumber.length === 0) {
            errors.push('Phone Number is required - cleanedphonenumber');
        } else if (cleanedPhoneNumber.length !== 10) {
            errors.push(`Invalid Phone Number (must be 10 digits, got ${cleanedPhoneNumber.length})`);
        } 
    }

    if (!data.buyerType || data.buyerType.trim() === '') {
        errors.push('Buyer Type is required');
    }

    if (!data.locationCount || data.locationCount <= 0) {
        errors.push('Location Count must be greater than 0');
    }
    return errors;
}

export const action = async ({ request }: ActionFunctionArgs) => {
    const corsResponse = handleCors(request);
  
    if (corsResponse instanceof Response) {
        return corsResponse;
    }
  
    // Handle OPTIONS request
    if (request.method === "OPTIONS") {
        return new Response(null, { headers: corsResponse });
    }

    try {
        // Get all data from JSON body
        const jsonData = await request.json();

        if(!jsonData.shop) {
            throw new Error('Shop is required!');
        }

        const shop = jsonData.shop;
        const sessionRecord = await prisma.session.findFirst({
            where: {shop: jsonData.shop}
        });

        if(!sessionRecord) {
            throw new Error('Shop Record doesnt exist!');
        }

        // Verify API authentication parameters from JSON for little traverse
        validateRequestParams(jsonData);
        verifyRequest(jsonData);

        let keysToIgnore;
        let storesToIgnore = ['portalsphere-test-store.myshopify.com', 'portalsphere-demo-store.myshopify.com', 'little-traverse-tileworks.myshopify.com'];

        if(storesToIgnore.includes(sessionRecord.shop)) {
            //Different set of keys to come for little traverse
            keysToIgnore = [
                'shop', 'api_key', 'timestamp', 'hmac', 'companyName', 
                'companyAddress', 'contactFirstName', 'contactLastName',
                'emailAddress', 'phoneNumber'
            ];
        } else {
            keysToIgnore = [
                'shop', 'api_key', 'timestamp', 'hmac', 'companyName', 
                'companyAddress', 'contactFirstName', 'contactLastName',
                'emailAddress', 'phoneNumber', 'buyerType', 'locationCount'
            ];
        }

        const extraData = filterObject(jsonData, keysToIgnore);            
        const { admin } = await unauthenticated.admin(jsonData.shop);

        const data: Partial<WholesalePricingBuyers> = {
            companyName: jsonData.companyName || '',
            companyAddress: jsonData.companyAddress || '',
            contactFirstName: jsonData.contactFirstName || '',
            contactLastName: jsonData.contactLastName || '',
            emailAddress: jsonData.emailAddress || '',
            phoneNumber: jsonData.phoneNumber || '',
            buyerType: jsonData.buyerType || '',
            locationCount: parseInt(String(jsonData.locationCount || '0'), 10),
            shop: jsonData.shop || '',  // Now getting shop from JSON data
            status: "pending",
            createdAt: new Date(),
            modifiedAt: new Date(),
            shopifyCustomerId: null,
        };

        if(storesToIgnore.includes(sessionRecord.shop)) {
            delete data.buyerType;
            delete data.locationCount;
        }

        // Validate form data
        const validationErrors = storesToIgnore.includes(sessionRecord.shop) ? validateFormDataLittleTraverse(data):validateFormData(data);
        if (validationErrors.length > 0) {
            return json({ errors: validationErrors }, { status: 400, headers: corsResponse });
        }

        // Check if the customer already exists on Shopify
        const hasPendingWholesaleBuyer = await checkPendingWholesaleBuyerByEmail(data.emailAddress as string, jsonData.shop);
        if (hasPendingWholesaleBuyer) {
            return json({ errors: [`Account with email ${data.emailAddress} has existing pending approval in ${jsonData.shop}`] }, { status: 400, headers: corsResponse });
        }

        // Check if the customer already exists on Shopify
        const customerExists = await checkCustomerByEmail(admin, data.emailAddress as string, true);
        if (customerExists) {
            return json({ errors: [`Wholesale account with email ${data.emailAddress} already exists in Shopify Store ${jsonData.shop}`] }, { status: 400, headers: corsResponse });
        }
        
        // If validation passes, add the new wholesale pricing buyer
        const errors = await addWholesalePricingBuyers(jsonData.shop, data as WholesalePricingBuyers, extraData);
        if (errors && errors.length > 0) {
            return json({ errors }, { status: 400, headers: corsResponse });
        }

        const storeOwnerEmail = await getStoreOwnerEmail(admin);
        const savedNotificationEmails = (await getSettings(admin, "notificationEmails")) || "";
        const notificationEmails = savedNotificationEmails.split(',').filter(email => email.trim());

        // Add storeOwnerEmail to notificationEmails if it's not already included
        if (storeOwnerEmail && !notificationEmails.includes(storeOwnerEmail)) {
            notificationEmails.push(storeOwnerEmail);
        }

        if(process.env.NODE_ENV == 'production') { //Only send emails in production environment
            const emailSent = await sendWholesaleRegistrationEmail(data, jsonData.shop, notificationEmails, storesToIgnore.includes(sessionRecord.shop), extraData);

            if (!emailSent) {
                console.error('Failed to send email notification to store owner');
            }
        }
        
        // Successful response
        return json({ success: true }, { headers: corsResponse });
    } catch (error) {
        console.error('Error in loader:', error);
        return json({ error: (error as Error).message }, { status: 400, headers: corsResponse });
    }
};

export const loader = async ({ request }: LoaderFunctionArgs) => {
    const corsResponse = handleCors(request);
  
    if (corsResponse instanceof Response) {
        return corsResponse;
    }
  
    // Handle OPTIONS request
    if (request.method === "OPTIONS") {
        return new Response(null, { headers: corsResponse });
    }

    try {
        // Get all data from URL parameters
        const url = new URL(request.url);
        const params = Object.fromEntries(url.searchParams);
        
        // Verify API authentication parameters from URL
        validateRequestParams(params);
        verifyRequest(params);

        // Successful response with CORS headers
        return json({ success: true }, { headers: corsResponse });
    } catch (error) {
        console.error('Error in loader:', error);
        // Return error response with CORS headers
        return json({ error: (error as Error).message }, { status: 400, headers: corsResponse });
    }
};
