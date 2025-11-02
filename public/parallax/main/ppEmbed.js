const currentScript = document.currentScript || (function () {
    const scripts = document.getElementsByTagName('script');
    return scripts[scripts.length - 1];
})();

const url = new URL(currentScript.src);
const params = new URLSearchParams(url.search);

// Extract the parameters
const config = {
    apiKey: params.get("api_key"),
    appDomain: params.get("appDomain"),
    customerId: params.get("customerId"),
    shopId: params.get("shopId"),
    shopDomain: params.get("shopDomain"),
    storeType: params.get("storeType"),
    timestamp: params.get("timestamp"),
    hmac: params.get("hmac")
};

var Shopify = Shopify || {};
Shopify.theme = Shopify.theme || {};   

const productPriceSelectors = [
    '.content-wrapper .product-thumbnail__info-container'
];

const productCardSelectors = [
    '.content-wrapper .thumbnail'
];

const productCardHeadingSelectors = [
    '.content-wrapper .thumbnail__link'
];

const storeType = config.storeType;
const customerId = config.customerId;
const isB2B = storeType === 'B2B';
const isHybrid = (storeType === 'Hybrid' || !storeType);
const isCustomerLoggedIn = (customerId !== null);

(async function () {
    await initializeProductState();

    const url = new URL(window.location.href);
    const params = new URLSearchParams(url.search);

    if (params.has("openCart")) {
        setTimeout(() => {
            window.cartService.openCartDrawer();

            params.delete("openCart");
            url.search = params.toString();
            window.history.replaceState({}, "", url); 
        }, 1500);
    }

    const windowPathName = window.location.pathname;
    
    const form = document.querySelector('form[action="/cart/add"]');
    if (form) {
        const variantId = form.querySelector('input[name="id"]')?.value || form.querySelector('select[name="id"]')?.value;
        const productId = form.querySelector('input[name="product-id"]')?.value;
        if (variantId) {
            window.productPageState.productVariantId = variantId;
        }
        if (productId) {
            window.productPageState.productId = productId;
        }
    }
    if (isHybrid && !isCustomerLoggedIn) {
        return;
    }
    if (isB2B && !isCustomerLoggedIn) {
        const currentPage = window.location.pathname;
        if (currentPage.includes('/products/')) {
            window.loginRegisterService.createLoginRegisterButtons();
            if (window.complementaryProductState.complementaryProductElement.complementaryProductLoginButtons) {
                window.complementaryProductState.complementaryProductElement.complementaryProductLoginButtons.style.display = 'block';
            }
            if (window.productPageState.original.productOriginalQuantityElement) {
                window.productPageState.original.productOriginalQuantityElement.remove();
            }
            if (window.productPageState.original.productOriginalCartButtons) {
                window.productPageState.original.productOriginalCartButtons.remove();      
            }
            if (window.productPageState.original.productOriginalAddToCartButton) {
                window.productPageState.original.productOriginalAddToCartButton.remove();      
            }
        }
        return;
    }
    const customerTag = await getCustomerTag();
    await initializeProductState();
    // if hybrid and not logged in or hybrid and logged in but no customer tag, do nothing  
    if ((isHybrid && !isCustomerLoggedIn) || (isHybrid && isCustomerLoggedIn && customerTag == null)) {
        window.productPageState.skipEvent = true;
        return;
    }

    // if b2b and not logged in or b2b and logged in but no customer tag, display login register button
    if ((isB2B && isCustomerLoggedIn && customerTag == null) || (isHybrid && isCustomerLoggedIn && customerTag == null) ) {
        const currentPage = window.location.pathname;
        if (currentPage.includes('/products/')) {      // display login register buttons
            window.loginRegisterService.createLoginRegisterButtons();
            if (window.complementaryProductState.complementaryProductElement.complementaryProductLoginButtons) {
                window.complementaryProductState.complementaryProductElement.complementaryProductLoginButtons.style.display = 'block';
            }
            if (window.productPageState.original.productOriginalQuantityElement) {
                window.productPageState.original.productOriginalQuantityElement.remove();
            }
            if (window.productPageState.original.productOriginalCartButtons) {
                window.productPageState.original.productOriginalCartButtons.remove();      
            }

            if (window.productPageState.original.productOriginalAddToCartButton) {
                window.productPageState.original.productOriginalAddToCartButton.remove();      
            }
            
            const inProductAddToCartButtons = document.querySelectorAll('product-form');
            if(inProductAddToCartButtons.length > 0) {
                inProductAddToCartButtons.forEach(el => {
                    el.remove();
                })
            }

            try {
                if(volumeConfig != null && volumeConfig.hasOwnProperty('minimum') && volumeConfig.hasOwnProperty('increment') && volumeConfig.hasOwnProperty('maximum')) {
                    const quantityInfo = document.createElement('p');
                    quantityInfo.id = 'volume-pricing-quantity-info';
                    const min = volumeConfig.minimum;
                    const inc = volumeConfig.increment;
                    const max = volumeConfig.maximum === Number.MAX_SAFE_INTEGER ? '∞' : volumeConfig.maximum;
                    if (!volumeConfig.maximum || volumeConfig.maximum == Number.MAX_SAFE_INTEGER) {
                        quantityInfo.innerHTML = `Min. ${min} &#x2022; Increments of ${inc}`;
                    } else {
                        quantityInfo.innerHTML = `Min. ${min} &#x2022; Max ${max} &#x2022; Increments of ${inc}`;
                    }
                }
            } catch (error) {
                console.log('error in line 168');
                console.log(error.message);
            }
            
            window.productPageState.new.productQuantityElement.insertAdjacentElement('afterend', quantityInfo);
        }

        return;
    }
    if ((isB2B || isHybrid) && isCustomerLoggedIn && customerTag) {
        const currentPage = window.location.pathname;
        if (currentPage.includes('/products/')) {
            window.productPageService.createProductPageCustomPricing();
            if (window.productPageState.new.productPriceElement) {
                window.productPageState.new.productPriceElement.style.display = 'none';
                window.productPageState.new.productLoadingSpinner.style.display = 'flex';
                window.productPageService.hideProductPageElements();
                const data = await getProductVolumePricingByVariantId(window.productPageState.productVariantId);
                window.productPageState.productVolumePricing = data;
                const volumeConfig = data.volumeConfig;
                const quantityInfo = document.createElement('p');
                quantityInfo.id = 'volume-pricing-quantity-info';
                quantityInfo.style.margin = 0;
                try {
                    if(volumeConfig != null && volumeConfig.hasOwnProperty('minimum') && volumeConfig.hasOwnProperty('increment') && volumeConfig.hasOwnProperty('maximum')) {
                        const min = volumeConfig.minimum;
                        const inc = volumeConfig.increment;
                        const max = volumeConfig.maximum === Number.MAX_SAFE_INTEGER ? '∞' : volumeConfig.maximum;
                        if (!volumeConfig.maximum || volumeConfig.maximum == Number.MAX_SAFE_INTEGER) {
                            quantityInfo.innerHTML = `Min. ${min} &#x2022; Increments of ${inc}`;
                        } else {
                            quantityInfo.innerHTML = `Min. ${min} &#x2022; Max ${max} &#x2022; Increments of ${inc}`;
                        }
                    }
                } catch(err) {
                    console.log('Error in line 201');
                    console.log(err.message);    
                }

                setTimeout(() => {
                    document.querySelector('#content_wrapper .product-block--description').append(quantityInfo);
                }, 1000);

                updateProductElement();
            }
        }  
    }

    if(customerTag) {

        const hoverButtons = document.querySelectorAll('.content-wrapper .quick_shop--icon');
        if(hoverButtons.length > 0 && windowPathName.includes('collections')) {
            hoverButtons.forEach(el => {
                el.remove();
            });
        }

        setTimeout(async () => {
            const productsCards = getProductsCards();
            const handleArr = productsCards.map(item => { return item.productHandle }).filter(handle => handle !== null && handle !== undefined);
            const response = await getProductVolumePricingByHandleArr(handleArr);
            const data = response.data;

            if(data != null && data.length > 0) {
                productsCards.map(el => {
                    const matchingResp = data.find(d => {
                        return d.productVariantHandle == el.productHandle
                    });

                    if(matchingResp && matchingResp.returnData) {
                        var variantResp = matchingResp.returnData;
                        el.productVolumePricing = variantResp;

                        const priceSelector = el.cardElement.querySelector('.product-thumbnail__info-container');
                        if(priceSelector) {
                            var firstPriceConfig = variantResp.priceConfig[0];
                            priceSelector.innerHTML = `
                                <span class="thumbnail__price sale">
                                    <span class="money">
                                        ${firstPriceConfig.currencySymbol}${firstPriceConfig.price}
                                    </span>
                                    <span class="was_price">
                                    <span class="money">
                                        ${firstPriceConfig.currencySymbol}${firstPriceConfig.originalPrice}
                                    </span>
                                    </span>
                                    <p class="product-details__unit-price product-details__unit-price--hidden">
                                        <span class="product-details__unit-price-total-quantity" data-total-quantity=""></span> | 
                                        <span class="product-details__unit-price-amount money" data-unit-price-amount=""></span> / 
                                        <span class="product-details__unit-price-measure" data-unit-price-measure=""></span>
                                    </p>
                                </span>
                            `;
                            
                            const imageSelector = el.cardElement.querySelector('.banner_holder');
                            if(imageSelector) {
                                imageSelector.innerHTML = `
                                    <div class="sale_banner">Save ${firstPriceConfig.percentage}%</div> 
                                `;
                            } 
                        }
                    }
                })
            }
        }, 1000);
    }
    // get products cards and pricing
    
})();

async function getProductVolumePricingByHandleArr(handleArr) {
  return await window.productPricingService.getVolumePricingBulkByHandleArray(
    config.appDomain,
    config.shopDomain,
    config.apiKey,
    config.timestamp,
    config.hmac,
    config.customerId,
    handleArr
  );
}

function showProductPriceDisplay(compareAtPrice, showDisplayPrice) {
    return `
        <span class="sale" content="">
            <span class="current_price"><span class="money">${showDisplayPrice}</span></span>
        </span>
        &nbsp;&nbsp;
        <span class="was_price">
            <span class="money"> ${compareAtPrice}</span>
        </span>
        <span class="sold_out"></span>
    `;
}

async function getProductVolumePricingByProductId(productId) {
    const customerId = config.customerId;
    const shop = config.shopDomain;

    return await window.productPricingService.getVolumePricingByProductId(
        config.appDomain, 
        shop, 
        config.apiKey, 
        config.timestamp, 
        config.hmac, 
        customerId, 
        productId
    );
}

async function getProductVolumePricingByVariantId(variantId) {
    const customerId = config.customerId;
    const shop = config.shopDomain;

    return await window.productPricingService.getVolumePricingByProductVariantId(
        config.appDomain, 
        shop, 
        config.apiKey, 
        config.timestamp, 
        config.hmac, 
        customerId, 
        variantId
    );
}

function getProductIdFromScript(targetProductName) {
    const result = [];
    if (window.ShopifyAnalytics && window.ShopifyAnalytics.meta && Array.isArray(window.ShopifyAnalytics.meta.products)) {
        const products = window.ShopifyAnalytics.meta.products;
        products.forEach(product => {
            const productId = product.id;
            if (Array.isArray(product.variants)) {
                product.variants.forEach(variant => {
                    const productName = variant.name;
                    result.push({
                        productId,
                        variantId: variant.id,
                        productName
                    });
                });
            }
        });
        // Use .includes() for partial match
        const match = result.find(p =>
            p.productName.toLowerCase().includes(targetProductName.toLowerCase())
        );

        return match ? match.variantId : null;
    }   
    return null;
}

function extractProductId(cardElement) {
    try {
        let heading = null;
        if (window.location.pathname.includes('/cart')) {
            const tdElements = cardElement.getElementsByTagName('td');
            if (tdElements.length > 0) {
                const link = cardElement.querySelector('a.link.text--strong');
                if (link) {
                    const variantIdMatch = link.href.match(/variant=(\d+)/);
                    if (variantIdMatch) {
                        return variantIdMatch[1];
                    }
                }
            }
        }

        const productIdInp = cardElement.querySelector('input[name="product-id"]');
        if (productIdInp && productIdInp.value && typeof productIdInp.value === "string") {
            return productIdInp.value;
        }
        
        const modal = document.querySelector('theme-modal[data-product-url]');
        const productUrl = modal?.getAttribute('data-product-url');
        if (productUrl) {
            const urlParams = new URLSearchParams(productUrl.split('?')[1]);
            const variantId = urlParams.get('variant');
            if (variantId) return variantId;
        }
        
        for (let selector of productCardHeadingSelectors) {
            heading = cardElement.querySelector(selector);
            if (heading) break;
        }
        
        if (heading && heading.id && typeof heading.id === "string") {
            const idParts = heading.id.split("-");
            return idParts[idParts.length - 1];
        }
        
        const productLink = cardElement.querySelector('.product-grid--price a[data-product-id]');
        const productId = productLink?.dataset.productId;
        if (productId) 
            return productId;
        
        const productIdInput = cardElement.querySelector('input[name="product-id"]');
        const variantIdInput = cardElement.querySelector('form[action="/cart/add"] input[name="id"]');
        if (productIdInput?.value && typeof productIdInput.value === "string") {
            return productIdInput.value || productIdInput.dataset?.productId;
        }
        if (variantIdInput?.value) {
            return variantIdInput.value;
        }
        
        const attrProductId = cardElement.getAttribute('data-product-id');
        if (attrProductId) 
            return attrProductId;
        
        const quickShopElement = cardElement.querySelector('.quick_shop');
        if (quickShopElement) {
            const dataSrc = quickShopElement.getAttribute('data-src');
            if (dataSrc) {
                const productIdFromSrc = dataSrc.match(/fancybox-product-(\d+)/)?.[1];
                if (productIdFromSrc) return productIdFromSrc;
            }
            const dataGallery = quickShopElement.getAttribute('data-gallery');
            if (dataGallery) {
                const productIdFromGallery = dataGallery.match(/product-(\d+)-gallery/)?.[1];
                if (productIdFromGallery) return productIdFromGallery;
            }
        }
        
        if (cardElement.classList.contains('product-block')) {
            const productId = cardElement.getAttribute('data-product-id');
            if (productId) 
                return productId;
        }
        
        const link = cardElement.querySelector('a.link.text--strong');
        if (link) {
            const variantIdMatch = link.href.match(/variant=(\d+)/);
            if (variantIdMatch) {
                return variantIdMatch[1];
            }
        }
        return null;
    } catch (error) {
        return null;
    }
}

function getProductsCards() {
    let cards = [];
    for (let selector of productCardSelectors) {
        const cardInformationDivs = document.querySelectorAll(selector);
        if (cardInformationDivs.length > 0) {
            cards = [...cards, ...Array.from(cardInformationDivs)];
        }
    }
    return Array.from(cards).map(card => {
        let priceDisplay = null;
        for (let selector of productPriceSelectors) {
            priceDisplay = card.querySelector(selector);
            if (priceDisplay) break; // Found valid price container
        }
        if (priceDisplay) {
            priceDisplay.innerHTML = 'Loading...';
        }
        return {
            cardElement: card,
            productHandle: extractProductHandle(card),
            productVolumePricing: null
        };
    }).filter(card => card.productId !== null);
}

function extractProductHandle(card) {
    const anchorTag = card.querySelector('a.thumbnail__link');
    if(anchorTag) {
        const parts = anchorTag.getAttribute('href').split('/');
        return parts[parts.length - 1];
    }
}

async function getCustomerTag() {
    const shop = config.shopDomain;
    const api_key = config.apiKey;
    const appDomain = config.appDomain;
    const timestamp = config.timestamp;
    const hmac = config.hmac;
    const customerId = config.customerId;
    const tag = await window.customerService.getCustomerTag(appDomain, shop, api_key, timestamp, hmac, customerId);
    return typeof(tag) == 'string' ? tag : null;
}

function productPricingIncrementQuantity(event) {
    event.preventDefault();
    if (window.productPageState.productVolumePricing) {      
      const volumeConfig = window.productPageState.productVolumePricing.volumeConfig;
      let currentValue = parseInt(window.productPageState.new.productQuantityInput.value, 10);
      currentValue += parseInt(volumeConfig.increment, 10);
      if (currentValue > volumeConfig.maximum) {
        currentValue = volumeConfig.maximum;
      }
      const priceConfig = window.productPageState.productVolumePricing.priceConfig.find(p => currentValue >= p.quantity && currentValue < p.maxQuantity);
      if (priceConfig) {
        window.productPageState.new.productPriceElement.style.alignItems = 'center';
        let displayPriceHTML = showProductPriceDisplay(`MSRP ${priceConfig.currencySymbol}${priceConfig.originalPrice}`, `${priceConfig.currencySymbol}${priceConfig.price}`);
        window.productPageState.new.productPriceElement.innerHTML = displayPriceHTML;
      }
      //window.productPageState.original.productOriginalQuantityInput.value = currentValue;
      //window.productPageState.new.productQuantityInput.value = currentValue;
      return;
    }
}

function productPricingDecrementQuantity(event) {
    event.preventDefault();
    if (window.productPageState.productVolumePricing) {
      const volumeConfig = window.productPageState.productVolumePricing.volumeConfig;
      let currentValue = parseInt(window.productPageState.new.productQuantityInput.value, 10);
      currentValue -= volumeConfig.increment;
      if (currentValue < volumeConfig.minimum || currentValue < 1) {
        currentValue = volumeConfig.minimum === 0 ? 1 : volumeConfig.minimum;
      }

      const priceConfig = window.productPageState.productVolumePricing.priceConfig.find(p => currentValue >= p.quantity && currentValue < p.maxQuantity);
      if (priceConfig) {
        window.productPageState.new.productPriceElement.style.alignItems = 'center';

        let displayPriceHTML = showProductPriceDisplay(`MSRP ${priceConfig.currencySymbol}${priceConfig.originalPrice}`, `${priceConfig.currencySymbol}${priceConfig.price}`);
        window.productPageState.new.productPriceElement.innerHTML = displayPriceHTML;
      }

      window.productPageState.original.productOriginalQuantityInput.value = currentValue;
      window.productPageState.new.productQuantityInput.value = currentValue;      
      return;
    }
}

async function updateProductElement() {
    if (window.productPageState.productVolumePricing) {
        const priceInfo = window.productPageState.productVolumePricing.priceConfig[0];
        const cart = await window.cartService.getCart();
        const formSelector = document.querySelector('form#product-form');
        var inputQuantityFormSelector = formSelector.querySelector('[name="id"]');
        if(!inputQuantityFormSelector) {
            inputQuantityFormSelector = formSelector.querySelector('select .multi_select');
        }
        const existingItem = cart.items.find(item => item.variant_id === parseInt(inputQuantityFormSelector.value));
        let newQuantity;
        if (existingItem) {
            newQuantity = priceInfo.increment;
        } else {
            newQuantity = priceInfo.quantity;
        }

        window.productPageState.original.productOriginalCartButtons.append(
            Object.assign(document.createElement('input'), {
                type: 'hidden',
                name: 'quantity',
                value: newQuantity
            })
        );

        const volumeConfig = window.productPageState.productVolumePricing.volumeConfig;
        window.productPageState.new.productPriceElement.style.alignItems = 'center';

        let displayPriceHTML = showProductPriceDisplay(
            `MSRP ${priceInfo.currencySymbol}${priceInfo.originalPrice}`, 
            `${priceInfo.currencySymbol}${priceInfo.price}`
        );
        window.productPageState.new.productPriceElement.innerHTML = displayPriceHTML;
       
        if (window.productPageState.original.productOriginalQuantityInput) {
            window.productPageState.original.productOriginalQuantityInput.value = volumeConfig.minimum === 0 ? 1 : volumeConfig.minimum;
        }      
    }
    
    window.productPageState.new.productPriceElement.style.display = 'flex';
    window.productPageState.new.productLoadingSpinner.style.display = 'none';
}

function updateProductButtons() {
    if (!window.productPageState.new.plusButtonFlag) {
      window.productPageState.new.productQuantityPlus.addEventListener('click', productPricingIncrementQuantity);
      window.productPageState.new.plusButtonFlag = true;
    }

    if (!window.productPageState.new.minusButtonFlag) {
      window.productPageState.new.productQuantityMinus.addEventListener('click', productPricingDecrementQuantity);
      window.productPageState.new.minusButtonFlag = true;
    }
}
