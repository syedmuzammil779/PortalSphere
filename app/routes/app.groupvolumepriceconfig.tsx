import React, { useState, useCallback, useEffect } from "react";
import { ActionFunction, json, LoaderFunction } from "@remix-run/node";
import { Link, useLoaderData, useNavigation, useSearchParams, useSubmit} from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  IndexTable,
  Text,
  Thumbnail,
  useIndexResourceState,
  Button,
  TextField,
  Spinner,
  Pagination,
  Select,
} from "@shopify/polaris";
import { Modal, SaveBar, TitleBar, useAppBridge} from "@shopify/app-bridge-react";
import { SettingsFilledIcon, XIcon, PlusIcon, DeleteIcon, ImageIcon } from '@shopify/polaris-icons';
import { authenticate } from "~/shopify.server";
import { setVariantMetafield, getProductVariantMetafields, IPriceConfig, IQuantityConfig, IProductPriceQuantityConfigs, deleteVariantMetafield, setVariantInclusionMetafield, IPageInfo, getShopMetafield } from "~/services/CustomerGroups.server";
import { JourneyBreadcrumb } from "~/components/JourneyBreadcrumb";
import { PageLoadSpinner } from "~/components/PageLoadSpinner";
import PageHeader from "~/components/PageHeader";
import prisma from "~/db.server";

const DEFAULT_PAGE_SIZE = 15;

interface LoaderData {
  discountVariants: string[];
  productVariants: ProductVariant[];
  volumePriceConfig: IProductPriceQuantityConfigs[];
  pageSize: number;
  pageInfo: IPageInfo;
  searchTerm: string | null;
  volumeGroupConfig: { value: string; } | null;
  initialProductList: string[];
}

interface ProductVariant {
  id: string;
  displayName: string;
  status: string;
  featuredImage: string;
  price: string;
  metafield: { value: string } | null;
}

interface IDiscountType  {
  type: string;
  caption: string;
}

// Utility function to create discount type
const createDiscountType = (type: "percentage" | "fixedAmount") => {
  return type === "percentage"
    ? { type: "percentage", caption: "Discount percentage" }
    : { type: "fixedAmount", caption: "Discounted price" };
};

export const loader: LoaderFunction = async ({ request }): Promise<LoaderData> => {
  const { admin } = await authenticate.admin(request);
  const url = new URL(request.url);
  const cursor = url.searchParams.get('cursor');
  const pageSize = parseInt(url.searchParams.get('pageSize') || DEFAULT_PAGE_SIZE.toString(), 10);
  const groupTag = url.searchParams.get('groupTag');
  const NAME_SPACE = "b2bplus";
  const searchTerm = url.searchParams.get('search') || null;

  if (!groupTag) {
    throw new Error('Group Tag is required');
  }

  try {
    // Get paginated variants with cursor
    const { variants, pageInfo } = await getProductVariantMetafields(
      admin, 
      NAME_SPACE, 
      groupTag, 
      pageSize, 
      cursor, 
      searchTerm
    );

    const volumeGroupConfig = await getShopMetafield(admin, groupTag, NAME_SPACE);
    const productVariants: ProductVariant[] = [];
    const discountVariants: string[] = [];
    const initialProductList: string[] = [];
    const volumePriceConfig: IProductPriceQuantityConfigs[] = [];

    // Process the variants
    for (const variant of variants) {
      if (variant.productStatus === "ACTIVE" || variant.productStatus === "DRAFT") {
        let variantMetafield: any = null;
        initialProductList.push(variant.variantId);

        if (variant.inclusionMetafield) {
          discountVariants.push(variant.variantId);
          if (variant.metafield && variant.metafield.value) {
            const parsedValue = JSON.parse(variant.metafield.value);
            if (Array.isArray(parsedValue) && parsedValue.length > 0) {
              const variantConfig = parsedValue.find((item: any) => item.tag === groupTag);
              variantMetafield = { 
                volume: variantConfig?.volumeConfig ?? {}, 
                price: variantConfig?.priceConfig ?? [],
                type: variantConfig?.type ?? "percentage"
              };
              volumePriceConfig.push({ 
                productId: variant.variantId, 
                volume: variantConfig?.volumeConfig ?? {}, 
                price: variantConfig?.priceConfig ?? [],
                type: variantConfig?.type ?? "percentage"
              });
            }
          }
        }

        productVariants.push({
          id: variant.variantId,
          displayName: variant.variantDisplayName,
          status: variant.productStatus,
          featuredImage: variant.variantImageUrl ?? variant.productImageUrl ?? "",
          price: variant.variantPrice,
          metafield: variantMetafield
        });
      }
    }

    return {
      productVariants,
      discountVariants,
      volumePriceConfig,
      pageSize,
      pageInfo, // This now includes proper cursor information
      searchTerm: searchTerm ?? "",
      volumeGroupConfig,
      initialProductList,
    };

  } catch (error) {
    console.error("Error fetching product variants: ", error);
    return {
      productVariants: [],
      discountVariants: [],
      volumePriceConfig: [],
      pageSize: DEFAULT_PAGE_SIZE,
      searchTerm: null,
      pageInfo: {
        hasNextPage: false,
        endCursor: null,
        hasPreviousPage: false,
        startCursor: null,
      },
      volumeGroupConfig: null,
      initialProductList: [],
    };
  }
};

export const action: ActionFunction = async ({ request }) => {
  const { admin, redirect, session } = await authenticate.admin(request);
  const { shop } = session;
  const url = new URL(request.url);
  const formData = await request.formData();

  const groupTag = url.searchParams.get("groupTag")
  const groupName =  url.searchParams.get("groupName");
  const isNewGroup =  url.searchParams.get("isNewGroup");
  const groupId =  url.searchParams.get("groupId");

  const includedProductList = JSON.parse(formData.get("includedProductList") as string);
  const productsPriceAndQuantityConfigs = JSON.parse(formData.get("productsPriceAndQuantityConfigs") as string);

  const redirectPath = (isNewGroup && isNewGroup === "true") 
                      ? `/app/addmembers/?groupId=${groupId}&groupName=${groupName}&groupTag=${groupTag}&isNewGroup=${isNewGroup}` 
                      : `/app/segment/?groupId=${groupId}&groupName=${groupName}&groupTag=${groupTag}`

  try {
    for (const productId of includedProductList) {
      const quantityPriceConfig = productsPriceAndQuantityConfigs.find((productConfig: any) => productConfig.productId === productId);
      if (quantityPriceConfig 
        && Object.hasOwn(quantityPriceConfig, "volume") 
        && Object.hasOwn(quantityPriceConfig, "price")) {
        await Promise.all([
          setVariantMetafield(admin, productId, groupTag as string, {
            volumeConfig: quantityPriceConfig.volume,
            priceConfig: quantityPriceConfig.price,
            type: quantityPriceConfig.type
          }),
          setVariantInclusionMetafield(admin, productId, groupTag as string)
        ]);
      }else{
        await deleteVariantMetafield(admin, productId, groupTag as string);
      }

      //Delete the volume pricing config for product variant
      const deleteCondition = {
        where: {
          shop: shop,
          productVariantId: productId
        }
      };
      await prisma.volumePricingData.deleteMany(deleteCondition)
    }

    return redirect(redirectPath);
  } catch (error) {
    console.error(error);
    return json({ error: "An error occurred while updating the product volume pricing" }, { status: 500 });
  }
}

const ProductVolumePricing: React.FC = () => {
  const submit = useSubmit();
  const navigation = useNavigation();
  const shopify = useAppBridge();
  const [searchParams, setSearchParams] = useSearchParams();
  const { productVariants: productsVariants, discountVariants: includedProducts, volumePriceConfig: priceAndQuantityConfigs, pageSize, searchTerm: initialSearchTerm, pageInfo, initialProductList }: any = useLoaderData();
  const [selectedTab, setSelectedTab] = useState(0);
  const [isLoadingPage, setIsLoadingPage] = useState(false);
  const [searchTerm, setSearchTerm] = useState(initialSearchTerm ?? "");
  const [priceConfigs, setPriceConfigs] = useState<IPriceConfig[]>([]);
  const [products, setProducts] = useState<ProductVariant[]>(productsVariants);
  const [quantityConfigs, setQuantityConfigs] = useState<IQuantityConfig>({ minimum: "", increment: "", maximum: "" });
  const [discountType, setDiscountType] = useState<IDiscountType>(createDiscountType("percentage"));
  const [variantPrice, setVariantPrice] = useState<string>("");
  const [includedProductList, setIncludedProductList] = useState(initialProductList);
  const [selectedProductId, setSelectedProductId] = useState<string[]>([]);
  const [productsPriceAndQuantityConfigs, setProductsPriceAndQuantityConfigs] = useState<IProductPriceQuantityConfigs[]>(priceAndQuantityConfigs);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const isPaginating = navigation.state === "loading";

  const groupName = searchParams.get('groupName')
  const groupTag = searchParams.get('groupTag')
  const groupId = searchParams.get('groupId')
  const isNewGroup = searchParams.get('isNewGroup');
  const {
    selectedResources,
    allResourcesSelected,
    handleSelectionChange,
    clearSelection
  } = useIndexResourceState(products as any[]);
   
  shopify.saveBar.hide('my-save-bar');

  // Add cursor history tracking
  useEffect(() => {
    const currentCursor = searchParams.get('cursor');
    if (currentCursor) {
      const cursorHistory = JSON.parse(sessionStorage.getItem('cursorHistory') || '[]');
      if (!cursorHistory.includes(currentCursor)) {
        cursorHistory.push(currentCursor);
        sessionStorage.setItem('cursorHistory', JSON.stringify(cursorHistory));
      }
    }
  }, [searchParams]);

  // Clear cursor history when leaving page or when search term changes
  useEffect(() => {
    return () => {
      sessionStorage.removeItem('cursorHistory');
    };
  }, [location.pathname, searchTerm]);

  useEffect(() => {
    if (navigation.state === "loading") {
      setIsLoadingPage(true);
    } else if (navigation.state === "idle" && isLoadingPage) {
      setIsLoadingPage(false);
    }
  }, [navigation.state, isLoadingPage]);

  useEffect(() => {
    setProducts(productsVariants);
    setIncludedProductList(initialProductList);
    setProductsPriceAndQuantityConfigs(priceAndQuantityConfigs);
    setSearchTerm(initialSearchTerm);
  }, [includedProducts, priceAndQuantityConfigs]);

  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (hasUnsavedChanges) {
        // Show Shopify save bar
        shopify.saveBar.show('updated-save-bar');
        
        // Browser navigation warning
        e.preventDefault();
        const confirmationMessage = 'You have unsaved changes. Are you sure you want to leave?';
        (e || window.event).returnValue = confirmationMessage;
        return confirmationMessage;
      }
    };

    // Show save bar immediately if there are unsaved changes
    if (hasUnsavedChanges) {
      shopify.saveBar.show('updated-save-bar');
    }

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [hasUnsavedChanges, shopify.saveBar]);

  useEffect(() => {
    setIsLoadingPage(false);
  }, [products]);

  useEffect(() => {
    if (navigation.state === "idle") {
      setIsLoadingPage(false);
    }
  }, [navigation.state]);

  useEffect(() => {
    console.log('Selected resources:', selectedResources);
    // Handle selection changes here
  }, [selectedResources]);

  const resourceName = { singular: 'Product', plural: 'Products' };

  const handleAddConfig = useCallback(() => {
    const newVolumeConfig = priceConfigs.length > 0
      ? Number(priceConfigs[priceConfigs.length - 1].quantity) + Number(quantityConfigs.increment)
      : Number(quantityConfigs.minimum);
    
    if (quantityConfigs.maximum && Number(newVolumeConfig) > Number(quantityConfigs.maximum)) {
      return
    }

    setPriceConfigs(prev => [...prev, { quantity: String(newVolumeConfig), percentage: "", status: "" }]);
  }, [priceConfigs, quantityConfigs]);

  const handleRemoveAllPriceConfig = useCallback(() => setPriceConfigs([]), [setPriceConfigs]);

  const handleDeleteConfig = useCallback((index: number) => {
    setPriceConfigs(prev => prev.filter((_, i) => i !== index));
  }, [setPriceConfigs]);

  const handleChange = useCallback((event: React.ChangeEvent<HTMLInputElement>, index: number) => {
    const { name, value } = event.target;
    setPriceConfigs(prev => prev.map((config, i) => i === index ? { ...config, [name]: value } : config));
  }, [setPriceConfigs]);

  const handleValidatePriceConfigs = (event: React.FocusEvent<HTMLInputElement>, index: number) => {
    let { name, value } = event.target;
    let newPriceConfigs = [...priceConfigs];

    if(name === "quantity"){
        //handle first input value if it is less than minimum
        if(index == 0 && Number(value) < Number(quantityConfigs.minimum)){
            value = quantityConfigs.minimum?.toString() ?? '';
        }
        if(index == 0 && Number(value) > Number(quantityConfigs.minimum) && (Number(value)%Number(quantityConfigs.increment))){
            value = (Number(value) + Number(quantityConfigs.increment) - (Number(value)%Number(quantityConfigs.increment))).toString();
        }
        //handle input value if it is less than the last quantity + increment
        if(index > 0 && Number(value) < (Number(priceConfigs[index-1].quantity) + Number(quantityConfigs.increment))){
            value = (Number(priceConfigs[index-1].quantity) + Number(quantityConfigs.increment)).toString();
        }

        if(index > 0 && Number(value) > (Number(priceConfigs[index-1].quantity) + Number(quantityConfigs.increment)) && (Number(value)%Number(quantityConfigs.increment))){
            value = String(Number(value) + Number(quantityConfigs.increment) - (Number(value)%Number(quantityConfigs.increment)));
        }
    
        //@ts-ignore
        newPriceConfigs[index].quantity=value;

        if(index <= newPriceConfigs.length - 1){
            for(let i=index;i <= (newPriceConfigs.length - 1); i++){
                //@ts-ignore
                if(Number(newPriceConfigs[i].quantity) < (Number(newPriceConfigs[i-1].quantity) + Number(quantityConfigs.increment))){
                    //@ts-ignore
                    newPriceConfigs[i].quantity = (Number(newPriceConfigs[i-1].quantity) + Number(quantityConfigs.increment)).toString();
                }
                //@ts-ignore
                if(quantityConfigs.maximum && Number(newPriceConfigs[i][name]) > quantityConfigs.maximum){
                    newPriceConfigs = newPriceConfigs.slice(0,i);
                    break;
                }
            }
        }
    } 

    if(name === "percentage"){
      if(discountType.type === "percentage"){
        if(index > 0 && Number(value) < Number(newPriceConfigs[index-1].percentage)){
          newPriceConfigs[index].percentage = (Number(newPriceConfigs[index-1].percentage) + 1).toString();
        }
        if(discountType.type === "percentage" && Number(value) > 100){
          newPriceConfigs[index].percentage = "100";
        }
      }
      if(discountType.type === "fixedAmount"){
        if(index > 0 && Number(value) > Number(newPriceConfigs[index-1].percentage)){
          newPriceConfigs[index].percentage = (Number(newPriceConfigs[index-1].percentage) - 1).toString();
        }
        if(Number(value) > Number(variantPrice)){
          newPriceConfigs[index].percentage = variantPrice;
        }
      }
      
    }  

    setPriceConfigs(newPriceConfigs);
  }

  const handleQuantityChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = event.target;
    setQuantityConfigs(prev => ({ ...prev, [name]: value }));
  }, [setQuantityConfigs]);

  const handleValidateQuantityChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    let { ...onChangeValue } = quantityConfigs;
    let newPriceConfigs = [...priceConfigs];

    if(onChangeValue.increment && Number(onChangeValue.increment) < 1){
        onChangeValue.increment = "1"
    }

    if(Number(onChangeValue.minimum) < Number(onChangeValue.increment)){
        onChangeValue.minimum = onChangeValue.increment;
    }

    if(Number(onChangeValue.minimum) > Number(onChangeValue.increment) && (Number(onChangeValue.minimum) % Number(onChangeValue.increment))){
        onChangeValue.minimum = (Number(onChangeValue.minimum) + Number(onChangeValue.increment) - (Number(onChangeValue.minimum) % Number(onChangeValue.increment))).toString();
    }

    if(onChangeValue.maximum && Number(onChangeValue.maximum) < Number(onChangeValue.minimum)){
        onChangeValue.maximum = onChangeValue.minimum;
    }

    if(onChangeValue.maximum && Number(onChangeValue.maximum) > Number(onChangeValue.minimum) && (Number(onChangeValue.maximum) % Number(onChangeValue.increment))){
        onChangeValue.maximum = (Number(onChangeValue.maximum) + Number(onChangeValue.increment) - (Number(onChangeValue.maximum) % Number(onChangeValue.increment))).toString();
    }

    for(let i=0; i <= (newPriceConfigs.length - 1); i++){
        if(i===0){
            if(Number(newPriceConfigs[0].quantity) < Number(onChangeValue.minimum)){
                newPriceConfigs[0].quantity = onChangeValue.minimum?.toString() ?? '';
            }else if(Number(newPriceConfigs[0].quantity) > Number(onChangeValue.minimum) && (Number(newPriceConfigs[0].quantity)%Number(onChangeValue.increment))){
                newPriceConfigs[0].quantity = (Number(newPriceConfigs[0].quantity) + Number(onChangeValue.increment) - (Number(newPriceConfigs[0].quantity) % Number(onChangeValue.increment))).toString();
            }else if(onChangeValue.maximum && Number(newPriceConfigs[0].quantity) > Number(onChangeValue.maximum)){
                newPriceConfigs[0].quantity = onChangeValue.maximum?.toString() ?? '';
            }
        }else{
            if(Number(newPriceConfigs[i].quantity) < ((Number(newPriceConfigs[i-1].quantity) + Number(onChangeValue.increment))) && !(Number(newPriceConfigs[i].quantity)%Number(onChangeValue.increment))){
                newPriceConfigs[i].quantity = (Number(newPriceConfigs[i-1].quantity) + Number(onChangeValue.increment)).toString();
            }else if(Number(newPriceConfigs[i].quantity) < ((Number(newPriceConfigs[i-1].quantity) + Number(onChangeValue.increment))) && (Number(newPriceConfigs[i].quantity)%Number(onChangeValue.increment))){
                newPriceConfigs[i].quantity = (Number(newPriceConfigs[i-1].quantity) + Number(onChangeValue.increment) - (Number(newPriceConfigs[0].quantity) % Number(onChangeValue.increment))).toString();
            }else if(Number(newPriceConfigs[i].quantity) > (Number(newPriceConfigs[i-1].quantity) + Number(onChangeValue.increment))){
                newPriceConfigs[i].quantity = (Number(newPriceConfigs[i-1].quantity) + Number(onChangeValue.increment)).toString();
            }
            
            if(onChangeValue.maximum && Number(newPriceConfigs[i].quantity) > Number(onChangeValue.maximum)){
                newPriceConfigs = newPriceConfigs.slice(0,i);
                break;
            }
        }
    }

    setQuantityConfigs(onChangeValue);
    setPriceConfigs(newPriceConfigs);
  };

  const handleShowModal = (productId: string) => {
    // If there are multiple selections, use the first selected product's config as template
    const productConfigs = productsPriceAndQuantityConfigs.find((config) => config.productId === productId);
    const selectedVariant = products.find((product) => product.id === productId);

    setQuantityConfigs(
      productConfigs?.volume && Object.keys(productConfigs.volume).length > 0 
        ? productConfigs.volume 
        : {minimum: "", increment: "", maximum: ""}
    );
    setPriceConfigs(productConfigs?.price ?? []);

    setDiscountType(productConfigs?.type && productConfigs?.type === "fixedAmount" ? createDiscountType("fixedAmount") : createDiscountType("percentage"));
    
    setVariantPrice(selectedVariant?.price ?? "");
    // Store all selected product IDs
    if (selectedResources.length > 0) {
      setSelectedProductId(selectedResources as string[]);
    } else { 
      setSelectedProductId([productId as string]);
    }
    shopify.modal.show("price-quantity-modal");
  };

  const handleCancel = useCallback(() => {
    shopify.modal.hide("price-quantity-modal");
  }, [shopify.modal]);

  const handleSave = useCallback(() => {
    selectedProductId.forEach(id => {
      const newConfig: IProductPriceQuantityConfigs = {
        productId: id,
        price: priceConfigs,
        volume: quantityConfigs,
        type: discountType?.type
      };

      const existingConfig = productsPriceAndQuantityConfigs.find(
        config => config.productId === id
      );
      
      const hasChanges = (!existingConfig && 
        (priceConfigs.length > 0 || 
        Object.values(quantityConfigs).some(value => value !== ""))
      ) || 
      (existingConfig && (
        JSON.stringify(existingConfig.price) !== JSON.stringify(priceConfigs) ||
        JSON.stringify(existingConfig.volume) !== JSON.stringify(quantityConfigs) ||
        JSON.stringify(existingConfig?.type) !== JSON.stringify(discountType?.type)
      ));

      if(hasChanges) {
        setProductsPriceAndQuantityConfigs(prev => {
          const existIndex = prev.findIndex(item => item.productId === id);
          if (existIndex !== -1) {
            return prev.map((item, index) => index === existIndex ? newConfig : item);
          } else {
            return [...prev, newConfig];
          }
        });

        setProducts(prev => prev.map((product: ProductVariant) => {
          if (product.id === id) {
            return { 
              ...product, 
              metafield: { 
                value: JSON.stringify({
                  volume: quantityConfigs, 
                  price: priceConfigs,
                  type: discountType.type
                }) 
              } 
            };
          }
          return product;
        }));

        setHasUnsavedChanges(true);
      }
    });

    shopify.modal.hide("price-quantity-modal");
    clearSelection();
  }, [selectedProductId, priceConfigs, quantityConfigs, productsPriceAndQuantityConfigs, discountType, setHasUnsavedChanges, shopify.modal, clearSelection]);

  const handleSearchChange = useCallback((value: string) => {
    setSearchTerm(value);
  }, [setSearchTerm]);

  // Update pagination handler
  const handlePaginationChange = useCallback((direction: 'prev' | 'next') => {
    if (hasUnsavedChanges) {
      shopify.modal.show('unsaved-changes-modal');
    } else {
      const newSearchParams = new URLSearchParams(searchParams);
      const cursorHistory = JSON.parse(sessionStorage.getItem('cursorHistory') || '[]');

      if (direction === 'next' && pageInfo.hasNextPage) {
        newSearchParams.set('cursor', pageInfo.endCursor);
      } else if (direction === 'prev' && pageInfo.hasPreviousPage) {
        const currentCursor = searchParams.get('cursor');
        const currentIndex = cursorHistory.indexOf(currentCursor);
        
        if (currentIndex > 0) {
          newSearchParams.set('cursor', cursorHistory[currentIndex - 1]);
        } else {
          newSearchParams.delete('cursor');
        }
        
        if (currentIndex !== -1) {
          cursorHistory.splice(currentIndex);
          sessionStorage.setItem('cursorHistory', JSON.stringify(cursorHistory));
        }
      }

      // Preserve all necessary parameters
      newSearchParams.set('pageSize', pageSize.toString());
      newSearchParams.set('groupTag', groupTag || '');
      newSearchParams.set('groupName', groupName || '');
      newSearchParams.set('groupId', groupId || '');
      if (isNewGroup) newSearchParams.set('isNewGroup', isNewGroup);
      if (searchTerm) newSearchParams.set('search', searchTerm);
      
      setSearchParams(newSearchParams);
      setIsLoadingPage(true);
    }
  }, [searchParams, setSearchParams, pageInfo, hasUnsavedChanges, pageSize, searchTerm, groupTag, groupName, groupId, isNewGroup, shopify.modal]);

  const handlePageSizeChange = useCallback(
    (newSize: string) => {
      if (hasUnsavedChanges) {
        shopify.modal.show('unsaved-changes-modal');
      } else {    
        // Clear cursor history when changing page size
        sessionStorage.removeItem('cursorHistory');
        
        const newSearchParams = new URLSearchParams(searchParams);
        newSearchParams.set('pageSize', newSize);
        newSearchParams.delete('cursor'); // Reset cursor position
        
        // Preserve other necessary parameters
        if (searchTerm) newSearchParams.set('search', searchTerm);
        newSearchParams.set('groupTag', groupTag || '');
        newSearchParams.set('groupName', groupName || '');
        newSearchParams.set('groupId', groupId || '');
        if (isNewGroup) newSearchParams.set('isNewGroup', isNewGroup);
        
        setSearchParams(newSearchParams);
        setIsLoadingPage(true);
      }
    },
    [
      searchParams, 
      setSearchParams, 
      hasUnsavedChanges, 
      searchTerm, 
      groupTag, 
      groupName, 
      groupId, 
      isNewGroup, 
      shopify.modal
    ]
  );
  
  const handleUpdateConfigs = useCallback(() => {
    setIsSaving(true);
    shopify.saveBar.hide('updated-save-bar');
    const formData = new FormData();
    formData.append('includedProductList', JSON.stringify(includedProductList));
    formData.append('productsPriceAndQuantityConfigs', JSON.stringify(productsPriceAndQuantityConfigs));
    formData.append('includedProducts', JSON.stringify(includedProducts));

    submit(formData, { method: 'post' });
  }, [groupTag, includedProductList, productsPriceAndQuantityConfigs, includedProducts, groupId, submit]);

  const removeConfig = useCallback((productId: string) => {
    setProductsPriceAndQuantityConfigs(prev => prev.filter(config => config.productId !== productId));
    
    setProducts(prev => prev.map(product => {
      if (product.id === productId) {
        return { ...product, metafield: null };
      }
      return product;
    }));

    setHasUnsavedChanges(true);
  }, []);
  
  const rowMarkup = products.length > 0 ? products.map((product: any, index: number) => (
    <IndexTable.Row 
      id={product.id} 
      key={product.id} 
      selected={selectedResources.includes(product.id)} 
      position={index}
    >
      <IndexTable.Cell>
        <Thumbnail source={product?.featuredImage || ImageIcon} alt={product.displayName ?? 'Not Set'}/> 
      </IndexTable.Cell>
      <IndexTable.Cell>{product.displayName}</IndexTable.Cell>
      <IndexTable.Cell>{product.status}</IndexTable.Cell>
      <IndexTable.Cell>
        <Button 
          icon={SettingsFilledIcon} 
          onClick={() => handleShowModal(product.id)} 
          tone={(product.metafield && Object.keys(product.metafield).length > 0) ? 'success' : 'critical'}
          disabled={selectedResources.length >= 2}
        >
          {(product.metafield && Object.keys(product.metafield).length > 0) ? 'Configured' : 'No Configurations'}
        </Button>
        {(product.metafield && Object.keys(product.metafield).length > 0) && (
          <Button icon={XIcon} 
            onClick={() => removeConfig(product.id)} 
            tone='critical'
            disabled={selectedResources.length >= 2}
          >
            Remove
          </Button>
        )}
      </IndexTable.Cell>
      <IndexTable.Cell></IndexTable.Cell>
    </IndexTable.Row>
  )) : null;

  const handleDiscard = useCallback(() => {
    setHasUnsavedChanges(false);
    setProducts(productsVariants);
    setProductsPriceAndQuantityConfigs(priceAndQuantityConfigs);
    shopify.saveBar.hide('updated-save-bar');
  }, [productsVariants, priceAndQuantityConfigs, shopify.saveBar]);

  // Update search handler
  const handleSearchSubmit = useCallback(() => {
    if (hasUnsavedChanges) {
      shopify.modal.show('unsaved-changes-modal');
    } else {
      sessionStorage.removeItem('cursorHistory'); // Clear cursor history on new search
      const newSearchParams = new URLSearchParams(searchParams);
      newSearchParams.delete('cursor'); // Reset cursor
      if (searchTerm) {
        newSearchParams.set('search', searchTerm);
      } else {
        newSearchParams.delete('search');
      }
      setSearchParams(newSearchParams);
      setIsLoadingPage(true);
    }
  }, [searchTerm, searchParams, setSearchParams, hasUnsavedChanges, shopify.modal]);

  const handleConfirmSearch = useCallback(() => {
    setHasUnsavedChanges(false);
    shopify.saveBar.hide('updated-save-bar');
    shopify.modal.hide('unsaved-changes-modal');

    const newSearchParams = new URLSearchParams(searchParams);
    newSearchParams.delete('cursor');
    newSearchParams.set('search', searchTerm);
    setSearchParams(newSearchParams);

  }, [searchTerm, searchParams, setSearchParams, shopify.saveBar, shopify.modal]);

  const handlePricingTypeChange = useCallback((type: "percentage" | "fixedAmount") => {
    setDiscountType(createDiscountType(type));
  }, []);

  return (
    <>
      {isSaving ? (
        <PageLoadSpinner 
          title="Saving your changes..." 
          subtitle="Please wait, this may take a few moments"
        />
      ) : (
    <>
      <SaveBar id="updated-save-bar">
        <button variant="primary" onClick={handleUpdateConfigs}>Save</button>
        <button onClick={handleDiscard}>Discard</button>
      </SaveBar>
      {(isNewGroup && isNewGroup === "true") && <JourneyBreadcrumb currentStep={2} />}
      <Page fullWidth>
        <Layout>
          <Layout.Section>
            <PageHeader 
              title="Individual Product Rules" 
              subtitle={groupName || ""}
            />
          </Layout.Section>
          <Layout.Section>
            <Text as="p">This step is optional. Use this page only if you have specific products that need customized purchasing rules. Here, you can select one or multiple products to adjust their pricing, modify quantity requirements, or add tiered pricing. These customizations will override the default storewide purchasing rules set in Step 1, offering flexibility for unique product needs.</Text><br/>
            <Text as="p">To begin, select the desired product(s) from the table below, then click <strong>"Customize Purchasing Rules"</strong> at the top of the table to apply your adjustments.</Text>
          </Layout.Section>
            <Layout.Section>
              <div style={{display: "flex", justifyContent: "flex-end", alignContent: "flex-end", gap: "10px"}}>
              <Link to={{
                pathname:"/app/segment/",
                search: `?groupId=${groupId}&groupName=${groupName}&groupTag=${groupTag}`
                }} ><div hidden={(isNewGroup && isNewGroup === "true")? true : false}><Button> Back </Button></div>
              </Link>
              <Button variant="primary" onClick={handleUpdateConfigs}>{((isNewGroup && isNewGroup === "true") ? "Save and Continue" : "Save Changes")  }</Button>
            </div>
          </Layout.Section>
          <Layout.Section>
            <div style={{ padding: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <Text variant="headingMd" as="h2">Products</Text>
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-end' }}>
                      <TextField
                          label="Search Product Variants"
                          value={searchTerm}
                          onChange={handleSearchChange}
                          autoComplete="off"
                      />
                      <Button onClick={handleSearchSubmit}>Search</Button>
                      <Select
                        label="Page size"
                        options={[
                          {label: '5 per page', value: '5'},
                          {label: '10 per page', value: '10'},
                          {label: '20 per page', value: '20'},
                          {label: '50 per page', value: '50'},
                        ]}
                        onChange={handlePageSizeChange}
                        value={pageSize.toString()}
                      />
                  </div>
              </div>
              {isLoadingPage ? (
              <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '200px' }}>
                  <Spinner accessibilityLabel="Loading" size="large" />
              </div>
              ) : (
                <><IndexTable
                selectable={true}
                resourceName={resourceName}
                itemCount={products.length}
                selectedItemsCount={allResourcesSelected ? 'All' : selectedResources.length}
                onSelectionChange={handleSelectionChange}
                promotedBulkActions={[
                  {
                    content: "Customize Purchasing Rules",
                    onAction: () => handleShowModal(selectedResources[0]),
                  },
                ]}
                headings={[
                  {title: ''},    
                  {title: 'Name'},
                  {title: 'Status'},
                  {title: 'Price and Quantity Configurations'}
                ]}
              >
                {rowMarkup}
              </IndexTable>
              {(selectedTab === 0) && <Pagination
                  hasPrevious={pageInfo.hasPreviousPage}
                  onPrevious={() => !isPaginating && handlePaginationChange('prev')}
                  hasNext={pageInfo.hasNextPage}
                  onNext={() => !isPaginating && handlePaginationChange('next')}
              />}
              </>
              )}   
          </Layout.Section>
          <Modal id="price-quantity-modal">
            <div>                       
              <Card>
                <Text as="h2" variant="headingMd" fontWeight="medium">
                Quantity Rules
                </Text>
                Minimum: <br/><input
                  style={{width: '50%'}}
                  name="minimum"
                  type="number"
                  value={quantityConfigs.minimum}
                  onChange={(event) => handleQuantityChange(event)}
                  onBlur={(event) => handleValidateQuantityChange(event)}
                /><br/>
                Maximum: <br/><input
                  style={{width: '50%'}}
                  name="maximum"
                  type="number"
                  value={quantityConfigs.maximum}
                  onChange={(event) => handleQuantityChange(event)}
                  onBlur={(event) => handleValidateQuantityChange(event)}
                /><br/> 
                Increment: <br/><input
                  style={{width: '50%'}}
                  name="increment"
                  type="number"
                  value={quantityConfigs.increment}
                  onChange={(event) => handleQuantityChange(event)}
                  onBlur={(event) => handleValidateQuantityChange(event)}
                /><br/> 
              </Card><br/>
              <Card>
              <Text as="h2" variant="headingMd" fontWeight="medium">
                  Discount Type
                </Text><br/>
                  <label>
                    <input
                      type="radio"
                      name="pricingType"
                      value="percentage"
                      checked={discountType.type === "percentage"}
                      onChange={() => handlePricingTypeChange("percentage")}
                    />
                    Percentage
                  </label><br/>
                  <label>
                    <input
                      type="radio"
                      name="pricingType"
                      value="fixedAmount"
                      checked={discountType.type === "fixedAmount"}
                      onChange={() => handlePricingTypeChange("fixedAmount")}
                    />
                    Fixed Price
                  </label>
                  <br/>
              </Card><br/>
              <Card>
                <Text as="h2" variant="headingMd" fontWeight="medium">
                  Volume Pricing (MSRP: {variantPrice})
                </Text>
                {priceConfigs.map((config, index) => (     
                <div className="input_container" key={index}><br/>
                  &nbsp;&nbsp;&nbsp;Minimum quantity: <input
                    style={{width: '10em'}}
                    name="quantity"
                    type="number"
                    value={config.quantity}
                    onChange={(event) => handleChange(event, index)}
                    onBlur={(event) => handleValidatePriceConfigs(event, index)}
                  />
                    &nbsp;{discountType.caption}: <input
                    style={{width: '10em'}}
                    name="percentage"
                    type="number"
                    value={config.percentage}
                    onChange={(event) => handleChange(event, index)}
                    onBlur={(event) => handleValidatePriceConfigs(event, index)}
                  />&nbsp;
                  {priceConfigs.length > 0 && (
                    <Button onClick={() => handleDeleteConfig(index)} icon={XIcon} tone="critical" variant="tertiary"></Button>
                  )}
                  <br/>
                </div>))} 
                <br/><Button onClick={() => handleAddConfig()} icon={PlusIcon}>Add Price Break</Button> <Button onClick={handleRemoveAllPriceConfig} icon={DeleteIcon} tone="critical" disabled={!priceConfigs.length}>Reset All</Button>
              </Card>
            </div>
            <TitleBar title="Price and Quantity Settings">
              <button variant="primary" onClick={handleSave}> SAVE </button>
              <button onClick={handleCancel}>CANCEL</button>
            </TitleBar>
          </Modal>
          <Modal id="unsaved-changes-modal">
            <div style={{padding: '16px'}}><Text as="h3" variant="headingSm" alignment="center" tone="caution">You have unsaved changes. Searching will discard these changes. Do you want to continue?</Text></div>
            <TitleBar title="Unsaved Changes">
              <button variant="primary" onClick={handleConfirmSearch}>Proceed with Search</button>
              <button onClick={() => shopify.modal.hide('unsaved-changes-modal')}>Cancel</button>
            </TitleBar>
          </Modal>
        </Layout>     
      </Page>
    </>
    )}
    </>
  );
};

export default ProductVolumePricing;