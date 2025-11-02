import {
    Card,
    Layout,
    Page,
    ResourceItem,
    ResourceList,
    Thumbnail,
    Text,
    Checkbox,
} from "@shopify/polaris";
import { type ActionFunction, type LoaderFunction } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import { useLoaderData, useSubmit } from "@remix-run/react";
import { getTopProducts, resequenceTopProducts, updateTopProduct } from "~/services/TopProducts.server";
import type { TopProduct } from "~/services/TopProducts.server";
import { ImageIcon } from '@shopify/polaris-icons';
import { useDrag, useDrop, DndProvider } from 'react-dnd';
import { useRef, useState, useEffect } from "react";
import { HTML5Backend } from "react-dnd-html5-backend";
import type { DraggableTopProduct } from "../models/DraggableTopProduct"
import { getSettings, isSubscriptionActive, updateSettings } from "~/services/Settings.server";
import PageHeader from "~/components/PageHeader";
import WatchVideoButton from "~/components/WatchVideoButton";
import VideoPopup from "~/components/VideoPopup";

const topProdEnabledFlag = 'enableTopProducts';

export const loader: LoaderFunction = async ({ request }) => {
    const { admin, redirect } = await authenticate.admin(request);

    if(!(await isSubscriptionActive(admin))) {
        return redirect('/app/subscription');
    }

    try {
        const topProducts = await getTopProducts(admin, true);
        const isEnabled = (await getSettings(admin, topProdEnabledFlag))?.toLocaleLowerCase() === 'true' ? true : false;
        return {topProducts, isEnabled};
    }
    catch (error) {
        console.error(error);
        // Return fallback data instead of empty array
        return {topProducts: [], isEnabled: false};
    }
};

export const action: ActionFunction = async ({ request }) => {
    const { admin } = await authenticate.admin(request);
    const formData = await request.formData();
    const actionType = formData.get('actionType')?.toString();
    const data = JSON.parse(formData.get('data')?.toString() ?? '{}');
    try {
        //console.debug(actionType, data);
        switch (actionType) {
            case 'select': 
                await updateTopProduct(admin, data);
                break;
            case 'remove':
                await updateTopProduct(admin, data);
                break;
            case 'resequence':
                await resequenceTopProducts(admin, data);
                break;
            case 'enable': 
                await updateSettings(admin, topProdEnabledFlag, data);
                break;
        }
    }
    catch (error) {
        console.error(error);
    }
    return null;
}

const UpsellTopProducts: React.FC = () => {
    const response = useLoaderData<typeof loader>();    
        
    const [items, setItems] = useState(response?.topProducts || []);
    const [isEnabled, setIsEnabled] = useState(response?.isEnabled || false);
    
    // Add state for video popup
    const [showVideoPopup, setShowVideoPopup] = useState(false);
    const [videoPopupUrl] = useState("https://www.floik.com/embed/f5085237-905a-461b-b209-c8c7d86b5e2f/a3d65cc4-8983-4e6a-b638-8f55f0d760ec-flo.html");
    const [videoPopupTitle] = useState("Setup Top-Seller Upsell");
    
    const submit = useSubmit();

    useEffect(() => {
        if (response?.topProducts) {
            setItems(response.topProducts);
        }
        if (response?.isEnabled !== undefined) {
            setIsEnabled(response.isEnabled);
        }
    }, [response?.topProducts, response?.isEnabled]);

    const resequence = (data: TopProduct[]) => {
        const updatedItems = data.map((item, index) => ({
            ...item,
            rank: index + 1
        }));
        setItems(updatedItems);
    }

    const selectProduct = async (item: TopProduct, allitems: TopProduct[]) => {        
        const products = await window.shopify.resourcePicker({
            type: "product",
            action: "select",
            filter: {
                status: ["active"],
                archived: false,
                draft: false,
                hidden: false
            }
        });
        //console.debug('Select Item', item, products);
        if (products) {
            window.shopify.loading(true);
            const product = products[0];
            // check if already assigned
            const existCheck = allitems.find(x => x.productId === product.id && x.productVariantId === product.variants[0].id);
            if (existCheck) {
                //console.debug('Exist Check', existCheck, product);
                window.shopify.toast.show(`Item ${product.title} already exists in rank ${existCheck.rank}`);
                window.shopify.loading(false);
                return;
            }

            const data: TopProduct = {
                ...item,
                productId: product.id ?? 'No Id',
                variantIds: product.variants.map(v => v.id),
                productVariantId: product.variants[0].id ?? 'No Id',
            };
            const formData = new FormData();
            formData.append('actionType', 'select');
            formData.append('data', JSON.stringify(data));
            submit(formData, { method: 'POST' });
            window.shopify.loading(false);
        }        
    }
    
    const removeProduct = async (item: TopProduct) => {
        const data: TopProduct = {
            ...item,
            productId: null,
            productVariantId: null,
            productInfo: null
        }
        window.shopify.loading(true);
        const formData = new FormData();
        formData.append('actionType', 'remove')
        formData.append('data', JSON.stringify(data));
        submit(formData, { method: 'POST' });
        window.shopify.loading(false);
    }

    const renderItem = (item: TopProduct) => {
        if (!item.productId || !item.productInfo) {
            return (
                <Text variant="bodyMd" fontWeight="bold" as="h2">
                    Not Set
                </Text>
            );
        }

        return (
            <Text variant="bodyMd" fontWeight="bold" as="h2">
                {item.productInfo?.title} {item.productInfo?.variantTitle.toLowerCase() !== 'default title' ? (": " + item.productInfo?.variantTitle) : ""}
            </Text>
        );
    }

    const renderThumbnail = (item: TopProduct) => {
        if (item.productInfo?.image) {
            return (<Thumbnail source={item.productInfo?.image} alt={item.productInfo?.title ?? 'Not Set'}/>);
        }

        return (<Thumbnail source={ImageIcon} alt={item.productInfo?.title ?? 'Not Set'}/>);
    }

    const DraggableProductItem = ({
        product,
        index,
        moveProduct,
      }: {
        product: TopProduct;
        index: number;
        moveProduct: (dragIndex: number, hoverIndex: number) => void;
      }) => {
        const ref = useRef<HTMLDivElement>(null);
        
        const [, drop] = useDrop({
          accept: 'product',
          hover(item: DraggableTopProduct, monitor) {            
            if (!ref.current) {
              return;
            }
            const dragIndex = item.index;
            const hoverIndex = index;
      
            if (dragIndex === hoverIndex) {
              return;
            }
      
            const hoverBoundingRect = ref.current?.getBoundingClientRect();
            const hoverMiddleY = (hoverBoundingRect.bottom - hoverBoundingRect.top) / 2;
            const clientOffset = monitor.getClientOffset();
            const hoverClientY = clientOffset!.y - hoverBoundingRect.top;
      
            if (dragIndex < hoverIndex && hoverClientY < hoverMiddleY) {
              return;
            }
      
            if (dragIndex > hoverIndex && hoverClientY > hoverMiddleY) {
              return;
            }
      
            moveProduct(dragIndex, hoverIndex);
            item.index = hoverIndex;
          },
        });
      
        const [{ isDragging }, drag] = useDrag({
          type: 'product',
          item: { id: product.id, index },
          collect: (monitor) => ({
            isDragging: monitor.isDragging(),
          }),
        });
      
        drag(drop(ref));
      
        return (
          <div ref={ref} style={{ opacity: isDragging ? 0.5 : 1 }}>
            <ResourceItem                                        
                id={product.id}
                shortcutActions={product.productId ? [{content: 'Remove', onAction: () => removeProduct(product)}] : []}
                onClick={async () => await selectProduct(product, items)}
                url="#"
                media={renderThumbnail(product)}
                accessibilityLabel={`View details for ${product.productInfo?.title} ${product.productInfo?.title.toLowerCase() !== 'default title' ? (": " + product.productInfo?.variantTitle) : "" }`}>
                <Text variant="bodyMd" fontWeight="bold" as="h3">
                    Top {product?.rank}
                </Text>
                { renderItem(product) }
            </ResourceItem>
          </div>
        );
    }

    const moveProduct = (from: number, to: number) => {
        const updatedItems = [...items];
        const [movedItem] = updatedItems.splice(from, 1);
        updatedItems.splice(to, 0, movedItem);
        console.log('UPDATED ITEMS', updatedItems);
        resequence(updatedItems);
        const formData = new FormData();
        formData.append('actionType', 'resequence')
        formData.append('data', JSON.stringify(updatedItems));
        submit(formData, {method: 'POST'});
    };

    const handleEnableTopProducts = async (value: boolean) => {
        window.shopify.loading(true);
        setIsEnabled(value);
        const formData = new FormData();
        formData.append('actionType', 'enable');
        formData.append('data', JSON.stringify(value ? 'true' : 'false'));
        await submit(formData, { method: 'POST' });
        window.shopify.loading(false);
        window.shopify.toast.show('Top Products ' + (value ? 'Enabled' : 'Disabled'));
    }

    return (
        <Page>
            <Layout>
                <Layout.Section>
                    <PageHeader 
                        title="Top Sellers" 
                        subtitle="Upsell"
                    />
                    
                    {/* Descriptive text and Watch Video Button */}
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
                                Boost product adoption with personalized recommendations based on top-sellers a buyer hasn't purchased yet.
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
                        <Checkbox 
                            label="Enable Top Sellers" 
                            checked={isEnabled}
                            onChange={handleEnableTopProducts}
                            name={topProdEnabledFlag}
                        />
                    </Card>
                </Layout.Section>
                <Layout.Section>
                    <DndProvider backend={HTML5Backend}>
                        <Card>
                            <ResourceList
                                items={items} 
                                renderItem={(item: TopProduct, id: string, index: number) => {
                                    return (
                                        <DraggableProductItem 
                                            key={id}
                                            index={index}
                                            product={item}
                                            moveProduct={moveProduct}
                                        />                            
                                    );
                                } }
                            />                     
                        </Card>
                    </DndProvider>
                </Layout.Section>
            </Layout>
        </Page>        
    );
}

export default UpsellTopProducts;