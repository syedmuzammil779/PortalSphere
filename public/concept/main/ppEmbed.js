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

const impulseCardGrid = 'div.grid__item.grid-product.small--one-half.medium-up--one-quarter.aos-init.aos-animate';
const productPriceSelectors = [
    'div.price'
];

const productCardSelectors = [
    '.product-card__content'
];

const productCardHeadingSelectors = [
    '.product-card__title'
];

const storeType = config.storeType;
const customerId = config.customerId;
const isB2B = storeType === 'B2B' ? true : false;
const isHybrid = (storeType === 'Hybrid' || !storeType) ? true : false;
const isCustomerLoggedIn = (customerId !== null) ? true : false;

(async function () {
    await initializeProductState();
    const windowPathName = window.location.pathname;

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
                const quantityInfo = document.createElement('div');
                quantityInfo.id = 'volume-pricing-quantity-info';
                quantityInfo.style.marginTop = '5px';
                quantityInfo.style.width = '100%'

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
                console.log("updating product element");
                await Promise.all([
                    updateProductElement(),
                    updateProductButtons()
                ]);
            }
        }      
    }

    // get products cards and pricing
    if(customerTag) {
        setTimeout(async () => {

            const pageContainer = document.getElementById('PageContainer');
            if(pageContainer) {
                const recentlyViewed = pageContainer.querySelector('recently-viewed');
                if(recentlyViewed) {
                    recentlyViewed.style.display = 'none';
                }
            }

            const hoverButtons = document.querySelectorAll('button[is="hover-button"]');
            if(hoverButtons.length > 0 && windowPathName.includes('collections')) {
                hoverButtons.forEach(el => {
                    el.remove();
                });
            }

            if(windowPathName.includes('products')) {
                const stickAddToCart = document.querySelector('.product-sticky-form__card');
                if(stickAddToCart) {
                    stickAddToCart.style.display = 'none';
                }
            }

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

                        const priceSelector = el.cardElement.querySelector('.price');
                        if(priceSelector) {
                            var firstPriceConfig = variantResp.priceConfig[0];
                            priceSelector.innerHTML = `
                                <span class="sr-only">Sale price</span>
                                <span class="price__regular whitespace-nowrap">${firstPriceConfig.currencySymbol}${firstPriceConfig.originalPrice}</span>
                                <span class="sr-only">Regular price</span>
                                <span class="price__sale inline-flex items-center h-auto relative">${firstPriceConfig.currencySymbol}${firstPriceConfig.price}</span></div>
                            `;

                            const quickViewSelector = el.cardElement.parentElement.querySelector('quick-view');
                            if(quickViewSelector) {
                                quickViewSelector.remove();
                            }

                            
                            const imageSelector = el.cardElement.parentElement.querySelector('.product-card__media');
                            if(imageSelector) {
                                const onSaleBadge = imageSelector.querySelector('.badge--onsale');
                                if(onSaleBadge) {
                                    onSaleBadge.innerHTML = `Save ${firstPriceConfig.percentage}%`;
                                } else {
                                    var discountParentSelector = el.cardElement.parentElement.querySelector('.badges');
                                    var discountBadge = `<span class="badge badge--onsale flex items-center gap-1d5 font-medium leading-none rounded-full">Save ${firstPriceConfig.percentage}%</span>`;
                                    if(discountParentSelector) {
                                        discountParentSelector.innerHTML = discountBadge;
                                    }
                                }
                            }
                        }
                    }
                })
            }
            
        }, 1000);
    }
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

function extractProductHandle(cardElement) {
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
        
        for (let selector of productCardHeadingSelectors) {
            heading = cardElement.querySelector(selector);
            if (heading) break;
        }
        
        if (heading) {
            const hrefParts = heading.getAttribute('href').split("/");
            return hrefParts[hrefParts.length - 1];
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
        window.productPageState.new.productPriceElement.innerHTML = showProductPriceDisplayHTML(`${priceConfig.currencySymbol}${priceConfig.originalPrice}`, `${priceConfig.currencySymbol}${priceConfig.price}`)
      }

      changeAddToCartPriceDisplay(`${priceConfig.currencySymbol}${priceConfig.price}`);

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
        window.productPageState.new.productPriceElement.innerHTML = showProductPriceDisplayHTML(`${priceConfig.currencySymbol}${priceConfig.originalPrice}`, `${priceConfig.currencySymbol}${priceConfig.price}`);
      }

      changeAddToCartPriceDisplay(`${priceConfig.currencySymbol}${priceConfig.price}`);

      window.productPageState.original.productOriginalQuantityInput.value = currentValue;
      window.productPageState.new.productQuantityInput.value = currentValue;      
      return;
    }
}

function changeAddToCartPriceDisplay(text) {
    document.querySelector('product-buy-price.price').innerHTML = text;
}

function showProductPriceDisplayHTML(compareAtPrice, displayPrice) {
    return `
        <div class="price price--on-sale flex flex-wrap items-baseline gap-2 lg:flex-col xl:items-end lg:gap-1d5">
            <span class="sr-only">Sale price</span>
            <span class="price__regular whitespace-nowrap">${displayPrice}</span>
            <span class="sr-only">Regular price</span>
            <span class="price__sale inline-flex items-center h-auto relative">${compareAtPrice}</span>
        </div>
    `;
    
    // return `
    //     <span style="font-size: 1.2em; font-weight: bold; margin-right: 5px;">${displayPrice}</span>
    //     <span style="font-size: 0.8em; color: #666;">MSRP ${compareAtPrice}</span>      
    // `;
}

function updateProductElement() {
    if (window.productPageState.productVolumePricing) {
      const priceInfo = window.productPageState.productVolumePricing.priceConfig[0];
      const volumeConfig = window.productPageState.productVolumePricing.volumeConfig;

      window.productPageState.new.productPriceElement.style.alignItems = 'center';
      window.productPageState.new.productPriceElement.innerHTML = showProductPriceDisplayHTML(`${priceInfo.currencySymbol}${priceInfo.originalPrice}`, `${priceInfo.currencySymbol}${priceInfo.price}`);      
      if (window.productPageState.original.productOriginalQuantityInput) {
        window.productPageState.original.productOriginalQuantityInput.value = volumeConfig.minimum === 0 ? 1 : volumeConfig.minimum;
      } 
      
      changeAddToCartPriceDisplay(`${priceInfo.currencySymbol}${priceInfo.price}`);
      
      window.productPageState.new.productQuantityInput.value = volumeConfig.minimum === 0 ? 1 : volumeConfig.minimum;
      window.productPageState.new.productPriceElement.readOnly = true;
      const min = volumeConfig.minimum;
      const inc = volumeConfig.increment;
      const max = volumeConfig.maximum === Number.MAX_SAFE_INTEGER ? '∞' : volumeConfig.maximum;
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
