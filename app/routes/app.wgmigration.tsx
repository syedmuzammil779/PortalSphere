import { useState } from 'react';
import { json, redirect, LoaderFunctionArgs, ActionFunction } from "@remix-run/node";
import { Form } from "@remix-run/react";
import fs from 'fs';
import path from 'path';
import AdmZip from 'adm-zip';
import { parse } from 'csv-parse/sync';
import { authenticate } from "../shopify.server";
import {
  Page,
  BlockStack,
  Card,
  InlineGrid
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";

export let action: ActionFunction = async ({ request }) => {
    const { admin } = await authenticate.admin(request);
    const formData = await request.formData();
    const zipFile = formData.get('zipFile') as Blob;
  
    const buffer = await zipFile.arrayBuffer();
    const zip = new AdmZip(Buffer.from(buffer));
  
    let fileData: { [key: string]: any } = {};
  
    zip.getEntries().forEach((entry) => {
        if (entry.entryName.endsWith('.csv')) {
          const csvData = zip.readFile(entry);
          try {
            const parsedCsv = parse(csvData.toString());  // CSV parsing with csv-parse sync method

            var tag = entry.entryName;
            tag = tag.replace('.csv', '').split('_tag_');
            tag = tag[1];

            fileData[tag] = new Array();

            var tempArr = new Array();
            for(var i in parsedCsv) {
              if(i !== '0') {
                var absoluteRetailPrice = parseFloat(parsedCsv[i][2].replace('%', '')).toFixed(2);
                var absoluteWholeSalePrice = parseFloat(parsedCsv[i][3].replace('%', '')).toFixed(2);
                var handle = parsedCsv[i][5];
                var priceType = parsedCsv[i][3].includes('%') ? 'percent':'fixed';
                var discountKey = (handle+'-'+priceType+'-'+absoluteWholeSalePrice).toUpperCase();
                
                tempArr.push({
                  "key": discountKey,
                  "title": parsedCsv[i][0],
                  "variant": parsedCsv[i][1],
                  "retail_price": parsedCsv[i][2],
                  "absolute_retail_price": absoluteRetailPrice,
                  "absolute_wholesale_price": absoluteWholeSalePrice,
                  "wholesale_price": parsedCsv[i][3],
                  "tag": tag,
                  "sku": parsedCsv[i][4],
                  "price_type": priceType,
                  "handle": handle,
                  "id": parsedCsv[i][6]
                });
              }
            }

            fileData[tag].push(tempArr);  
          } catch (error) {
            console.log(error.message);
          }
        }
    });
    
    var secondPhaseArray = {};
    for(var tag in fileData) {
      secondPhaseArray[tag] = arrangeSecondPhaseArray(fileData[tag]);
    }

    var thirdPhaseArray = {};
    for(var tag in secondPhaseArray) {
      thirdPhaseArray[tag] = arrangeThirdPhaseArray(secondPhaseArray[tag]);
    }

    var customersArray = new Array();
    var cursor = null;
    do {
      var afterQuery = `first:25`;
      if(cursor != null) {
        afterQuery += `, after: "${cursor}"`;
      }

      var customerResponse = await admin.graphql(
        `#graphql
        query {
          customers(${afterQuery}) {
            edges {
              node {
                id
                tags
              }
              cursor
            }
            pageInfo {
              hasNextPage
            }
          }
        }`,
      );

      if(customerResponse.ok) {
        var customerResponseJson = await customerResponse.json();
        if(customerResponseJson.data.customers.edges) {
          var edges = customerResponseJson.data.customers.edges;
          if(edges != null && edges.length > 0) {
            for(var i in edges) {
              cursor = edges[i].cursor;
              customersArray.push({
                "id": edges[i].node.id,
                "tags": edges[i].node.tags
              });
            }
          } else {
            cursor = null;
          }
        } else {
          cursor = null;
        }
      }
    } while(cursor != null);

    var customersWithTagsValues = {};
    for(var i in customersArray) {
      var currentCustomer = customersArray[i];
      var customerId = currentCustomer.id.replace('gid://shopify/Customer/', '');
      if(!customersWithTagsValues[customerId]) {
        customersWithTagsValues[customerId] = {};
      }
      for(var k in currentCustomer.tags) {
        var currentTag = currentCustomer.tags[k];
        if(thirdPhaseArray.hasOwnProperty(currentTag)) {
          if(!customersWithTagsValues[customerId][currentTag]) {
            customersWithTagsValues[customerId][currentTag] = new Array();
          }
          customersWithTagsValues[customerId][currentTag]= thirdPhaseArray[currentTag];
        }
      }
    }

    var groupedCustomers = {};
    if(customersWithTagsValues != null) {
      for(var customerId in customersWithTagsValues) {
        var currentTagCombo = customersWithTagsValues[customerId];  
        if(currentTagCombo != null) {
          for(var tag in currentTagCombo) {
            var currentKey = currentTagCombo[tag]['key'];
            if(!groupedCustomers[currentKey]) {
              groupedCustomers[currentKey] = {
                'customerIds': new Array(),
                'discount': null
              };
            }
            
            if(!groupedCustomers[currentKey]['customerIds'].includes(customerId)) {
              groupedCustomers[currentKey]['customerIds'].push(customerId);
            }

            //if(!groupedCustomers[currentKey]['discount'].includes(currentKey)) {
              groupedCustomers[currentKey]['discount'] = currentTagCombo[tag];
            //}
          }
        }
      }
    }
  
    return json(
      groupedCustomers
    );
};

function arrangeThirdPhaseArray(arr) {
  var returnVal = {};
  for(var type of Object.keys(arr)) {
    var currentTagType = arr[type];
    if(currentTagType.length == 1) returnVal = currentTagType[0];
    else {
      var smallerValue = null;
      for(var i = 0; i < currentTagType.length; i++) {
        for(var j = 0; j < currentTagType.length; j++) {
          if(i == j) continue;

          if(!smallerValue) {
            smallerValue = compareTypesOfSameDiscount(currentTagType[i], currentTagType[j]);
          } else {
            smallerValue = compareTypesOfSameDiscount(currentTagType[j], smallerValue);
          }
        }
      }

      returnVal = smallerValue;
    }
  }

  return returnVal;
}

function compareTypesOfSameDiscount(one, two) {
  if(!one) return two;
  if(!two) return one;

  return two;
}

function arrangeSecondPhaseArray(arr: any) {

  var returnVal = {};
  for(var j in arr) {
    for(var k in arr[j]) {
      if(!returnVal.hasOwnProperty([arr[j][k]['handle']])) {
        returnVal[arr[j][k]['handle']] = new Array();
      }
      returnVal[arr[j][k]['handle']].push(arr[j][k]);
    }
  }

  return returnVal;
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  return json({status: true});
};

export default function UploadPage() {
  const [file, setFile] = useState<File | null>(null);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files) {
      setFile(event.target.files[0]);
    }
  };

  return (
    <Page>
      <TitleBar title="PortalSphere"></TitleBar>
        <BlockStack gap="500">
        <Card padding="0">
          <InlineGrid columns="1fr 1fr" gap="0">
          <div>
            <h1>Upload a ZIP File with CSVs</h1>
            <Form method="post" encType="multipart/form-data">
              <input type="file" name="zipFile" onChange={handleFileChange} />
              <button type="submit" disabled={!file}>
                Upload
              </button>
            </Form>
          </div>
          </InlineGrid>
        </Card>
      </BlockStack>
    </Page>
  );
}
