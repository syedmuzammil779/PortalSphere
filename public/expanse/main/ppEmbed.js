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
    'div.grid-product__price'
];

const productCardSelectors = [
    'product-grid-item'
];

const productCardHeadingSelectors = [
    'a.grid-item__link'
];

const storeType = config.storeType;
const customerId = config.customerId;
const isB2B = storeType === 'B2B' ? true : false;
const isHybrid = (storeType === 'Hybrid' || !storeType) ? true : false;
const isCustomerLoggedIn = (customerId !== null) ? true : false;
const windowPathName = window.location.pathname;

(async function () {
    await initializeProductState();
    
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
                window.productPageState.new.productLoadingSpinner.style.display = 'block';
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
            if (!removeRecentlyViewed()) {
                const observer = new MutationObserver(() => {
                    if (removeRecentlyViewed()) {
                       observer.disconnect(); // Stop watching once removed
                    }
                });

                observer.observe(document.body, {
                    childList: true,
                    subtree: true
                });
            }

            const hoverButtons = document.querySelectorAll('div.grid-product__actions');
            if(hoverButtons.length > 0) {
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

                        const priceSelector = el.cardElement.querySelector('div.grid-product__price');
                        if(priceSelector) {
                            var firstPriceConfig = variantResp.priceConfig[0];

                            const original = parseFloat(firstPriceConfig.originalPrice);
                            const current = parseFloat(firstPriceConfig.price);

                            let percentage = 0;
                            if (original > 0) {
                                percentage = ((original - current) / original) * 100;
                                percentage = percentage.toFixed(0)
                            }


                            priceSelector.innerHTML = `
                                <div class="grid-product__price">
                                    <span class="grid-product__price--current">
                                        <span aria-hidden="true" class="grid-product__price--from">
                                            ${firstPriceConfig.currencySymbol}${firstPriceConfig.price}
                                        </span>
                                        <span class="visually-hidden">
                                            ${firstPriceConfig.currencySymbol}${firstPriceConfig.price}
                                        </span>
                                    </span>
                                    <span class="visually-hidden">Regular price</span>
                                    <span class="grid-product__price--original">
                                        <span aria-hidden="true">
                                            ${firstPriceConfig.currencySymbol}${firstPriceConfig.originalPrice}
                                        </span>
                                        <span class="visually-hidden">
                                            ${firstPriceConfig.currencySymbol}${firstPriceConfig.originalPrice}
                                        </span>
                                    </span>
                                    <span class="grid-product__price--savings">
                                        Save ${percentage}%
                                    </span>
                                </div>
                            `;

                            
                            const imageSelector = el.cardElement.querySelector('.grid-product__image-wrap');
                            if(imageSelector) {
                                const onSaleBadge = imageSelector.querySelector('.grid-product__tags');
                                if(onSaleBadge) {
                                    const isSoldOutSelector = imageSelector.querySelector('div.grid-product__tag--sold-out');
                                    if(!isSoldOutSelector) {
                                        onSaleBadge.innerHTML = `<div class="grid-product__tag grid-product__tag--sale">SALE</div>`;
                                    }
                                } 
                            }
                        }
                    }
                })
            }
        }, 100);

        if(windowPathName.includes('/cart')) {
            const cartParentSelector = document.querySelector('form#CartPageForm');
            if(cartParentSelector) {

                const minusButtons = cartParentSelector.querySelectorAll('.js-qty__adjust--minus');
                const plusButtons = cartParentSelector.querySelectorAll('.js-qty__adjust--plus');

                if(minusButtons.length > 0) {
                    minusButtons.forEach(el => {
                        el.disabled = true;
                        el.style.cursor = 'not-allowed';
                    });
                }

                if(plusButtons.length > 0) {
                    plusButtons.forEach(el => {
                        el.disabled = true;
                        el.style.cursor = 'not-allowed';
                    });
                }

                const cartItemCards = getCartItemsCards(cartParentSelector);
                const handleArr = cartItemCards.map(item => { return item.productHandle }).filter(handle => handle !== null && handle !== undefined);
                const response = await getProductVolumePricingByHandleArr(handleArr);
                const data = response.data;
                
                if(data != null && data.length > 0) {
                    cartItemCards.map(el => {
                        const matchingResp = data.find(d => {
                            return d.productVariantHandle == el.productHandle
                        });

                        if(matchingResp && matchingResp.returnData) {
                            var variantResp = matchingResp.returnData;
                            el.productVolumePricing = variantResp;

                            const titleSelector = el.cardElement.querySelector('a.cart__item-name');
                            const href = titleSelector.href; // full absolute URL
                            const url = new URL(href);
                            const variantId = url.searchParams.get('variant');

                            const inputVal = el.cardElement.querySelector('input[type="text"][name="updates[]"]');
                            if(inputVal) {
                                const plusButton = inputVal.parentElement.querySelector('button.js-qty__adjust--plus');
                                const minusButton = inputVal.parentElement.querySelector('button.js-qty__adjust--minus');
                                const currentVal = parseInt(inputVal.value);

                                
                                plusButton.addEventListener('click', async function (e) {
                                    e.preventDefault();
                                    e.stopImmediatePropagation();
                                    var newVal = currentVal + el.productVolumePricing.volumeConfig.increment;
                                    if(newVal >= el.productVolumePricing.volumeConfig.maximum) {
                                        return;
                                    }

                                    await window.cartService.updateProductToCart(variantId, newVal);
                                    location.reload();
                                }, true);
                                
                                minusButton.addEventListener('click', async function (e) {
                                    e.preventDefault();
                                    e.stopImmediatePropagation();
                                    var newVal = currentVal - el.productVolumePricing.volumeConfig.increment;
                                    if(newVal <= el.productVolumePricing.volumeConfig.minimum) {
                                        newVal = el.productVolumePricing.volumeConfig.minimum;
                                        return;
                                    }

                                    await window.cartService.updateProductToCart(variantId, newVal);
                                    location.reload();
                                }, true);
                            }
                        }
                    })
                }

                if(minusButtons.length > 0) {
                    minusButtons.forEach(el => {
                        el.disabled = false;
                        el.style.cursor = 'pointer';
                    });
                }

                if(plusButtons.length > 0) {
                    plusButtons.forEach(el => {
                        el.disabled = false;
                        el.style.cursor = 'pointer';
                    });
                }
            }
        }
    }
})();

function getCartItemsCards(selector) {
    let cards = [];
    const cardInformationDivs = selector.querySelectorAll('div.cart__item');
    if (cardInformationDivs.length > 0) {
        cards = [...cards, ...Array.from(cardInformationDivs)];
    }
    return Array.from(cards).map(card => {
        return {
            cardElement: card,
            productHandle: extractProductHandle(card),
            productVolumePricing: null
        };
    });
}

function removeRecentlyViewed() {
  const el = document.querySelector('recently-viewed');
  if (el) {
    el.remove();
    return true;
  }
  return false;
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

        if(windowPathName.includes('/cart')) {
            const anchorTag = cardElement.querySelector('div.cart__item-title a.cart__item-name');
            if(anchorTag) {
                const href = anchorTag.href; // full absolute URL
                const url = new URL(href);
                const segments = url.pathname.split('/');
                return segments[2]; 
            }

            return null;
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
    document.querySelector('span[data-add-to-cart-text]').innerHTML = `Add to cart - ${text}`;
}

function showProductPriceDisplayHTML(compareAtPrice, displayPrice) {
    return `
        <label class="variant__label" for="ProductPrice-template--18179737256026__main">
            Price
        </label>
        <span data-a11y-price="" class="visually-hidden" aria-hidden="false">
            Regular price
        </span>
        <span data-product-price-wrap="" class="">
            <span data-compare-price="" class="product__price product__price--compare">
                <span aria-hidden="true">${compareAtPrice}</span>
                <span class="visually-hidden">${compareAtPrice}</span>
            </span>
        </span>
        <span data-compare-price-a11y="" class="visually-hidden">Sale price</span>
        <span data-product-price="" class="product__price on-sale">
            <span aria-hidden="true">${displayPrice}</span>
            <span class="visually-hidden">${displayPrice}</span>
        </span>
        <span data-save-price="" class="product__price-savings">
            Sale
        </span>
        <div data-unit-price-wrapper="" class="product__unit-price hide">
            <span data-unit-price="">
                <span aria-hidden="true"></span>
                <span class="visually-hidden"></span>
            </span>/
            <span data-unit-base=""></span>
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
    window.productPageState.new.productPriceElement.style.display = 'block';
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
