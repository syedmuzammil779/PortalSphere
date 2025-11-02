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
    '.product-item .price'
];

const productCardSelectors = [
    'div.product-item',
    'div.product-item__info'
];

const productCardHeadingSelectors = [
    '.product-item__title'
];

const storeType = config.storeType;
const customerId = config.customerId;
const isB2B = storeType === 'B2B' ? true : false;
const isHybrid = (storeType === 'Hybrid' || !storeType) ? true : false;
const isCustomerLoggedIn = (customerId !== null) ? true : false;

(async function () {
    await initializeProductState();
    setTimeout(async () => {
        await window.bindCartDrawerQuantityButtons();
        attachPaginationEventListeners();

        if(window.location.pathname == '/') {
            await populateHomePagePrices();
        }
    }, 500);

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
        //console.debug('Pricing Embed: Hybrid and not logged in, skipping');
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
        if (currentPage.includes('/products/')){
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
                quantityInfo.style.width = '270px';
                quantityInfo.style.marginTop = '10px';
                document.querySelector('.product-form__info-item').style.display = 'block';
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
                
                window.productPageState.new.productQuantityElement.insertAdjacentElement('afterend', quantityInfo); 
                await Promise.all([
                    updateProductElement(),
                    updateProductButtons()
                ]);
            }
        }      
    }

    // get products cards and pricing
    await populateProductPrices();
})();

function attachPaginationEventListeners() {
    const observer = new MutationObserver((mutationsList) => {
        mutationsList.forEach((mutation) => {
            mutation.addedNodes.forEach(async (node) => {
                if (node.nodeType === 1) {
                    const targetDiv = node.matches(".pagination__inner") ? node : node.querySelector?.(".pagination__inner");
                    if (targetDiv && !targetDiv.classList.contains("load-pagination")) {
                        await populateProductPrices();
                        targetDiv.classList.add("load-pagination");
                    }
                }
            });
        });
    });

    observer.observe(document.body, {
        childList: true,
        subtree: true
    });
}

async function populateHomePagePrices() {
    var handleArray = new Array();
    const cardElements = document.querySelectorAll('a.product-item__title');
    if(!cardElements) {
        return;
    }

    cardElements.forEach(el => {
        if(el.href.includes('/products/')) {
            var href = el.href.split('/products/')[1];
            if(!handleArray.includes(href)) {
                handleArray.push(href);
            }
        }
    });

    if(!handleArray.length > 0) {
        return;
    }

    const response = await getProductVolumePricingByHandleArr(handleArray);
    if(response != null && response.hasOwnProperty('count')) {
        if(response.count > 0) {
            for(var i in response.data) {
                const returnData = response.data[i].returnData;
                const productHandle = `/products/${response.data[i].productVariantHandle}`

                const { price, originalPrice } = returnData.priceConfig[0];
                var formattedPrice = Number(parseFloat(price).toFixed(2));
                var compareAtPrice = Number(parseFloat(originalPrice).toFixed(2));

                var anchorTags = document.querySelectorAll('a.product-item__title[href="'+productHandle+'"]');
                if(anchorTags) {
                    anchorTags.forEach(anchorTag => {
                        anchorTag = anchorTag.parentElement;

                        var firstAttempt = anchorTag.querySelector('span.price');
                        if(firstAttempt) {
                            firstAttempt.innerHTML = formatMoneyValueProperly(formattedPrice, 'money_with_currency_format');
                        } else {
                            anchorTag.querySelector('.price--highlight').innerHTML = `
                                <span class="visually-hidden">Sale price</span>
                                ${formatMoneyValueProperly(formattedPrice, 'money_with_currency_format')}
                            `;

                            anchorTag.querySelector('.price--compare').innerHTML = `
                                <span class="visually-hidden">Regular price</span>${formatMoneyValueProperly(compareAtPrice, 'money_with_currency_format')}</span>
                            `;
                        }
                    })
                }   
            }   
        }
    }
}

async function populateProductPrices() {
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

                    const priceSelector = el.cardElement.querySelector('.product-item__price-list');
                    if(priceSelector) {
                        var firstPriceConfig = variantResp.priceConfig[0];
                        var priceConfigLength = variantResp.priceConfig.length;
                        priceSelector.innerHTML = `
                            <span class="price price--highlight">
                                <span class="visually-hidden">Sale price</span>
                                ${priceConfigLength > 1 ? 'From':''} ${firstPriceConfig.currencySymbol}${firstPriceConfig.price}
                            </span>

                            <span class="price price--compare">
                                <span class="visually-hidden">Regular price</span>
                                ${firstPriceConfig.currencySymbol}${firstPriceConfig.originalPrice}
                            </span>
                        `;
                        
                        const imageSelector = el.cardElement.querySelector('div.product-item__label-list');
                        if(imageSelector) {
                            const onSaleBadge = imageSelector.querySelector('.product-label--on-sale');
                            if(onSaleBadge) {
                                onSaleBadge.innerHTML = `Save ${firstPriceConfig.percentage}%`;
                            } 
                        } else {
                            el.cardElement.insertAdjacentHTML('beforeend', `
                                <div class="product-item__label-list">
                                    <span class="product-label product-label--on-sale">
                                        Save 
                                        <span>${firstPriceConfig.percentage}%</span>
                                    </span>
                                </div> 
                            `);
                        }
                    }
                }
            })
        }
        
    }, 1000);
}

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

async function rebindWindowCartDrawerFunctions(e) {
    var target = e.target;
    target.disabled = true;
    setTimeout(async () => {
        await window.bindCartDrawerQuantityButtons();
    }, 1500);
    target.disabled = false;
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

if(!window.bindCartDrawerQuantityButtons) {
    window.bindCartDrawerQuantityButtons = async function () {
        const path = window.location.pathname;
        const isCartPage = path.includes('/cart');

        var cartItemSelectors = document.querySelectorAll(isCartPage ? '.line-item__product-info' : '.mini-cart__line-item');
        cartItemSelectors.forEach(async (node) => {
            const anchorTag = node.querySelector(isCartPage ? '.line-item__title' : '.mini-cart__product-title');
            var increaseButtonSelector, decreaseButtonSelector;
            if(!isCartPage) {
                increaseButtonSelector = node.querySelector('.quantity-selector__button[data-action="increase-quantity"]');
                decreaseButtonSelector = node.querySelector('.quantity-selector__button[data-action="decrease-quantity"]');
            } else {
                //First check if the selector parent's parent has a class named 'hidden-tablet-and-up'
                increaseButtonSelector = node.querySelector('.quantity-selector__button[data-action="increase-quantity"]');
                decreaseButtonSelector = node.querySelector('.quantity-selector__button[data-action="decrease-quantity"]');

                if(increaseButtonSelector.parentElement.parentElement.classList.contains('hidden-tablet-and-up')) {
                    //console.log('hidden element selected, reselecting now');
                    increaseButtonSelector = node.parentElement.querySelector('td.line-item__quantity .quantity-selector__button[data-action="increase-quantity"]');
                    decreaseButtonSelector = node.parentElement.querySelector('td.line-item__quantity .quantity-selector__button[data-action="decrease-quantity"]');
                } 
            }
            
            increaseButtonSelector.disabled = true;
            increaseButtonSelector.style.pointerEvents = 'none';
            increaseButtonSelector.style.cursor = 'not-allowed';
            decreaseButtonSelector.disabled = true;
            decreaseButtonSelector.style.pointerEvents = 'none';
            decreaseButtonSelector.style.cursor = 'not-allowed';

            const baseURI = anchorTag.href;
            const variantIdMatch = baseURI.match(/variant=(\d+)/);
            if (variantIdMatch) {
                const variantId = variantIdMatch[1];
                const data = await getProductVolumePricingByVariantId(variantId);
                if(data.volumeConfig) {
                    var currentQuantity = node.querySelector('.quantity-selector__value').value;
                    currentQuantity = parseInt(currentQuantity);
                    const volumeConfig = data.volumeConfig;
                    try {
                        if(volumeConfig != null && volumeConfig.hasOwnProperty('minimum') && volumeConfig.hasOwnProperty('increment') && volumeConfig.hasOwnProperty('maximum')) {
                            const inc = parseInt(volumeConfig.increment);
                            console.log('here');   
                            increaseButtonSelector.title = 'Increase quantity by '+inc;
                            decreaseButtonSelector.title = 'Decrease quantity by '+inc;

                            increaseButtonSelector.setAttribute('data-input-variant-id', variantId);
                            decreaseButtonSelector.setAttribute('data-input-variant-id', variantId);

                            increaseButtonSelector.setAttribute('title', 'Increase quantity by '+inc);
                            decreaseButtonSelector.setAttribute('title', 'Decrease quantity by '+inc);
                            increaseButtonSelector.setAttribute('data-quantity', currentQuantity + inc);

                            var minimumPossible = currentQuantity - inc > parseInt(volumeConfig.minimum) ? currentQuantity - inc : parseInt(volumeConfig.minimum);
                            decreaseButtonSelector.setAttribute('data-quantity', minimumPossible);

                            increaseButtonSelector.addEventListener('click', async function (e) {
                                e.preventDefault();
                                await rebindWindowCartDrawerFunctions(e);
                            });

                            decreaseButtonSelector.addEventListener('click', async function (e) {
                                e.preventDefault();
                                await rebindWindowCartDrawerFunctions(e);
                            });

                            increaseButtonSelector.disabled = false;
                            increaseButtonSelector.style.pointerEvents = 'auto';
                            increaseButtonSelector.style.cursor = 'pointer';
                            if(inc < currentQuantity) {
                                decreaseButtonSelector.style.pointerEvents = 'auto';
                                decreaseButtonSelector.disabled = false;
                                decreaseButtonSelector.style.cursor = 'pointer';
                            }
                        }
                    } catch(err) {
                        console.log('Error in line 201');
                        console.log(err.message);    
                    }
                } else {
                    console.log('volume config not found');
                }
            } else {
                console.log('variant id match not found');
            }
        });

        //Now attach the 
    };
}

async function getProductVolumePricingByHandleArr(handleArr) {
    const customerId = config.customerId;
    const shop = config.shopDomain;

    return await window.productPricingService.getVolumePricingBulkByHandleArray(
        config.appDomain, 
        shop, 
        config.apiKey, 
        config.timestamp, 
        config.hmac, 
        customerId, 
        handleArr
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
    var returnVal = Array.from(cards).map(card => {
        //var extractedProductId = extractProductId(card);
        var productHandle = extractProductHandle(card);
        if(productHandle) {
            let priceDisplay = null;
            for (let selector of productPriceSelectors) {
                priceDisplay = card.querySelector(selector);
                if (priceDisplay) {
                    break; // Found valid price container
                }
            }
            if (priceDisplay) {
                priceDisplay.parentElement.innerHTML = 'Loading...';
            }
            return {
                cardElement: card,
                productHandle: productHandle,
                productVolumePricing: null
            };
        }
    });

    returnVal = returnVal.filter(card => card != null && card.hasOwnProperty('productHandle') && card.productHandle !== null);
    return returnVal;
}

function extractProductHandle(card) {
    var anchorTag = card.querySelector('a.product-item__title');
    if(anchorTag) {
        const href = anchorTag.getAttribute('href').split('/');
        return href[href.length - 1];
    }

    return null;
}

async function getCustomerTag() {
    const shop = config.shopDomain;
    const api_key = config.apiKey;
    const appDomain = config.appDomain;
    const timestamp = config.timestamp;
    const hmac = config.hmac;
    const customerId = config.customerId;
    const tag = await window.customerService.getCustomerTag(appDomain, shop, api_key, timestamp, hmac, customerId);
    return tag;
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

        var formattedPrice = formatMoneyValueProperly(priceConfig.price, 'money_with_currency_format');
        var compareAtPriceFormatted = formatMoneyValueProperly(priceConfig.originalPrice, 'money_with_currency_format');
        updatePercentageDisplay(priceConfig);
        replacePriceDisplay(formattedPrice, compareAtPriceFormatted);
        window.productPageState.new.productPriceElement.innerHTML = getHTMLForDisplayingPrice(formattedPrice, compareAtPriceFormatted);
      }
      window.productPageState.original.productOriginalQuantityInput.value = currentValue;
      window.productPageState.new.productQuantityInput.value = currentValue;
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
        var formattedPrice = formatMoneyValueProperly(priceConfig.price, 'money_with_currency_format');
        var compareAtPriceFormatted = formatMoneyValueProperly(priceConfig.originalPrice, 'money_with_currency_format');
        updatePercentageDisplay(priceConfig);
        replacePriceDisplay(formattedPrice, compareAtPriceFormatted);
        window.productPageState.new.productPriceElement.innerHTML = getHTMLForDisplayingPrice(formattedPrice, compareAtPriceFormatted);
      }

      window.productPageState.original.productOriginalQuantityInput.value = currentValue;
      window.productPageState.new.productQuantityInput.value = currentValue;      
      return;
    }
}

function replacePriceDisplay(priceFormatted, compareAtPriceFormatted) {
    var htmlString = `
        ${priceFormatted}
        <small style="color:black;text-decoration:line-through;">
            ${compareAtPriceFormatted}
        </small>
    `;

    document.getElementById('product-price').innerHTML = htmlString;
    document.getElementById('product-price').style.removeProperty('display');
}

function getHTMLForDisplayingPrice(price, compareAtPrice) {
    return `
        <span style="font-size: 1em; color: #dc0000; font-weight: bold; margin-right: 5px;">${price}</span>
        <span style="font-size: 0.75em;text-decoration: line-through; color: #666;">${compareAtPrice}</span>      
    `;
}

function updatePercentageDisplay(config) {
    const saveSelector = document.querySelector('span.product-label--on-sale');
    if(config.percentage && saveSelector) {
        saveSelector.innerHTML = `Save <span>${config.percentage}%</span>`;
    }
}

function updateProductElement() {
    if (window.productPageState.productVolumePricing) {
        const priceInfo = window.productPageState.productVolumePricing.priceConfig[0];
        const volumeConfig = window.productPageState.productVolumePricing.volumeConfig;
        window.productPageState.new.productPriceElement.style.alignItems = 'center';

        var priceFormatted = formatMoneyValueProperly(priceInfo.price, 'money_with_currency_format');
        var compareAtPriceFormatted = formatMoneyValueProperly(priceInfo.originalPrice, 'money_with_currency_format');

        updatePercentageDisplay(priceInfo);
        replacePriceDisplay(priceFormatted, compareAtPriceFormatted);
        window.productPageState.new.productPriceElement.innerHTML = getHTMLForDisplayingPrice(priceFormatted, compareAtPriceFormatted);

        if (window.productPageState.original.productOriginalQuantityInput) {
            window.productPageState.original.productOriginalQuantityInput.value = volumeConfig.minimum === 0 ? 1 : volumeConfig.minimum;
        }      
        window.productPageState.new.productQuantityInput.value = volumeConfig.minimum === 0 ? 1 : volumeConfig.minimum;
        window.productPageState.new.productPriceElement.readOnly = true;
    }
    //window.productPageState.new.productPriceElement.style.display = 'flex';
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
