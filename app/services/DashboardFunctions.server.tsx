import type { AdminApiContext } from "@shopify/shopify-app-remix/server";
import fetch from 'node-fetch';
import axios from 'axios';
import step1Thumbnail from '~/assets/setup-test.png';
import step2Thumbnail from '~/assets/enable-app.png';
import step3Thumbnail from '~/assets/setup-price.png';
import step4Thumbnail from '~/assets/setup-wholesaler-registration.jpeg';
import step5Thumbnail from '~/assets/top-seller-upsell.jpeg';
import step6Thumbnail from '~/assets/create-wholesale-order.png';
import moment from "moment";
import prisma from "~/db.server";
import { getShopIdCustom, makeAGraphQLAPICallToShopify } from "./CustomFunctions.server";
import { getShopId } from "./Settings.server";
import { B2B_PLUS_NAMESPACE } from "./CustomerGroups.server";

const b2bTag = String(process.env.B2B_PREFIX);
const b2cTag = String(process.env.B2C_PREFIX);
const hybridTag = String(process.env.HYBRID_PREFIX);

export const videoGuides = [{
  title: "STEP 1: Create a \"Test Store\" from your current theme",
  description: "Duplicate your current store theme to safely set up PortalSphere without affecting your live site.",
  videoUrl: "https://www.floik.com/embed/f5085237-905a-461b-b209-c8c7d86b5e2f/57720235-ceb2-4684-b25a-dae59904fe54-flo.html?show-author=true",
  thumbnailUrl: step1Thumbnail,
  videoLength: 63
}, {
  title: "STEP 2: Enable PortalSphere in Your Store",
  description: "Enable PortalSphere in your test store’s theme editor. If switching from another B2B app, disable it.",
  videoUrl: "https://www.floik.com/embed/f5085237-905a-461b-b209-c8c7d86b5e2f/c0032c85-ac5c-4473-9aee-2a029170babd-flo.html?show-author=true",
  thumbnailUrl: step2Thumbnail,
  videoLength: 166
}, {
  title: "STEP 3: Setup Pricing & Buyer Groups",
  description: "Create buyer groups based on pricing, quantitylimits, and payment terms. Assign buyers to groups.",
  videoUrl: "https://www.floik.com/embed/f5085237-905a-461b-b209-c8c7d86b5e2f/945da644-42b3-4796-8afa-cf97ba4821cf-flo.html",
  thumbnailUrl: step3Thumbnail,
  videoLength: 247
}, {
  title: "STEP 4: Setup Wholesale Registration Form",
  description: "Add the wholesale registration page to your store for new buyers to fill out their account info.",
  videoUrl: "https://www.floik.com/embed/f5085237-905a-461b-b209-c8c7d86b5e2f/5a723daa-3d67-4d75-8dfe-a896acee9d9d-flo.html?show-author=true",
  thumbnailUrl: step4Thumbnail,
  videoLength: 200
}, {
  title: "STEP 5: Setup Top-Seller Upsell",
  description: "Boost product adoption with personalized recommendations based on top-sellers a buyer hasn’t purchased yet.",
  videoUrl: "https://www.floik.com/embed/f5085237-905a-461b-b209-c8c7d86b5e2f/a3d65cc4-8983-4e6a-b638-8f55f0d760ec-flo.html",
  thumbnailUrl: step5Thumbnail,
  videoLength: 108
}, {
  title: "STEP 6: Manually Create a Wholesale Order",
  description: "Explore on how to manually create a wholesale order from your shopify store’s admin panel.",
  videoUrl: "https://www.floik.com/embed/f5085237-905a-461b-b209-c8c7d86b5e2f/c5e4644c-7f12-453a-8b35-eb34468a80bf-flo.html",
  thumbnailUrl: step6Thumbnail,
  videoLength: 100
}];

export const getAccessScopes = async (admin: any): Promise<any> => {
  const accessScopesQuery = `
    query {
      currentAppInstallation {
        accessScopes {
          handle
        }
      }
    }
  `;

  var response = await admin.request(accessScopesQuery);
  var returnVal = new Array();
  var scopes = response.data?.currentAppInstallation?.accessScopes;
  if(scopes) {
    for(var i in scopes) {
      var handle = scopes[i].handle || null;
      if(handle) {
        returnVal.push(handle);
      }
    }
  }
  return returnVal;
}

export const getCustomerCountForStore = async(admin: AdminApiContext|null, dbShop: any|null, dbDashboardMetricsRow: any|null, takeDatabaseValue: boolean = true): Promise<any> => {
  var returnVal = 0;
  var now = moment().unix();

  var customerCountQuery = `{customersCount{count}}`;

  //First check if database row is out of date yet. If yes, then return that.
  //Otherwise make a request to shopify, save it in db then return the value
  if(dbDashboardMetricsRow != null) {
    var infoExpired = checkIfUnixTimeStampExpired(now, parseInt(dbDashboardMetricsRow.customersLastCounted));
    if(!infoExpired && takeDatabaseValue) {
      return dbDashboardMetricsRow.customerCount; //We have to return right here itself
    }
  } 

  var properValueFound = false;
  
  if(admin != null) {
    const customerCountResponse =  await admin.graphql(customerCountQuery);
    if(customerCountResponse.ok){
      const data = await customerCountResponse.json();
      const { data: { customersCount: {count: value} } } = data;
      returnVal = value;
      properValueFound = true;
    }
  } else {
    if(dbShop != null) {
      var response = await makeAGraphQLAPICallToShopify(dbShop, {query: customerCountQuery});
      if(response.respBody) {
        returnVal = response.respBody.data.customersCount.count;
        properValueFound = true;
      }
    }
  }

  if(properValueFound && dbDashboardMetricsRow != null) {
    await prisma.dashboardMetrics.update({
      where: {id: dbDashboardMetricsRow.id},
      data: {customerCount: returnVal, customersLastCounted: moment().add(dbDashboardMetricsRow.customersCheckFrequency, 'hours').unix()}
    });
  }
  
  return returnVal;
};

export const getComplementaryProductsCounts = async (admin: AdminApiContext|null, shopGid: string|null, dbShop: any, dbDashboardMetricsRow: any|null, takeDatabaseValue: boolean = true): Promise<any> => {
  
  var now = moment().unix();
  const shopId = shopGid ? shopGid : (admin ? await getShopId(admin) : await getShopIdCustom(dbShop));

  if(dbDashboardMetricsRow != null) {
    var infoExpired = checkIfUnixTimeStampExpired(now, parseInt(dbDashboardMetricsRow.complementaryProductCountsLastChecked));
    if(!infoExpired && takeDatabaseValue) {
      return JSON.parse(dbDashboardMetricsRow.complementaryProductCounts); //We have to return right here itself
    }
  }
  
  //The reason that the above snippet exists, is because the `count` query can take time
  const [assigned, unassigned] = await Promise.all([
    prisma.complementaryProducts.count({
      where: {
        shop: shopId,
        complementaryProductVariantId: {
          not: null
        }
      }
    }),
    prisma.complementaryProducts.count({
      where: {
        shop: shopId,
        complementaryProductVariantId: null
      }
    })
  ]);

  const total = assigned + unassigned;
  var returnVal = {
    assigned,
    unassigned,
    total
  };

  if(dbDashboardMetricsRow != null && dbShop != null) {
    await prisma.dashboardMetrics.update({
      where: {id: dbDashboardMetricsRow.id},
      data: {complementaryProductCounts: JSON.stringify(returnVal), complementaryProductCountsLastChecked: moment().add(dbDashboardMetricsRow.complementaryProductCountsFrequency, 'hours').unix()}
    })
  }

  return returnVal;

};

export const getUpsellTopProductsEnabled = async (admin: AdminApiContext|null, dbShop: any, dbDashboardMetricsRow: any|null, takeDatabaseValue: boolean = true) : Promise<any> => {
  var now = moment().unix();
  //First check in db
  if(dbDashboardMetricsRow != null) {
    var infoExpired = checkIfUnixTimeStampExpired(now, parseInt(dbDashboardMetricsRow.upsellTopProductsEnabledLastChecked));
    if(!infoExpired && takeDatabaseValue) {
      return dbDashboardMetricsRow.upsellTopProductsEnabled; //We have to return right here itself
    }
  }
  const gQLQuery = `query {
    shop {
      metafield(key: "enableTopProducts", namespace: "${B2B_PLUS_NAMESPACE}") {
        id
        key
        namespace
        value
      }
    }
  }`;
  
  let apiResponse = null;
  let returnVal = null;
  if(admin) {
    apiResponse = await admin.graphql(gQLQuery);
    if(apiResponse.ok){
      const data = await apiResponse.json()
      const { data: { shop: { metafield } } } = data;
      returnVal = metafield?.value || null;
    }
  } else {
    apiResponse = await makeAGraphQLAPICallToShopify(dbShop, {query: gQLQuery});
    if(apiResponse.respBody) {
      const data = apiResponse.respBody;
      const { data: { shop: { metafield } } } = data;
      returnVal = metafield?.value || null;
    }
  }

  if(returnVal != null && dbDashboardMetricsRow != null) {
    await prisma.dashboardMetrics.update({
      where: {id: dbDashboardMetricsRow.id},
      data: {upsellTopProductsEnabled: returnVal, upsellTopProductsEnabledLastChecked: moment().add(dbDashboardMetricsRow.upsellTopProductsEnabledFrequency, 'hours').unix()}
    })
  }

  return returnVal;
};

export const getUpsellComplementaryProductsEnabled = async (admin: AdminApiContext|null, dbShop: any, dbDashboardMetricsRow: any|null, takeDatabaseValue: boolean = true) : Promise<any> => {
  var now = moment().unix();
  //First check in db
  if(dbDashboardMetricsRow != null) {
    var infoExpired = checkIfUnixTimeStampExpired(now, parseInt(dbDashboardMetricsRow.upsellComplementaryProductsEnabledLastChecked));
    if(!infoExpired && takeDatabaseValue) {
      return dbDashboardMetricsRow.upsellComplementaryProductsEnabled; //We have to return right here itself
    }
  }
  const gQLQuery = `query {
    shop {
      metafield(key: "enableComplementaryProducts", namespace: "${B2B_PLUS_NAMESPACE}") {
        id
        key
        namespace
        value
      }
    }
  }`;
  
  let apiResponse = null;
  let returnVal = null;
  if(admin) {
    apiResponse = await admin.graphql(gQLQuery);
    if(apiResponse.ok){
      const data = await apiResponse.json()
      const { data: { shop: { metafield } } } = data;
      returnVal = metafield?.value || null;
    }
  } else {
    apiResponse = await makeAGraphQLAPICallToShopify(dbShop, {query: gQLQuery});
    if(apiResponse.respBody) {
      const data = apiResponse.respBody;
      const { data: { shop: { metafield } } } = data;
      returnVal = metafield?.value || null;
    }
  }

  if(returnVal != null && dbDashboardMetricsRow != null) {
    await prisma.dashboardMetrics.update({
      where: {id: dbDashboardMetricsRow.id},
      data: {upsellComplementaryProductsEnabled: returnVal, upsellComplementaryProductsEnabledLastChecked: moment().add(dbDashboardMetricsRow.upsellComplementaryProductsEnabledFrequency, 'hours').unix()}
    })
  }

  return returnVal;
};

export const getOnlineStoreSetupStatus = async (admin: AdminApiContext|null, dbShop: any, dbDashboardMetricsRow: any|null, takeDatabaseValue: boolean = true): Promise<any> => {
  var now = moment().unix();
  
  //First check in db
  if(dbDashboardMetricsRow != null) {
    var infoExpired = checkIfUnixTimeStampExpired(now, parseInt(dbDashboardMetricsRow.onlineStoreSetupStatusLastChecked));
    if(!infoExpired && takeDatabaseValue) {
      return JSON.parse(dbDashboardMetricsRow.onlineStoreSetupStatus); //We have to return right here itself
    }
  }

  const gQLQuery = `query {
    shop {
      metafield(key: "onlineStoreSetupStatus", namespace: "${B2B_PLUS_NAMESPACE}") {
        id
        key
        namespace
        value
      }
    }
  }`;

  let apiResponse =  null;
  var returnVal;
  var properValueFound = false;
  if(admin) {
    apiResponse = await admin.graphql(gQLQuery);
    if(apiResponse.ok){
      const data = await apiResponse.json();
      const { data: { shop: { metafield } } } = data;

      returnVal = metafield && metafield.value ? JSON.parse(metafield?.value) : {
        appEmbed: 'false',
        appBlock: 'false'
      };
      properValueFound = true;
    }
  } else {
    apiResponse = await makeAGraphQLAPICallToShopify(dbShop, {query: gQLQuery});
    if(apiResponse.respBody) {
      const data = apiResponse.respBody;
      const { data: { shop: { metafield } } } = data;

      returnVal = metafield && metafield.value ? JSON.parse(metafield?.value) : {
        appEmbed: 'false',
        appBlock: 'false'
      };
      properValueFound = true;
    }
  }

  if(properValueFound && dbDashboardMetricsRow != null) {
    await prisma.dashboardMetrics.update({
      where: {id: dbDashboardMetricsRow.id},
      data: {onlineStoreSetupStatus: JSON.stringify(returnVal), onlineStoreSetupStatusLastChecked: moment().add(dbDashboardMetricsRow.onlineStoreSetupStatusFrequency, 'hours').unix()}
    });
  }

  return returnVal;
}

export const getCustomerSegmentsForStore = async (admin: AdminApiContext|null, dbShop: any, takeDatabaseValue: boolean = true): Promise<any> => {
  
  //First check the table if it has it, then return it.
  if(takeDatabaseValue) {
    const rows = await prisma.shopSegmentsData.findMany({
      where: {
        shop: dbShop.shop,
        status: true
      }
    });

    if(rows != null && rows.length) {
      return rows;
    }
  }
  
  let returnVal = null;

  const gQLQuery = `{
    segments(first: 250) {
      nodes {
        id
        name
        query
      }
    }
  }`

  let groupsData;
  if(admin) {
    const segmentResponse = await admin.graphql(gQLQuery);
    if(segmentResponse.ok){
      groupsData = await segmentResponse.json();
    }  
  } else {
    const segmentsResponse = await makeAGraphQLAPICallToShopify(dbShop, {query: gQLQuery});
    if(segmentsResponse.respBody) {
      groupsData = segmentsResponse.respBody;
    } 
  }

  if(groupsData) {
    const { data: { segments: { nodes: groups } } } = groupsData;

    const customerGroups = groups.filter((group: any) => {
      const groupQuery: string[] = group.query.split(" ");
      const groupTag = groupQuery[groupQuery.length-1];
      
      return ((groupQuery[0] === "customer_tags" && (groupTag.includes(b2bTag) || groupTag.includes(b2cTag) || groupTag.includes(hybridTag))));
    });

    if(customerGroups.length > 0) {
      await prisma.shopSegmentsData.updateMany({
        where: { shop: dbShop.shop },
        data: { status: false }
      });

      for(var i in customerGroups) {
        await prisma.shopSegmentsData.upsert({
          where: {
            shop_segmentName: {
              shop: dbShop.shop,
              segmentName: customerGroups[i].name,
            },
          },
          update: {
            status: true
          },
          create: {
            shop: dbShop.shop,
            segmentId: customerGroups[i].id,
            segmentName: customerGroups[i].name,
            query: customerGroups[i].query
          }
        })
      }

      await prisma.shopSegmentsData.deleteMany({
        where: {
          shop: dbShop.shop,
          status: false
        }
      });
    }

    returnVal = customerGroups;
  }

  return await prisma.shopSegmentsData.findMany({
    where: {
      shop: dbShop.shop,
      status: true
    }
  });
}

export const getCustomerGroupMemberCount = async (admin: AdminApiContext|null, dbShop: any, customerGroupRow: any, takeDatabaseValue: boolean = true): Promise<any> => {
  if(customerGroupRow.memberCount !== null && takeDatabaseValue) {
    return customerGroupRow.memberCount;
  }

  let gQLQuery = `{
    customerSegmentMembers(
      segmentId: "${customerGroupRow.segmentId}"
      first: 100
    ) {
      totalCount
    }
  }`
  let apiResponse;
  let data = null;
  if(admin) {
    apiResponse = await admin.graphql(gQLQuery);
    if(apiResponse.ok) {
      data = await apiResponse.json();
    }
  } else {
    apiResponse = await makeAGraphQLAPICallToShopify(dbShop, {query: gQLQuery});
    if(apiResponse.respBody) {
      data = apiResponse.respBody;
    }
  }

  if(data != null) {
    const {
      data: {
        customerSegmentMembers: { totalCount: value }  
      }
    } = data;

    await prisma.shopSegmentsData.update({
      where: {id: customerGroupRow.id},
      data: {memberCount: parseInt(value)}
    });

    return value;
  }

  return 0;
}

export const hasCustomerGroupIncludedProducts = async (admin: AdminApiContext|null, dbShop: any, customerGroupRow: any, tag:string, takeDatabaseValue: boolean = true): Promise<boolean> => {

  if(customerGroupRow.hasIncludedProducts != null && takeDatabaseValue) {
    return customerGroupRow.hasIncludedProducts;
  }

  let hasNextPage = true;
  let cursor: string | null = null;
  let totalCount = 0;
  let retryCount = 0;
  const MAX_RETRIES = 3;

  while (hasNextPage) {
    
    var afterCursor = cursor ? `, after: "${cursor}"` : ``;
    
    try {
      const query = `query {
        productVariants(first: 100, query:"metafields.${B2B_PLUS_NAMESPACE}.${tag}:'included'" ${afterCursor}) {
          edges {
            node {
              id metafield(namespace: "${B2B_PLUS_NAMESPACE}", key: "${tag}") {
                id value
              }
            }
          }
          pageInfo {
            hasNextPage
            endCursor
          }
        }
      }`;

      let apiResponse;
      let data;
      
      if(admin) {
        apiResponse = await admin.graphql(query);
        if (!apiResponse.ok) {
          throw new Error(`HTTP error! status: ${apiResponse.status}`);
        }
        data = await apiResponse.json() as { data?: any, errors?: any[] };
      } else {
        apiResponse = await makeAGraphQLAPICallToShopify(dbShop, {query: query});
        data = apiResponse.respBody;
      }
      
      if ('errors' in data && data.errors) {
        console.error('GraphQL errors:', JSON.stringify(data.errors, null, 2));
        throw new Error('GraphQL errors occurred');
      }

      if (!data.data || !data.data.productVariants) {
        throw new Error('Unexpected response structure');
      }

      const variants = data.data.productVariants.edges.filter((edge: any) => (edge.node.metafield !== null && edge.node.metafield?.value === "included"));
      totalCount += variants.length;
      
      if(totalCount > 0) {
        await prisma.shopSegmentsData.update({
          where: {id: customerGroupRow.id},
          data: {hasIncludedProducts: true}
        })
        return true;
      }

      hasNextPage = data.data.productVariants.pageInfo.hasNextPage;
      cursor = data.data.productVariants.pageInfo.endCursor;

      // Reset retry count on successful request
      retryCount = 0;

      // Add a small delay to avoid hitting rate limits
      await new Promise(resolve => setTimeout(resolve, 500));

    } catch (error) {
      console.error('Error fetching product variants:', error);

      if (retryCount < MAX_RETRIES) {
        retryCount++;
        console.log(`Retrying... Attempt ${retryCount} of ${MAX_RETRIES}`);
        await new Promise(resolve => setTimeout(resolve, 1000 * retryCount)); // Exponential backoff
        continue;
      }

      throw new Error(`Failed to fetch product variants after ${MAX_RETRIES} attempts: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  await prisma.shopSegmentsData.update({
    where: {id: customerGroupRow.id},
    data: {hasIncludedProducts: totalCount > 0}
  })
  return totalCount > 0;
} 

export const getStoreType = async (admin: AdminApiContext|null, dbShop: any, dbDashboardMetricsRow: any|null, takeDatabaseValue: boolean = true): Promise<any> => {
  const gQLQuery = `query {
    shop {
      metafield(key: "storeType", namespace: "${B2B_PLUS_NAMESPACE}") {
        id
        key
        namespace
        value
      }
    }
  }`;

  if(dbDashboardMetricsRow != null && dbDashboardMetricsRow.storeType != null && takeDatabaseValue) {
    return dbDashboardMetricsRow.storeType;
  }

  let apiResponse;
  let apiData = null;
  let returnVal = null;

  if(admin) {
    apiResponse = await admin.graphql(gQLQuery);
    if(apiResponse.ok) {
      apiData = await apiResponse.json();
    }
  } else {
    apiResponse = await makeAGraphQLAPICallToShopify(dbShop, {query: gQLQuery});
    if(apiResponse.respBody) {
      apiData = apiResponse.respBody;
    }
  }

  if(apiData) {
    const { data: { shop: { metafield } } } = apiData;
    returnVal = metafield?.value || null;

    if(returnVal && dbDashboardMetricsRow != null && dbDashboardMetricsRow.id) {
      await prisma.dashboardMetrics.update({
        where: {id: dbDashboardMetricsRow.id},
        data: {storeType: returnVal}
      });

      return returnVal;
    }
  }

  return null;
}

export const checkIfUnixTimeStampExpired = (now: number, checkValue: number|null): boolean => {
  if(!checkValue) return true; //If column value is expired then yes it has expired
  return now > checkValue;
}