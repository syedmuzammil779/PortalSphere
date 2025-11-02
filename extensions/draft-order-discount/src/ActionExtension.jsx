import { useEffect } from 'react';
import { reactExtension, useApi, Heading, AdminAction, BlockStack, Text } from '@shopify/ui-extensions-react/admin';
import { useState } from 'react';

const TARGET = 'admin.draft-order-details.action.render';
export default reactExtension(TARGET, () => <App />);

function App() {
  const {close, data} = useApi(TARGET);
  const [apiResponse, setApiResponse] = useState(null);
  
  useEffect(() => {(
    async function callDraftOrderAPI() {
      const draftOrderId = data.selected[0].id.replace('gid://shopify/DraftOrder/', '');
      const getShopQuery = {
        query: `query Shop {
          shop {
            id
            myshopifyDomain
            name
            metafields (first: 50, namespace:"b2bplus") {
              edges {
                node {
                  namespace
                  key
                  jsonValue
                  value
                }
              }
            }
          }
        }`,
        variables: {},
      };

      const res = await fetch("shopify:admin/api/graphql.json", {
        method: "POST",
        body: JSON.stringify(getShopQuery),
      });

      if (!res.ok) {
        console.error('Network error');
      }

      const shopData = await res.json();
      const shopDomain = shopData.data.shop.myshopifyDomain;

      var urlToPing = null;
      try {
        const metafields = shopData.data.shop.metafields;
        if(metafields != null) {
          for(var i in metafields.edges) {
            const currentNode = metafields.edges[i].node;
            if(currentNode != null && currentNode != undefined && currentNode.hasOwnProperty('key') && currentNode.key == 'app_domain') {
              urlToPing = currentNode.value;
            }
          }
        }
      } catch (error) {
        console.log('error', error.message);
        urlToPing = null;
      }

      if(urlToPing) {
        const urlToHit = `https://${urlToPing}/api/draft-order-discount?shop=${shopDomain}&orderid=${draftOrderId}`;
        const apiRes = await fetch(urlToHit, {
          method: "GET"
        });

        if(apiRes && apiRes.ok) {
          const json = await apiRes.json();
          setApiResponse(json);
        }
      } 
      //close();
    })();
  }, [data.selected]);

  return (
    <AdminAction>
      <BlockStack>
        <Text>{apiResponse ? `${ apiResponse != null && apiResponse != undefined && apiResponse.hasOwnProperty('message') ? apiResponse.message : JSON.stringify(apiResponse)}` : 'Checking for discounts... please wait.'}</Text>
      </BlockStack>
    </AdminAction>
  );
}