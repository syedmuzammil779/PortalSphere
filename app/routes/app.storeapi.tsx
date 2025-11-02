import { Page, Card, DataTable, Layout, Text, BlockStack, CalloutCard, Button } from "@shopify/polaris";
import { json, LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData, useNavigate } from "@remix-run/react";
import { CSVLink } from 'react-csv';
import axios from 'axios';
import { authenticate } from "../shopify.server";
import prisma from '../db.server';

async function checkStoreInstallation(store: any) {
    try {
        var query = `query {
            shop {
                id
                name
            }
        }`;
    
        var response = await makeAGraphQLAPICallToShopify(store, {query: query});
        return response.respBody != null && response.respBody.data.shop.id;    
    } catch (error) {
        return false;
    }
}

async function makeAGraphQLAPICallToShopify(store: any, payload: object) {
    let reqResult = null;
    try {
        var API_VERSION = '2024-10';
        
        let endpoint = `https://${store.shop}/admin/api/${API_VERSION}/graphql.json`;
        let headers = {
            "Content-Type": "application/json",
            "X-Shopify-Access-Token": store.accessToken
        }

        reqResult = await axios.post(endpoint, payload, {headers: headers})
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
    } catch (error: any) {
        reqResult = {
            "status": false,
            "respBody": null,
            "message": error.message
        }
    }
    return reqResult;
}

// Loader function to fetch data
export const loader = async ({ request }: LoaderFunctionArgs) => {
    const { session, admin } = await authenticate.admin(request);
    var data = new Array();
    const dbShopRecord = await prisma.session.findFirst({
        where: {
          shop: session.shop
        }
    });

    //Now only one store can access the data
    if(dbShopRecord != null && dbShopRecord.shop == process.env.STORE_API_VIEW || 'portalsphere-demo-store.myshopify.com') {
        const dataDB = await prisma.session.findMany();
        var counter = 1;
        for(var i in dataDB) {
            data.push({
                id: counter++,
                shop: dataDB[i]['shop'],
                installValid: await checkStoreInstallation(dataDB[i]),
                createdAt: dataDB[i].createdAt.toLocaleString('en-US')
            });
        }
    }

    return json({data: data});
};

export default function StoreApi() {
    const navigate = useNavigate();
    const { data } = useLoaderData<typeof loader>();

  return (
    <Page>
        <Layout>
            <Layout.Section>
                <Card>
                    <div>
                    <h1>Shopify Product Table</h1>

                    <table>
                        <thead>
                        <tr>
                            <th>ID</th>
                            <th>Shop</th>
                            <th>Install Valid?</th>
                            <th>Created At</th>
                        </tr>
                        </thead>
                        <tbody>
                            {data.map((store) => (
                                <tr key={store.id}>
                                <td>{store.id}</td>
                                <td>{store.shop}</td>
                                <td>{store.installValid ? 'Yes':'No'}</td>
                                <td>{store.createdAt.toLocaleString()}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>

                    <br />
                    <CSVLink
                        data={data}
                        filename="shopify_products.csv"
                        className="btn"
                        target="_blank"
                    >
                        Download CSV
                    </CSVLink>
                    </div>
                </Card>
            </Layout.Section>
        </Layout>
    </Page>
  );
}
