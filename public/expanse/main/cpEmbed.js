let cpCurrentScript = document.currentScript || (function () {
    let cpScripts = document.getElementsByTagName('script');
    return cpScripts[cpScripts.length - 1];
})();

let cpUrl = new URL(cpCurrentScript.src);
let cpParams = new URLSearchParams(cpUrl.search);

// Extract the parameters
const cpConfig = {
    apiKey: cpParams.get("api_key"),
    appDomain: cpParams.get("appDomain"),
    customerId: cpParams.get("customerId"),
    shopId: cpParams.get("shopId"),
    shopDomain: cpParams.get("shopDomain"),
    storeType: cpParams.get("storeType"),
    timestamp: cpParams.get("timestamp"),
    hmac: cpParams.get("hmac"),
    productVariantId: cpParams.get("productVariantId"),
    productId: cpParams.get("productId")
};

console.log('cpConfig loaded', cpConfig);

(function() {  
    initializeComplementaryProductState();
    updateDisplay();
})();

function initializeComplementaryProductState() {
    window.productPageState.customerId = cpConfig.customerId;
    window.productPageState.productId = cpConfig.productId;
    window.productPageState.productVariantId = cpConfig.productVariantId;
    window.productPageState.shop = cpConfig.shopDomain;
    window.complementaryProductState.customerId = cpConfig.customerId;
    window.complementaryProductState.productId = cpConfig.productId;
    window.complementaryProductState.variantId = cpConfig.productVariantId;
    window.complementaryProductState.shop = cpConfig.shopDomain;
}
function createComplementaryProduct() {    
    const element = window.complementaryProductService.generateComplementaryProductBlock();
    const complement = window.complementaryProductState.complementaryProductElement;
    complement.complementaryProductBlock = document.getElementById('complementary-product-block');
    complement.complementaryProductBlock.innerHTML = element;
    complement.complementaryProductBlockUI = document.getElementById('complementary-product-block-ui');
    complement.complementaryProductHeader = document.getElementById('complementary-product-header');
    complement.complementaryProductSubHeader = document.getElementById('complementary-product-subheader');
    complement.addToCartComplementaryProduct = document.getElementById('add-complementary-product');
    complement.learnMoreComplementaryProduct = document.getElementById('learn-more-complementary-product');
    complement.complementaryQuantityInput = document.getElementById('complementary-quantity-input');
    complement.complementaryQuantityMinus = document.getElementById('complementary-quantity-minus');
    complement.complementaryQuantityPlus = document.getElementById('complementary-quantity-plus');
    complement.complementaryProductImage = document.getElementById('complementary-product-image');
    complement.complementaryProductTitle = document.getElementById('complementary-product-title');
    complement.complementaryProductPrice = document.getElementById('complementary-product-price');
    complement.complementaryProductDescription = document.getElementById('complementary-product-description');
    complement.complementaryProductDescriptionTooltip = document.getElementById('complementary-product-description-tooltip');
    complement.complementaryQuantityInputGroup = document.getElementById('complementary-quantity-input-group');
    complement.complementaryVolumeQuantities = document.getElementById('complementary-volume-quantities');
}
function closeComplementaryPopup() {
    const popup = document.getElementById('complementary-product-popup');
    const popupQuantityMinus = document.getElementById('complementary-popup-quantity-minus');
    const popupQuantityPlus = document.getElementById('complementary-popup-quantity-plus');
    if (popup.minusHandler) {
        popupQuantityMinus.removeEventListener('click', popup.minusHandler);
        popup.minusHandler = null;
    }
    if (popup.plusHandler) {
        popupQuantityPlus.removeEventListener('click', popup.plusHandler);
        popup.plusHandler = null;
    }
    popup.style.display = 'none';
    document.body.style.overflow = ''; // Restore scrolling
}
function createComplementaryPopup() {
    const popupElement = document.createElement('div');
    popupElement.id = 'complementary-product-popup';
    popupElement.className = 'complementary-popup';
    popupElement.innerHTML = window.complementaryProductService.generateComplementaryProductPopup();
    document.body.appendChild(popupElement);
    const closeButton = popupElement.querySelector('.close');
    if (closeButton) {
        closeButton.addEventListener('click', closeComplementaryPopup);
    }
    popupElement.addEventListener('click', function(event) {
        if (event.target === popupElement) {
            closeComplementaryPopup();
        }
    });
    const addToCartBtn = popupElement.querySelector('.add-to-cart-btn');
    if (addToCartBtn) {
        addToCartBtn.addEventListener('click', async () => {
            await addComplementaryProductToCart();
            closeComplementaryPopup();
        });
    }
}
async function getComplementaryProduct(){
    try {     
        const data = await window.complementaryProductService.getComplementaryProduct(cpConfig.appDomain, window.complementaryProductState.shop, cpConfig.apiKey, cpConfig.timestamp, cpConfig.hmac, window.complementaryProductState.com, window.complementaryProductState.variantId);  
        window.complementaryProductState.complementaryProduct = data;      
    } catch (error) {
        console.error('Error:', error);
        document.getElementById('complementary-product-block').style.display = 'none';
    }
}
async function getComplementaryProductNormalPrice(){
    try {
        const data = await window.productPricingService.getNormalPricingByProductVariantId(cpConfig.appDomain, window.complementaryProductState.shop, cpConfig.apiKey, cpConfig.timestamp, cpConfig.hmac, window.complementaryProductState.customerId, window.complementaryProductState.complementaryProduct.complementaryProductVariantId);
        window.complementaryProductState.complementaryProductNormalPrice = data;      
    } catch (error) {
        console.error('Error:', error);
        document.getElementById('complementary-product-block').style.display = 'none';
    }
}
async function getComplementaryProductVolumePrice(){
    try {
        console.log('calling 444');
        const data = await window.productPricingService.getVolumePricingByProductVariantId(cpConfig.appDomain, window.complementaryProductState.shop, cpConfig.apiKey, cpConfig.timestamp, cpConfig.hmac, window.complementaryProductState.customerId, window.complementaryProductState.complementaryProduct.complementaryProductVariantId);
        window.complementaryProductState.complementaryProductVolumePrice = data;      
    } catch (error) {
        console.error('Error:', error);
        document.getElementById('complementary-product-block').style.display = 'none';
    }
}
async function getProductVolumePrice(){
    try {       
        console.log('calling 123');
        const data = await window.productPricingService.getVolumePricingByProductVariantId(cpConfig.appDomain, window.complementaryProductState.shop, cpConfig.apiKey, cpConfig.timestamp, cpConfig.hmac, window.complementaryProductState.customerId, window.productPageState.productVariantId);
        window.productPageState.productVolumePricing = data;      
    } catch (error) {
        console.error('Error:', error);
    }
}
function complementaryPricingIncrementQuantity(e) {
    e.preventDefault();
    if (window.complementaryProductState.complementaryProductNormalPrice) {
        let currentValue = parseInt(window.complementaryProductState.complementaryProductElement.complementaryQuantityInput.value, 10);
        currentValue++;
        window.complementaryProductState.complementaryProductElement.complementaryQuantityInput.value = currentValue;
        return;
    }
    if (window.complementaryProductState.complementaryProductVolumePrice) {
        const volumeConfig = window.complementaryProductState.complementaryProductVolumePrice.volumeConfig;
        let currentValue = parseInt(window.complementaryProductState.complementaryProductElement.complementaryQuantityInput.value, 10);
        currentValue += parseInt(volumeConfig.increment, 10);
        if (currentValue > volumeConfig.maximum) {
            currentValue = volumeConfig.maximum;
        }
        const priceConfig = window.complementaryProductState.complementaryProductVolumePrice.priceConfig.find(p => currentValue >= p.quantity && currentValue < p.maxQuantity);
        if (priceConfig) {
            window.complementaryProductState.complementaryProductElement.complementaryProductPrice.style.alignItems = 'center';
            window.complementaryProductState.complementaryProductElement.complementaryProductPrice.innerHTML = `
            <span style="font-size: 1.2em; font-weight: bold; margin-right: 5px;">${priceConfig.currencySymbol}${priceConfig.price}</span>
            <span style="font-size: 0.8em; color: #666;">MSRP ${priceConfig.originalPrice}</span>
            `;
        }
        window.complementaryProductState.complementaryProductElement.complementaryQuantityInput.value = currentValue;
        return;
    }
}
function complementaryPricingDecrementQuantity(e) {
    e.preventDefault();
    if (window.complementaryProductState.complementaryProductNormalPrice) {
        let currentValue = parseInt(window.complementaryProductState.complementaryProductElement.complementaryQuantityInput.value, 10);
        currentValue--;
        if (currentValue < 1) {
            currentValue = 1;
        }
        window.complementaryProductState.complementaryProductElement.complementaryQuantityInput.value = currentValue;
        return;
    } 
    if (window.complementaryProductState.complementaryProductVolumePrice) {
        const volumeConfig = window.complementaryProductState.complementaryProductVolumePrice.volumeConfig;
        let currentValue = parseInt(window.complementaryProductState.complementaryProductElement.complementaryQuantityInput.value, 10);
        currentValue -= volumeConfig.increment;
        if (currentValue < volumeConfig.minimum || currentValue < 1) {
            currentValue = volumeConfig.minimum === 0 ? 1 : volumeConfig.minimum;
        }
        const priceConfig = window.complementaryProductState.complementaryProductVolumePrice.priceConfig.find(p => currentValue >= p.quantity && currentValue < p.maxQuantity);
        if (priceConfig) {
            window.complementaryProductState.complementaryProductElement.complementaryProductPrice.style.alignItems = 'center';
            window.complementaryProductState.complementaryProductElement.complementaryProductPrice.innerHTML = `
                <span style="font-size: 1.2em; font-weight: bold; margin-right: 5px;">${priceConfig.currencySymbol}${priceConfig.price}</span>
                <span style="font-size: 0.8em; color: #666;">MSRP ${priceConfig.currencySymbol}${priceConfig.originalPrice}</span>               
            `;
        }
        window.complementaryProductState.complementaryProductElement.complementaryQuantityInput.value = currentValue;
        return;
    }
}

function showComplementaryToast(message, type = 'error') {
    const toast = document.getElementById('complementary-product-toast');
    toast.textContent = message;
    toast.className = 'toast'; // Reset class
    toast.classList.add(type);
    toast.style.display = 'block';
    setTimeout(() => {
        toast.style.display = 'none';
    }, 3000); // Hide after 3 seconds
}

function extractIdFromGid(gid) {
    const parts = gid.split('/');
    return parts[parts.length - 1];
}

function showComplementaryPopup() {
    const productInfo = window.complementaryProductState.complementaryProduct.complementaryProductInfo;
    const popup = document.getElementById('complementary-product-popup');
    const popupImage = document.getElementById('complementary-popup-product-image');
    const popupTitle = document.getElementById('complementary-popup-product-title');
    const popupDescription = document.getElementById('complementary-popup-product-description');
    const popupDescriptionTooltip = document.getElementById('complementary-popup-product-description-tooltip');
    const popupQuantityInput = document.getElementById('complementary-popup-quantity-input');
    const popupQuantityMinus = document.getElementById('complementary-popup-quantity-minus');
    const popupQuantityPlus = document.getElementById('complementary-popup-quantity-plus');
    const popupQuantityLimits = document.getElementById('complementary-popup-quantity-limits');
    const popupPrice = document.getElementById('complementary-popup-product-discount-price');
    const popupMsrpPrice = document.getElementById('complementary-popup-product-msrp-price');
    popupImage.src = productInfo.image;
    popupTitle.textContent = productInfo.title;
    popupDescription.textContent = productInfo.description || 'No description available.';
    popupDescriptionTooltip.textContent = productInfo.description || 'No description available.';
    popup.style.display = 'flex';
    document.body.style.overflow = 'hidden';
    if (window.complementaryProductState.complementaryProductVolumePrice) {
        const volumeConfig = window.complementaryProductState.complementaryProductVolumePrice.volumeConfig;      
        const min = volumeConfig.minimum;
        const inc = volumeConfig.increment;
        const max = volumeConfig.maximum === Number.MAX_SAFE_INTEGER ? '∞' : volumeConfig.maximum;
        popupQuantityInput.value = min;
        popupQuantityInput.step = inc;
        popupQuantityInput.max = max;
        popupQuantityInput.readOnly = true;
        if (!volumeConfig.maximum || volumeConfig.maximum == Number.MAX_SAFE_INTEGER) {
            popupQuantityLimits.innerHTML = `Min. ${min} &#x2022; Increments of ${inc}`;
        } else {
            popupQuantityLimits.innerHTML = `Min. ${min} &#x2022; Max ${max} &#x2022; Increments of ${inc}`;
        }
        
        updatePrice(min);
        
        popup.minusHandler = handleMinusClick;
        popup.plusHandler = handlePlusClick;
        popupQuantityMinus.addEventListener('click', handleMinusClick);
        popupQuantityPlus.addEventListener('click', handlePlusClick);
    }
    const tbody = document.getElementById('volume-pricing-tbody');
    tbody.innerHTML = ''; // Clear existing rows
    if (window.complementaryProductState.complementaryProductVolumePrice) {
        const volumeConfig = window.complementaryProductState.complementaryProductVolumePrice.volumeConfig;
        const discountType = window.complementaryProductState.complementaryProductVolumePrice.type;
        window.complementaryProductState.complementaryProductVolumePrice.priceConfig.forEach(config => {
            const row = document.createElement('tr');
            if (discountType === 'fixedAmount'){
                row.innerHTML = `
                    <td>${config.quantity === 0 ? volumeConfig.minimum : config.quantity}+</td>
                    <td>${config.currencySymbol}${config.price}</td>
                    <td>${config.currencySymbol}${fixDecimals(config.discountAmount)}</td>
                `;
            } else {
                row.innerHTML = `
                    <td>${config.quantity === 0 ? volumeConfig.minimum : config.quantity}+</td>
                    <td>${config.currencySymbol}${config.price}</td>
                    <td>${config.percentage}%</td>
                `;
            }       
            tbody.appendChild(row);
        });}
    popup.scrollTo(0, 0);
    document.body.style.overflow = 'hidden'; // Prevent background scrolling
    popup.style.display = 'flex';
}
function handleMinusClick() {
    let currentValue = parseInt(popupQuantityInput.value, 10);
    currentValue -= parseInt(inc, 10);
    if (currentValue < min || currentValue < 1) {
        currentValue = min === 0 ? 1 : min;
    }
    popupQuantityInput.value = currentValue;
    updatePrice(currentValue);
}
function handlePlusClick() {
    let currentValue = parseInt(popupQuantityInput.value, 10);
    currentValue += parseInt(inc, 10);
    if (volumeConfig.maximum && currentValue > volumeConfig.maximum) {
        currentValue = volumeConfig.maximum;
    }
    popupQuantityInput.value = currentValue;
    updatePrice(currentValue);
}

function updatePrice(quantity) {
    const priceConfig = window.complementaryProductState.complementaryProductVolumePrice.priceConfig.find(
        p => quantity >= p.quantity && quantity < p.maxQuantity
    );
    if (priceConfig) {
        popupPrice.innerHTML = `<span style="font-size: 1.2em; font-weight: bold; margin-right: 5px;">${priceConfig.currencySymbol}${priceConfig.price}</span>`;
        popupMsrpPrice.innerHTML = `<span style="font-size: 0.8em; color: #666;">MSRP ${priceConfig.currencySymbol}${priceConfig.originalPrice}</span>`;
    }
}

function showTopSellerPopup() {
    const productInfo = window.topProductPopupState.topProductData.productInfo;
    const popup = document.getElementById('complementary-product-popup');
    const popupImage = document.getElementById('complementary-popup-product-image');
    const popupTitle = document.getElementById('complementary-popup-product-title');
    const popupDescription = document.getElementById('complementary-popup-product-description');
    popupImage.src = productInfo.image;
    popupTitle.textContent = productInfo.title;
    popupDescription.textContent = productInfo.description || 'No description available.';
    popup.style.display = 'block';
    document.body.style.overflow = 'hidden'; // Prevent scrolling when popup is open
}
async function addComplementaryProductToCart(e) {
    e.preventDefault();
    e.stopImmediatePropagation();
    const target = e.target;
    target.innerHTML = 'Adding...';
    try {
        const cart = await window.cartService.getCart();
        const variantId = extractIdFromGid(window.complementaryProductState.complementaryProduct.complementaryProductVariantId);
        const quantity = parseInt(window.complementaryProductState.complementaryProductElement.complementaryQuantityInput.value);
        const existingItem = cart.items.find(item => item.variant_id === parseInt(variantId));   
        target.innerHTML = 'Added!';
        target.disabled = true;
        target.style.backgroundColor = 'gray';
        target.style.cursor = 'not-allowed';
        if (existingItem) {
            const lineItemId = existingItem.key;
            const existingUpsellQuantity = existingItem.properties?._upsellQuantity || 0;
            const existingIsUpsellOrigin = existingItem.properties?._isUpsellOrigin || null;       
            await window.cartService.updateProductToCart(lineItemId, existingItem.quantity + quantity, {
                "_isUpsellOrigin": existingIsUpsellOrigin,
                "_upsellQuantity": parseInt(existingUpsellQuantity) + quantity
            });
            refreshCartDrawerAndCountNonDestructive();
        } else {
            await window.cartService.addProductToCart(variantId, quantity, {
                "_isUpsellOrigin": true,
                "_upsellQuantity": quantity
            });
            refreshCartDrawerAndCountNonDestructive();
            const postCart = await window.cartService.getCart();
            if (postCart?.item_count === 1) {
                displayTopSellerPopup();
            }
        }     
    } catch (error) {
      console.error('Error adding/updating complementary product in cart:', error);
      showComplementaryToast('Failed to add complementary product to cart. Please try again.', 'error');
    }
}
async function addTopSellerPopupProductToCart() {
    try {
        const cart = await window.cartService.getCart();
        const variantId = extractIdFromGid(window.topProductPopupState.topProductData.productVariantId);
        const quantityInput = document.getElementById('cp-ts-quantity-input');
        const quantity = parseInt(quantityInput.value);
        const existingItem = cart.items.find(item => item.variant_id === parseInt(variantId));     
        if (existingItem) {
            const lineItemId = existingItem.key;
            const existingUpsellQuantity = existingItem.properties?._upsellQuantity || 0;
            const existingIsUpsellOrigin = existingItem.properties?._isUpsellOrigin || null;     
            await window.cartService.updateProductToCart(lineItemId, existingItem.quantity + quantity, {
                "_isUpsellOrigin": existingIsUpsellOrigin,
                "_upsellQuantity": parseInt(existingUpsellQuantity) + quantity
            });
            refreshCartDrawerAndCountNonDestructive();
        } else {
            await window.cartService.addProductToCart(variantId, quantity, {
                "_isUpsellOrigin": true,
                "_upsellQuantity": quantity
            });
            refreshCartDrawerAndCountNonDestructive();
        }      
    } catch (error) {
      console.error('Error adding complementary product to cart:', error);
      showComplementaryToast('Failed to add complementary product to cart. Please try again.', 'error');
    }
}
function updateComplementaryProductButtons() {
    if (!window.complementaryProductState.complementaryProduct.plusButtonFlag) {
        window.complementaryProductState.complementaryProductElement.complementaryQuantityPlus.addEventListener('click', complementaryPricingIncrementQuantity);
        window.complementaryProductState.complementaryProduct.plusButtonFlag = true;
    }
    if (!window.complementaryProductState.complementaryProduct.minusButtonFlag) {
        window.complementaryProductState.complementaryProductElement.complementaryQuantityMinus.addEventListener('click', complementaryPricingDecrementQuantity);
        window.complementaryProductState.complementaryProduct.minusButtonFlag = true;
    }
    if (!window.complementaryProductState.complementaryProduct.addToCartFlag) {
        window.complementaryProductState.complementaryProductElement.addToCartComplementaryProduct.addEventListener('click', addComplementaryProductToCart);
        window.complementaryProductState.complementaryProduct.addToCartFlag = true;
    }
    //if(!window.complementaryProductState.customerId) {
        window.complementaryProductState.complementaryProductElement.learnMoreComplementaryProduct.style.display = 'none';
    //}  
    if (!window.complementaryProductState.complementaryProduct.learnMoreFlag && window.complementaryProductState.customerId) {
        window.complementaryProductState.complementaryProductElement.learnMoreComplementaryProduct.addEventListener('click', showComplementaryPopup);
        window.complementaryProductState.complementaryProduct.learnMoreFlag = true;
    }
}
function updateComplementaryProductElement() {
    const fullDescription = window.complementaryProductState.complementaryProduct.complementaryProductInfo.description;
    window.complementaryProductState.complementaryProductElement.complementaryProductImage.src = window.complementaryProductState.complementaryProduct.complementaryProductInfo.image;
    window.complementaryProductState.complementaryProductElement.complementaryProductImage.style.display = 'flex';
    window.complementaryProductState.complementaryProductElement.complementaryProductImage.style.marginTop = '16px';
    
    window.complementaryProductState.complementaryProductElement.complementaryProductTitle.innerHTML = `
      <a href="${window.complementaryProductState.complementaryProduct.complementaryProductInfo.previewUrl}?variant=${extractIdFromGid(window.complementaryProductState.complementaryProduct.complementaryProductVariantId)}" 
         style="text-decoration: none; color: inherit; cursor: pointer;">
        ${window.complementaryProductState.complementaryProduct.complementaryProductInfo.title}
      </a>
    `;
    window.complementaryProductState.complementaryProductElement.complementaryProductTitle.style.display = 'flex';
    if (window.complementaryProductState.complementaryProductNormalPrice) {
        window.complementaryProductState.complementaryProductElement.complementaryProductPrice.textContent = window.complementaryProductState.complementaryProductNormalPrice.currencySymbol + window.complementaryProductState.complementaryProductNormalPrice.amount;
        window.complementaryProductState.complementaryProductElement.complementaryQuantityInput.readOnly = false;
    } 
    else if (window.complementaryProductState.complementaryProductVolumePrice) {
        const priceInfo = window.complementaryProductState.complementaryProductVolumePrice.priceConfig[0];
        const volumeConfig = window.complementaryProductState.complementaryProductVolumePrice.volumeConfig;
        window.complementaryProductState.complementaryProductElement.complementaryProductPrice.style.alignItems = 'center';
        window.complementaryProductState.complementaryProductElement.complementaryProductPrice.innerHTML = `
            <span style="font-size: 1.2em; font-weight: bold; margin-right: 5px;">${priceInfo.currencySymbol}${priceInfo.price}</span>
            <span style="font-size: 0.8em; color: #666;">MSRP ${priceInfo.currencySymbol}${priceInfo.originalPrice}</span>      
        `;      
        window.complementaryProductState.complementaryProductElement.complementaryQuantityInput.value = volumeConfig.minimum === 0 ? 1 : volumeConfig.minimum;
        window.complementaryProductState.complementaryProductElement.complementaryQuantityInput.readOnly = true;
        const min = volumeConfig.minimum;
        const inc = volumeConfig.increment;
        const max = volumeConfig.maximum === Number.MAX_SAFE_INTEGER ? '∞' : volumeConfig.maximum;
        if (!volumeConfig.maximum || volumeConfig.maximum == Number.MAX_SAFE_INTEGER) {
            window.complementaryProductState.complementaryProductElement.complementaryVolumeQuantities.textContent = `Min. ${min} • Increments of ${inc}`; 
        }
        else {
            window.complementaryProductState.complementaryProductElement.complementaryVolumeQuantities.textContent = `Min. ${min} • Max ${max} • Increments of ${inc}`;
        }
    }
    window.complementaryProductState.complementaryProductElement.complementaryProductPrice.style.display = 'flex';
    window.complementaryProductState.complementaryProductElement.complementaryProductDescription.textContent = `${fullDescription.substring(0, 50)}...`;
    window.complementaryProductState.complementaryProductElement.complementaryProductDescriptionTooltip.textContent = fullDescription;
    window.complementaryProductState.complementaryProductElement.complementaryQuantityInputGroup.style.display = 'flex';
    window.complementaryProductState.complementaryProductElement.addToCartComplementaryProduct.style.display = 'block';
    window.complementaryProductState.complementaryProductElement.learnMoreComplementaryProduct.style.display = 'block';
} 

async function getCustomerTag() {
    const customerId = cpConfig.customerId;
    const tag = await window.customerService.getCustomerTag(cpConfig.appDomain, cpConfig.shopDomain, cpConfig.apiKey, cpConfig.timestamp, cpConfig.hmac, customerId);
    return typeof(tag) == 'string' ? tag : null;
}

async function updateDisplay() {
    let storeType = cpConfig.storeType;
    let customerId = cpConfig.customerId;
    let isB2B = storeType === 'B2B';
    let isHybrid = storeType === 'Hybrid' || !storeType;
    let isCustomerLoggedIn = customerId !== null;
    let customerTag = null;
    let cartData = null;
    customerTag = await getCustomerTag();
    if (isB2B && isCustomerLoggedIn && customerTag) {
        await getComplementaryProduct();
        if (window.complementaryProductState?.complementaryProduct?.complementaryProductVariantId) {
            createComplementaryPopup();
            createComplementaryProduct();
            window.complementaryProductState.complementaryProductElement.complementaryProductHeader.textContent = 'Increase Your Sales With This Complementary Product';
            window.complementaryProductState.complementaryProductElement.complementaryProductSubHeader.textContent = 'End consumers often also buy this complementary product:';
            window.complementaryProductState.complementaryProductElement.complementaryProductBlockUI.style.display = 'block';
            await getComplementaryProductVolumePrice();
            await Promise.all([
                updateComplementaryProductElement(),
                updateComplementaryProductButtons()
            ]);
        }
    }   
    /*
    if (isHybrid && (!isCustomerLoggedIn || customerTag == null)) {
        await getComplementaryProduct();
        if (window.complementaryProductState?.complementaryProduct?.complementaryProductVariantId) {
            createComplementaryPopup();
            createComplementaryProduct();
            window.complementaryProductState.complementaryProductElement.complementaryProductHeader.textContent = 'Frequently Bought Together:';
            window.complementaryProductState.complementaryProductElement.complementaryProductBlockUI.style.display = 'block';
            await getComplementaryProductNormalPrice();
            await Promise.all([
                updateComplementaryProductElement(),
                updateComplementaryProductButtons()
            ]);
        }
    }
    */
    if (isHybrid && isCustomerLoggedIn && customerTag) { 
        window.productPageService.createProductPageCustomPricing();
        if (productPageState.new.productPriceElement) {
            window.productPageState.new.productPriceElement.style.display = 'none';
            window.productPageState.new.productLoadingSpinner.style.display = 'flex';
            window.productPageService.hideProductPageElements(); 
            await getProductVolumePrice();
        }
        await getComplementaryProduct();
        if (window.complementaryProductState?.complementaryProduct?.complementaryProductVariantId) {
            createComplementaryPopup();
            createComplementaryProduct();
            window.complementaryProductState.complementaryProductElement.complementaryProductHeader.textContent = 'Increase Your Sales With This Complementary Product';
            window.complementaryProductState.complementaryProductElement.complementaryProductSubHeader.textContent = 'End consumers often also buy this complementary product:';
            window.complementaryProductState.complementaryProductElement.complementaryProductBlockUI.style.display = 'block';
            await getComplementaryProductVolumePrice();
            await Promise.all([
                updateComplementaryProductElement(),
                updateComplementaryProductButtons()
            ]);
        }
    }
}