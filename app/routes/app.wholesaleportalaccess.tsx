import {
    Card,
    Layout,
    Page,
    Text,
    useIndexResourceState,
    IndexTable,
    Badge,
    useBreakpoints,
    Button,
    FormLayout,
    TextField,
    Select,
    Tabs,
} from "@shopify/polaris";
import { type ActionFunction, type LoaderFunction } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import { useLoaderData, useSearchParams, useSubmit } from "@remix-run/react";
import { approveWholesalePricingBuyers, getWholesaleBuyers, rejectWholesalePricingBuyers } from "~/services/WholesaleBuyers.server";
import type { WholesaleBuyersResponse } from "~/models/WholesaleBuyersParams";
import type { WholesalePricingBuyers } from "@prisma/client";
import { useCallback, useState } from "react";
import type { Buyer } from "~/models/Buyer";
import { getCustomerGroups } from "~/services/CustomerGroups.server";
import { Modal, TitleBar } from "@shopify/app-bridge-react";
import PageHeader from "~/components/PageHeader";
import WatchVideoButton from "~/components/WatchVideoButton";
import VideoPopup from "~/components/VideoPopup";
import { isSubscriptionActive } from "~/services/Settings.server";

const viewBuyerModal = 'viewBuyerModal';

export const loader: LoaderFunction = async ({ request }) => {
    const { session, admin, redirect } = await authenticate.admin(request);

    if(!(await isSubscriptionActive(admin))) {
        return redirect('/app/subscription');
    }

    const { shop } = session;
    const url = new URL(request.url);
    const page = Number(url.searchParams.get("page") || "1");
    const perPage = Number(url.searchParams.get("perPage") || "50");
    const sortBy = url.searchParams.get("sortBy") || "companyName";
    const order = url.searchParams.get("order") === "desc" ? "desc" : "asc";

    try {        
        const response = await getWholesaleBuyers(shop, {page, size: perPage, sortBy, order});
        const customergroups = await getCustomerGroups(admin.graphql);
        //console.debug('customergroup', response.customergroups);
        return { ...response, customergroups, shop };
    }
    catch (error) {
        console.error(error);
    }
    return {};
};

export const action: ActionFunction = async ({ request }) => {
    const { admin, redirect } = await authenticate.admin(request);
    const formData = await request.formData();
    const actionType = formData.get('actionType')?.toString();
    const data = JSON.parse(formData.get('data')?.toString() ?? '{}');
    try {
        //console.debug(actionType, data);
        switch (actionType) {
            case 'approve':
                await approveWholesalePricingBuyers(data, admin.graphql);
                break;
            case 'reject':
                await rejectWholesalePricingBuyers(data, admin.graphql);
                break;
        }
    }
    catch (error) {
        console.error(error);
    }

    const url = new URL(request.headers.get('Referer') || '');

    return redirect(`${url.pathname}${url.search}`);
}

const WholesalePortalAccess: React.FC = () => {
    const response = useLoaderData<typeof loader>() as WholesaleBuyersResponse;
    const authShop = response.shop;
    console.log('shop received', authShop)
    const buyers = response.buyers;
    const customergroups = response.customergroups;
    const buyerTypes = [
        {label: 'Retailer', value: 'retailer'},
        {label: 'Distributor', value: 'distributor'},
        {label: 'Other', value: 'other'},
    ]
    const submit = useSubmit();
    const { clearSelection } = useIndexResourceState(buyers);
    const [searchParams, setSearchParams] = useSearchParams();
    const [viewActive, setViewActive] = useState<boolean>(false);
    const [selectedTab, setSelectedTab] = useState(0);
    const [buyerData, setBuyerData] = useState<Buyer>({
        id: '',
        companyName: '',
        companyAddress: '',
        contactFirstName: '',
        contactLastName: '',
        emailAddress: '',
        phoneNumber: '',
        buyerType: '',
        locationCount: 0,
        customerGroup: '',
        status: '',
        info: '',
        shop: '',
        createdAt: new Date(),
        shopifyCustomerId: '',
    });
    
    // Add state for video popup
    const [showVideoPopup, setShowVideoPopup] = useState(false);
    const [videoPopupUrl] = useState("https://www.floik.com/embed/f5085237-905a-461b-b209-c8c7d86b5e2f/5a723daa-3d67-4d75-8dfe-a896acee9d9d-flo.html?show-author=true");
    const [videoPopupTitle] = useState("Setup Wholesale Registration Form");
  
    const customerGroupOptions = customergroups?.map(x => x.name ?? '') ?? [];
    
    const toggleViewModal = useCallback((buyer: WholesalePricingBuyers & { customerGroup?: string }) => {
        setBuyerData({
            ...buyer,
            locationCount: buyer.locationCount.toString(10),
            customerGroup: buyer.customerGroup ?? undefined
        }); 
        setViewActive((viewActive) => !viewActive)
        if (viewActive) shopify.modal.show(viewBuyerModal);
        else shopify.modal.hide(viewBuyerModal);
    }, [viewActive]);

    const renderExtraData = (buyer: WholesalePricingBuyers | Buyer) => {
        var returnVal = null;
        const info = buyer.info;
        if(info !== null) {
            var temp = JSON.parse(buyer.info);
            returnVal = new Array();
            
            // Filter out file-related fields
            const fileFields = ['fileUrl', 'fileName', 'originalFileName', 'fileSize', 'mimeType'];
            
            for(var key in temp) {
                // Skip file-related fields
                if (fileFields.includes(key)) {
                    continue;
                }
                
                returnVal.push(<Text variant="bodySm" as="p">
                        {key.split('_').filter(Boolean).map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()).join(' ')}: {temp[key]}
                    </Text>)
            }
        }
        return returnVal;
    }

    const renderStatusBadge = (buyer: WholesalePricingBuyers | Buyer) => {
        switch(buyer.status) {
            case 'Approved':
                return <Badge progress="complete" tone="success">Approved</Badge>
            case 'Rejected':
                return <Badge tone="critical">Rejected</Badge>
            default:
                return <Badge progress="incomplete" tone="attention">Pending</Badge>
        }
    }

    const tabs = [
        {
            id: 'pending',
            content: 'Pending',
            accessibilityLabel: 'Pending buyers',
            panelID: 'pending-buyers',
        },
        {
            id: 'approved',
            content: 'Approved',
            accessibilityLabel: 'Approved buyers',
            panelID: 'approved-buyers',
        },
        {
            id: 'rejected',
            content: 'Rejected',
            accessibilityLabel: 'Rejected buyers',
            panelID: 'rejected-buyers',
        },
    ];

    const filteredBuyers = buyers.filter(buyer => {
        switch(selectedTab) {
            case 0: return buyer.status === 'Pending';
            case 1: return buyer.status === 'Approved';
            case 2: return buyer.status === 'Rejected';
            default: return true;
        }
    });

    const rowMarkup = filteredBuyers.map((x, index) => {
        return (
            <IndexTable.Row
                id={x.id}
                key={x.id}
                position={index}
            >
                <IndexTable.Cell>
                    <Text variant="bodyMd" fontWeight="bold" as="span">
                        {x.companyName}
                    </Text>
                    <Text variant="bodySm" as="p">
                        {x.contactLastName}, {x.contactFirstName} {x.emailAddress}
                    </Text>
                </IndexTable.Cell>
                <IndexTable.Cell>
                    { renderExtraData(x) }
                </IndexTable.Cell>
                <IndexTable.Cell>
                    { renderStatusBadge(x) }
                </IndexTable.Cell>
                <IndexTable.Cell>
                    <Button onClick={() => toggleViewModal(x)}>View</Button>
                </IndexTable.Cell>
            </IndexTable.Row>
        );
    });

    const approveCompany = async(itemId: string) => {
        window.shopify.loading(true);
        let record = [];
        const data = {            
            ...buyerData,
            id: itemId,
        };

        if (buyerData.customerGroup) {
            const customerGroup = customergroups?.find(group => group.name === buyerData.customerGroup);
            if (customerGroup) {
                data.customerGroup = customerGroup.id;
            }
        }

        record.push(data);

        const formData = new FormData();
        formData.append('actionType', 'approve');
        formData.append('data', JSON.stringify(record));
        searchParams.set('page', response.page.toString());
        searchParams.set('perPage', response.size.toString());
        searchParams.set('sortBy', response.sortBy);
        searchParams.set('order', response.order);
        submit(formData, {method: 'POST'});
        clearSelection();
        window.shopify.loading(false);
        window.shopify.modal.hide(viewBuyerModal);
    };

    const rejectCompany = async(itemId: string, allItems: WholesalePricingBuyers[]) => {

        window.shopify.loading(true);
        let record = [];
        const item = allItems.find(x => x.id === itemId);
        const data = {
            ...item
        };
        record.push(data);

        const formData = new FormData();
        formData.append('actionType', 'reject');
        formData.append('data', JSON.stringify(record));
        searchParams.set('page', response.page.toString());
        searchParams.set('perPage', response.size.toString());
        searchParams.set('sortBy', response.sortBy);
        searchParams.set('order', response.order);
        submit(formData, {method: 'POST'});
        clearSelection();
        window.shopify.loading(false);
        window.shopify.modal.hide(viewBuyerModal);
    };

    const handleInputChange = useCallback(
        (field: keyof Buyer) => (value: string) => setBuyerData((prevFormData) => ({
          ...prevFormData,
          [field]: value
        })),
        []
    );

    const viewBuyerDialog = () => {

        const storesToIgnore = ['portalsphere-test-store.myshopify.com', 'portalsphere-demo-store.myshopify.com', 'little-traverse-tileworks.myshopify.com'];

        const textFieldsToShow = new Array();
        textFieldsToShow.push(<TextField label="Company Name" value={buyerData.companyName} onChange={handleInputChange('companyName')} autoComplete="off" />);
        textFieldsToShow.push(<TextField label="Company Address" value={buyerData.companyAddress} onChange={handleInputChange('companyAddress')} autoComplete="off" />);
        textFieldsToShow.push(<TextField label="Contact First Name" value={buyerData.contactFirstName} onChange={handleInputChange('contactFirstName')} autoComplete="off" />);
        textFieldsToShow.push(<TextField label="Contact Last Name" value={buyerData.contactLastName} onChange={handleInputChange('contactLastName')} autoComplete="off" />);
        textFieldsToShow.push(<TextField label="Email Address" type="email" value={buyerData.emailAddress} onChange={handleInputChange('emailAddress')} autoComplete="email" />);
        textFieldsToShow.push(<TextField label="Phone Number" type="tel" value={buyerData.phoneNumber} onChange={handleInputChange('phoneNumber')} autoComplete="tel" />);

        if(!storesToIgnore.includes(authShop)) {
            textFieldsToShow.push(<Select label="Buyer Type" options={buyerTypes} value={buyerData.buyerType} onChange={handleInputChange('buyerType')} />);
            textFieldsToShow.push(<TextField label="Locations Services Count" type="number" value={buyerData.locationCount.toString()} onChange={handleInputChange('locationCount')} autoComplete="off" />);
        }
       
        textFieldsToShow.push(<Select label="Customer Group" options={[...customerGroupOptions]} value={buyerData.customerGroup} onChange={handleInputChange('customerGroup')} />);

        // Add file information section if files exist
        let fileSection = null;
        if (buyerData.info) {
            try {
                const extraData = JSON.parse(buyerData.info);
                if (extraData.fileUrl || extraData.fileName) {
                    fileSection = (
                        <div style={{ marginTop: '20px', padding: '16px', backgroundColor: '#f6f6f7', borderRadius: '8px', border: '1px solid #e1e3e5' }}>
                            <Text variant="bodyLg" as="h3" fontWeight="bold">📎 Supporting Documents</Text>
                            
                            {extraData.originalFileName && (
                                <div style={{ marginBottom: '8px' }}>
                                    <Text variant="bodyMd" as="span" fontWeight="semibold">File Name: </Text>
                                    <Text variant="bodyMd" as="span">{extraData.originalFileName}</Text>
                                </div>
                            )}
                            
                            {extraData.fileSize && (
                                <div style={{ marginBottom: '8px' }}>
                                    <Text variant="bodyMd" as="span" fontWeight="semibold">File Size: </Text>
                                    <Text variant="bodyMd" as="span">{Math.round(extraData.fileSize / 1024)} KB</Text>
                                </div>
                            )}
                            
                            {extraData.fileUrl && (
                                <div style={{ marginTop: '16px' }}>
                                    <Button 
                                        variant="primary" 
                                        size="slim"
                                        onClick={() => window.open(extraData.fileUrl, '_blank')}
                                    >
                                        📥 Download File
                                    </Button>
                                    <Button 
                                        variant="secondary" 
                                        size="slim"
                                        onClick={() => window.open(extraData.fileUrl, '_blank')}
                                    >
                                        👁️ View File
                                    </Button>
                                </div>
                            )}
                        </div>
                    );
                }
            } catch (error) {
                console.error('Error parsing file info:', error);
            }
        }

        return (
            <Modal
                id={viewBuyerModal}
                open={viewActive}
                onHide={() => {
                    if (viewActive) setViewActive((viewActive) => !viewActive);
                }}
            >
                <TitleBar title="Approve/Reject Wholesale Buyer">
                    <button variant="primary" onClick={() => approveCompany(buyerData.id)}>Approve</button>
                    <button onClick={() => rejectCompany(buyerData.id, buyers)}>Reject</button>
                </TitleBar>
                <Card>
                    <FormLayout>
                        {renderStatusBadge(buyerData)}
                        
                        { textFieldsToShow }
                        
                        { fileSection }
                        
                    </FormLayout>
                </Card>
                
            </Modal>
        );
    }

    return (
        <Page>
            <ui-title-bar title="Wholesale Portal"></ui-title-bar>
            <Layout>
                <Layout.Section>
                    <PageHeader 
                        title="Wholesale Access" 
                        subtitle="Requests"
                    />
                    
                    {/* Descriptive text */}
                    <div
                        style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                            margin: "24px 0",
                        }}
                    >
                        <div style={{ flex: 1 }}>
                            <Text variant="bodyLg" tone="subdued" as="p">
                                Review and manage wholesale customer applications by approving, rejecting, or assigning buyers to groups.
                            </Text>
                        </div>
                        
                        {/* Watch Video Button */}
                        <WatchVideoButton 
                            onClick={() => setShowVideoPopup(true)}
                            buttonText="Watch video"
                        />
                    </div>
                    
                    {/* Video Popup */}
                    <VideoPopup
                        isOpen={showVideoPopup}
                        onClose={() => setShowVideoPopup(false)}
                        videoUrl={videoPopupUrl}
                        title={videoPopupTitle}
                    />
                </Layout.Section>
                <Layout.Section>
                    <Card>
                        <Tabs tabs={tabs} selected={selectedTab} onSelect={setSelectedTab}>
                            <IndexTable
                                selectable={false}
                                condensed={useBreakpoints().lgDown}
                                itemCount={filteredBuyers.length}
                                headings={[
                                    {title: 'Company'},
                                    {title: ''},
                                    {title: 'Status'},
                                    {title: 'Action'}
                                ]}
                                pagination={{
                                    hasPrevious: response.page > 1,
                                    hasNext: response.page < response.totalPages,
                                    onNext: () => setSearchParams({page: (response.page + 1).toString(), perPage: response.size.toString(), sortBy: response.sortBy, order: response.order}),
                                    onPrevious: () => setSearchParams({page: (response.page - 1).toString(), perPage: response.size.toString(), sortBy: response.sortBy, order: response.order}),
                                }}
                            >
                                {rowMarkup}
                            </IndexTable>
                        </Tabs>
                        {viewBuyerDialog()}
                    </Card>
                    <Card>
                        <Badge tone="success">{'Approved: ' + response.approvedTotal.toString()}</Badge>
                        <Badge tone="critical">{'Rejected: ' + response.rejectedTotal.toString()}</Badge>
                        <Badge tone="attention">{'Pending: ' + response.pendingTotal.toString()}</Badge>
                    </Card>
                </Layout.Section>
            </Layout>
        </Page>        
    );
}

export default WholesalePortalAccess;
