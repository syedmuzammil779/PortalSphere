import { redirect, json, type ActionFunction, type LoaderFunction } from '@remix-run/node';
import { authenticate } from '~/shopify.server';
import prisma from '~/db.server';
import axios from 'axios';
import { sendSlackNotification } from '~/services/CustomFunctions.server';

export const loader: LoaderFunction = () => {
  return json({ error: 'Method Not Allowed' }, { status: 405 });
};

export const action: ActionFunction = async ({ request }) => {
  try {
    const { session, admin } = await authenticate.admin(request);
    const { shop } = session;
    const reqBody = await request.formData();
    const formObject = formDataToObject(reqBody);

    if(!formObject.first_name || !formObject.last_name || !formObject.email) {
      return redirect('/app/complete-info-form');
    }

    const webhookURL = process.env.N8N_WEBHOOK_URL || `https://portalsphere.app.n8n.cloud/webhook/merchant-onboard`;
    const reqResult = await axios.post(webhookURL, reqBody, {headers: {"Content-Type": "application/json", "Accept": "application/json"}})
    .then((res) => {
      return {
        "status": true,
        "respBody": res.data
      };
    })
    .catch(function (error) {
      if (error.response) {
        return {
          "status": false,
          "respBody": error.response.data,
          "statusCode": error.response.status
        }
      } else {
        return {
          "status": false,
          "message": "ERROR",
          "respBody": error
        }
      }
    });

    //Now save the data
    await prisma.shopKlaviyoRecords.create({
      data: {
        status: reqResult != null && reqResult.hasOwnProperty('status') && reqResult.status === true,
        shop: shop,
        first_name: formObject != null && formObject.hasOwnProperty('first_name') ? formObject.first_name : '',
        last_name: formObject != null && formObject.hasOwnProperty('last_name') ? formObject.last_name : '',
        email: formObject != null && formObject.hasOwnProperty('email') ? formObject.email : '',
        apiResponse: JSON.stringify(reqResult.respBody)
      }
    });

    await sendSlackNotification(`Shop onboarding complete! Store - ${shop}`);
    
    return redirect("/app");
  } catch (error: any) {
    console.error('Error handling POST request:', error);
    return json({ error: 'Invalid request', message: error.message }, { status: 400 });
  }
};

function formDataToObject(formData: FormData): Record<string, string> {
  const obj: Record<string, string> = {};
  for (const [key, value] of formData.entries()) {
    obj[key] = value.toString();
  }
  return obj;
}