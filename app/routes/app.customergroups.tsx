import type { LoaderFunction } from "@remix-run/node";
import { Link,  useLoaderData } from "@remix-run/react";
import { Button, Card, Text, IndexTable, Layout, Page, useIndexResourceState, BlockStack} from "@shopify/polaris";
import PageHeader from "~/components/PageHeader";
import { isSubscriptionActive } from "~/services/Settings.server";
import { authenticate } from "~/shopify.server";
import prisma from "~/db.server";

interface IGroupConfig {
    id: string;
    name: string;
    groupTag: string;
    overallAdjustment: string;
    MOQ: string;
    paymentMethods: string[];
    memberCount: number;
}

export const query =`
query {
    segments(first: 250) {
      edges {
        node {
          id
          name
          query
        }
      }
    }
}
`

export const groupConfigQuery =`
query {
  shop {
    id
    metafields(first: 250, namespace:"b2bplus"){
      nodes{
        id
        key
        value
      }
    }
  }
}
`

export const loader: LoaderFunction = async ({ request }) => {
    const b2bTag = String(process.env.B2B_PREFIX);
    const b2cTag = String(process.env.B2C_PREFIX);
    const { admin, session, redirect } = await authenticate.admin(request);

    if(!(await isSubscriptionActive(admin))) {
        return redirect('/app/subscription');
    }
    try {
        const { shop } = session;
        let groupspWithConfig = new Array();

        //take DB records where tagID is not null because initially the app does populate them
        //but it does without tagID value, meaning that it's not the right time to start reading from DB
        const dbRecords = await prisma.shopSegmentsData.findMany({
            where: {
                shop: shop,
                tagID: {
                    not: null
                }
            },
            select:{ 
                id: true,
                segmentName: true,
                segmentId: true,
                tagID: true,
                defaultDiscount: true,
                defaultMOQ: true,
                paymentMethods: true,
                buyers: {
                    select: {
                        customerId: true,
                        customerName: true
                    }
                }
            }
        });

        if(dbRecords && dbRecords.length > 0) {
            for(var i in dbRecords) {
                groupspWithConfig.push({
                    id: dbRecords[i].segmentId,
                    name: dbRecords[i].segmentName,
                    groupTag: dbRecords[i].tagID,  
                    overallAdjustment: dbRecords[i].defaultDiscount,
                    MOQ: dbRecords[i].defaultMOQ,
                    paymentMethods: dbRecords[i].paymentMethods,
                    memberCount: dbRecords[i].buyers.length
                });
            }
        } else {
            // Fetch customer segments
            const customerGroups = await fetchCustomerGroups(admin, b2bTag, b2cTag);
            if (!customerGroups.length) return null;

            // Fetch group configurations
            const configData = await fetchGroupConfigurations(admin);
            if (!configData?.data?.shop?.metafields?.nodes?.length) return null;

            // Extract global configurations
            const { overallAdjustments, paymentMethods } = extractGlobalConfigs(configData);

            // Process each group and build final configuration
            groupspWithConfig = await buildGroupConfigurations(
                customerGroups,
                configData,
                overallAdjustments,
                paymentMethods,
                admin
            ) || [];

            if(groupspWithConfig != null && groupspWithConfig.length > 0) {
                for(var i in groupspWithConfig) {
                    await prisma.shopSegmentsData.upsert({
                        where: {
                            shop_segmentName: {
                                shop: shop,
                                segmentName: groupspWithConfig[i].name,
                            },
                        },
                        update: {
                            status: true
                        },
                        create: {
                            shop: shop,
                            segmentId: groupspWithConfig[i].id,
                            segmentName: groupspWithConfig[i].name 
                        }
                    });
                    await prisma.shopSegmentsData.updateMany({
                        where: {
                            shop: shop,
                            segmentId: groupspWithConfig[i].id
                        },
                        data: {
                            tagID: groupspWithConfig[i].groupTag,
                            defaultDiscount: groupspWithConfig[i].overallAdjustment,
                            defaultMOQ: groupspWithConfig[i]['MOQ'],
                            paymentMethods: groupspWithConfig[i]['paymentMethods']
                        }
                    })
                }
            }
        }
        
        //console.log(groupspWithConfig);

        return groupspWithConfig;
    } catch (err) {
        console.error(err);
        // Get the redirect page from the passed environment variable or default to "/app"
        const redirectPage = process.env.ERROR_REDIRECT_PAGE || '/app';
        return redirect(redirectPage);
    }
};

async function fetchCustomerGroups(admin: any, b2bTag: string, b2cTag: string) {
    const response = await admin.graphql(query);
    if (!response.ok) return [];

    const data = await response.json();
    const edges = data.data.segments.edges;

    return edges.filter((segment: any) => {
        const segmentQuery: string[] = segment.node.query.split(" ");
        const segmentTag = segmentQuery[segmentQuery.length - 1];
        return (segmentQuery[0] === "customer_tags" && 
                (segmentTag.includes(b2bTag) || segmentTag.includes(b2cTag)));
    });
}

async function fetchGroupConfigurations(admin: any) {
    const configResponse = await admin.graphql(groupConfigQuery);
    if (!configResponse.ok) return null;
    return await configResponse.json();
}

function extractGlobalConfigs(configData: any) {
    let overallAdjustments: any[] = [];
    let paymentMethods: any[] = [];

    const metafields = configData.data.shop.metafields.nodes;
    const volumeDiscounts = metafields.find((node: any) => node.key === "volumeDiscounts");
    const PaymentMethodOptions = metafields.find((node: any) => node.key === "PaymentMethodOptions");

    if (volumeDiscounts) {
        overallAdjustments = JSON.parse(volumeDiscounts.value);
    }
    if (PaymentMethodOptions) {
        paymentMethods = JSON.parse(PaymentMethodOptions.value);
    }

    return { overallAdjustments, paymentMethods };
}

async function getGroupMemberCount(admin: any, groupId: string): Promise<number> {
    const groupCountResponse = await admin.graphql(`
        query {
            customerSegmentMembers(
                segmentId: "${groupId}"
                first: 10
            ) {
                totalCount
            }
        }
    `);

    if (!groupCountResponse.ok) return 0;
    const groupCountData = await groupCountResponse.json();
    return groupCountData.data.customerSegmentMembers.totalCount;
}

async function buildGroupConfigurations(
    customerGroups: any[],
    configData: any,
    overallAdjustments: any[],
    paymentMethods: any[],
    admin: any
): Promise<IGroupConfig[]> {
    const groupspWithConfig: IGroupConfig[] = [];

    for (const group of customerGroups) {
        const groupQuery: string[] = group.node.query.split(" ");
        const groupTag = groupQuery[groupQuery.length - 1].replaceAll(/'/g, "");
        
        const groupAdjustment = overallAdjustments.find(
            (adjustment: any) => adjustment.tag === groupTag
        );
        const groupPaymentMethods = paymentMethods.find(
            (method: any) => method.tag === groupTag
        );
        const groupMOQ = configData.data.shop.metafields.nodes.find(
            (node: any) => node.key === groupTag
        );

        const MOQValue = groupMOQ ? JSON.parse(groupMOQ.value).minimum : "1";
        const groupMemberCount = await getGroupMemberCount(admin, group.node.id);

        groupspWithConfig.push({
            id: group.node.id,
            name: group.node.name,
            groupTag,
            overallAdjustment: groupAdjustment?.discount || "0",
            MOQ: MOQValue || "1",
            paymentMethods: (groupPaymentMethods && 
                           Array.isArray(groupPaymentMethods?.selectedPayments) && 
                           groupPaymentMethods?.selectedPayments.length > 0) 
                ? groupPaymentMethods?.selectedPayments.join(", ") 
                : "None",
            memberCount: groupMemberCount
        });
    }

    return groupspWithConfig;
}

const CustomerGroups = () => {
    const segments: any[] = useLoaderData() || [];

    const resourceName = {
        singular: 'group',
        plural: 'groups',
      };

    const {selectedResources, allResourcesSelected, handleSelectionChange} =
    useIndexResourceState(segments);

    const rowMarkup = segments.map((segment: IGroupConfig, index: number) => {

        return (
            <IndexTable.Row id={segment.id} key={segment.id} selected={selectedResources.includes(segment.id)} position={index}>
                <IndexTable.Cell>
                    <Link to={{
                        pathname:"/app/segment/",
                        search: `?groupId=${segment.id}&groupName=${segment.name}&groupTag=${segment.groupTag}`
                    }} style={{textDecoration: "none"}}>{segment.name}</Link>   
                </IndexTable.Cell>
                <IndexTable.Cell><center>{segment.overallAdjustment}%</center></IndexTable.Cell>
                <IndexTable.Cell><center>{segment.MOQ}</center></IndexTable.Cell>
                <IndexTable.Cell><center>{segment.paymentMethods}</center></IndexTable.Cell>
                <IndexTable.Cell><center>{segment.memberCount}</center></IndexTable.Cell>
                <IndexTable.Cell><center>{segment.groupTag}</center></IndexTable.Cell>
            </IndexTable.Row>
        );
    });
    
    return (<Page 
            fullWidth={true} 
        >
        <Layout>
            <Layout.Section>
                <PageHeader 
                    title="Customer" 
                    subtitle="Groups"
                />
            </Layout.Section>
            <Layout.Section>
                <Text as="p">This page allows you to organize wholesale buyers into groups based on shared purchasing rules, including pricing, quantity limits, tiered price breaks, and payment methods.</Text>
                <Text as="p">To get started, click the <strong><em>“New Customer Group”</em></strong> button above and follow the steps on the next page to define the purchasing rules and assign buyers.</Text>
            </Layout.Section>
            <Layout.Section>
                <div style={{display: "flex", justifyContent: "flex-end", alignContent: "flex-end"}}><Link to="/app/creategroup"><Button variant="primary">New Customer Group</Button></Link></div>
            </Layout.Section>
            <Layout.Section>
                <BlockStack gap="400">
                    <Card>
                        <IndexTable
                            selectable={false}
                            resourceName={resourceName}
                            itemCount={segments.length}
                            selectedItemsCount={
                            allResourcesSelected ? 'All' : selectedResources.length
                            }
                            onSelectionChange={handleSelectionChange}
                            headings={[
                                {title: 'Customer Group'},
                                {title: 'Default Discount', alignment: 'center'}, 
                                {title: 'Default MOQ', alignment: 'center'},
                                {title: 'Payment Methods', alignment: 'center'},
                                {title: 'Buyer Count', alignment: 'center'},
                                {title: 'Tag ID', alignment: 'center'}
                            ]}
                        >
                            {rowMarkup}
                        </IndexTable>
                    </Card>
                </BlockStack>
            </Layout.Section>
            <Layout.Section>
                <br/><Text as="h2" variant="headingLg">FAQ:</Text><br/>
                <Text as="p"><strong>How do I create a new customer group?</strong></Text>
                <ul style={{ listStyleType: 'none', paddingLeft: '20px', marginTop: '0px' }}>
                    <li>Click the "New Customer Group" button at the top-right section of this page.</li>
                </ul>
                <Text as="p"><strong>How do I edit the purchasing rules for an existing Customer Group?</strong></Text>
                <ul style={{ listStyleType: 'none', paddingLeft: '20px', marginTop: '0px' }}>
                    <li>Click on the desired Customer Group below to modify the purchasing rules associated with it.</li>
                </ul>
                <Text as="p"><strong>How do I assign buyers to a Customer Group?</strong></Text>
                <ul style={{ listStyleType: 'none', paddingLeft: '20px', marginTop: '0px' }}>
                    <li>Click on the desired Customer Group below and select “Assign Buyers” on the following page.</li>
                </ul>
            </Layout.Section>
            <Layout.Section>
                <br/><Text as="h2" variant="headingLg">Video Tutorial:</Text><br/>
                <div id='floik-iframe-container-m840ig94'
                    style={{
                    overflow: 'hidden',
                    borderRadius: '16px',
                    position: 'relative',
                    width: '100%', 
                    maxHeight: '100%',
                    aspectRatio: '1.7777777777777777',
                    border: '2px solid #ddd',
                    }}
                    >
                    <iframe id='floik-iframe-m840ig94'
                    allow="autoplay; fullscreen; clipboard-read; clipboard-write"
                    allowFullScreen
                    style={{
                        width: '100%',
                        height: '100%',
                        border: 'none',
                        position: 'absolute',
                        top: '0',
                        left: '0',
                    }}
                    src='https://www.floik.com/embed/f5085237-905a-461b-b209-c8c7d86b5e2f/2f52589f-ce63-4737-8f83-939711855297-flo.html?show-author=true'
                    ></iframe>
                </div>
            </Layout.Section>
        </Layout>
    </Page>);
}

export default CustomerGroups
