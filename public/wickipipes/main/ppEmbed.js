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

const productPriceSelector = 'span.coll_p';
const productCardSelector = 'div.custom-card-product';
const productCardHeadingSelector = 'a.card__title';
const dynamicPortalSphereClass = 'ps-show-price-done';

const storeType = config.storeType;
const customerId = config.customerId;
const isB2B = storeType === 'B2B' ? true : false;
const isHybrid = (storeType === 'Hybrid' || !storeType) ? true : false;
const isCustomerLoggedIn = (customerId !== null) ? true : false;
const windowPathName = window.location.pathname;

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
            
            window.productPageState.new.productQuantityElement.insertAdjacentElement('afterend', quantityInfo);
        }
        return;
    }
    if ((isB2B || isHybrid) && isCustomerLoggedIn && customerTag) {
        if (windowPathName.includes('/products/')){
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
                quantityInfo.style.width = '100%';
                quantityInfo.style.paddingTop = '10px';
                quantityInfo.style.paddingBottom = '10px';

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
    if(customerTag) {

        if(windowPathName.includes('/collections/')) {
            dynamicallyShowPrices(null);

            let debounceTimer = null;
            let pendingCardHolders = new Set();
            const observer = new MutationObserver((mutationsList) => {
                for (const mutation of mutationsList) {
                    if (mutation.type === "childList") {
                        mutation.addedNodes.forEach((node) => {
                            if (node.nodeType === 1) {
                            
                                if (node.matches?.("div.card--holder") && node.closest(".product__list")) {
                                    pendingCardHolders.add(node);
                                }

                                const found = node.querySelectorAll?.(".product__list .card--holder");
                                found?.forEach(el => pendingCardHolders.add(el));
                            }
                        });
                    }
                }

                clearTimeout(debounceTimer);
                debounceTimer = setTimeout(() => {
                    if (pendingCardHolders.size > 0) {
                        dynamicallyShowPrices(Array.from(pendingCardHolders));
                        pendingCardHolders.clear();
                    }
                }, 200);
            });
            
            observer.observe(document.body, { childList: true, subtree: true });
        } else {
            dynamicallyShowPrices(null);
        }

        if(windowPathName.includes('/cart')) {
            const cartParentSelector = document.querySelector('form.cart__form');
            if(cartParentSelector) {

                const minusButtons = cartParentSelector.querySelectorAll('button.quantity--input__incr');
                const plusButtons = cartParentSelector.querySelectorAll('button.quantity--input__decr');

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

                            const titleSelector = el.cardElement.querySelector('a.card__img--container');
                            const href = titleSelector.href; // full absolute URL
                            const url = new URL(href);
                            const variantId = url.searchParams.get('variant');

                            const inputVal = el.cardElement.querySelector('input.quantity--input__input');
                            const cardMinusButtons = el.cardElement.querySelectorAll('button.quantity--input__incr');
                            const cardPlusButtons = el.cardElement.querySelectorAll('button.quantity--input__decr');

                            if(inputVal && cardMinusButtons.length > 0 && cardMinusButtons.length > 0) {

                                cardMinusButtons.forEach(minusButton => {
                                    minusButton.addEventListener('click', async function (e) {
                                        e.preventDefault();
                                        e.stopImmediatePropagation();
                                        let newVal = parseInt(inputVal.value) - parseInt(el.productVolumePricing.volumeConfig.increment);
                                        if(newVal < el.productVolumePricing.volumeConfig.minimum) {
                                            newVal = el.productVolumePricing.volumeConfig.minimum;
                                        } 
                                        await window.cartService.updateProductToCart(variantId, newVal);
                                        location.reload();
                                    }, true);
                                });

                                cardPlusButtons.forEach(plusButton => {
                                    plusButton.addEventListener('click', async function (e) {
                                        e.preventDefault();
                                        e.stopImmediatePropagation();
                                        const val = parseInt(inputVal.value);
                                        let newVal = val + parseInt(el.productVolumePricing.volumeConfig.increment);
                                        if(newVal > el.productVolumePricing.volumeConfig.maximum) {
                                            newVal = el.productVolumePricing.volumeConfig.maximum;
                                        } 
                                        await window.cartService.updateProductToCart(variantId, newVal);
                                        location.reload();
                                    }, true);
                                });
                            }
                        }
                    });
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

function dynamicallyShowPrices(divs) {
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

                    const priceSelector = el.cardElement.querySelector(productPriceSelector);
                    if(priceSelector) {
                        var firstPriceConfig = variantResp.priceConfig[0];

                        const original = parseFloat(firstPriceConfig.originalPrice);
                        const current = parseFloat(firstPriceConfig.price);

                        let percentage = 0;
                        if (original > 0) {
                            percentage = ((original - current) / original) * 100;
                        }


                        priceSelector.innerHTML = `
                            <span class="card__price card__price--sale">
                                <span class="jsPrice">
                                    ${firstPriceConfig.currencySymbol}${firstPriceConfig.price}
                                </span>
                                <span class="card__price--old jsPrice">
                                    ${firstPriceConfig.currencySymbol}${firstPriceConfig.originalPrice}
                                </span>
                            </span>
                        `;

                        
                        const imageSelector = el.cardElement.querySelector('div.card__img');
                        if(imageSelector) {
                            const onSaleBadge = imageSelector.querySelector('div.card__tags');
                            if(onSaleBadge) {
                                const isSoldOutSelector = el.cardElement.querySelector('span.tag--soldout');
                                if(!isSoldOutSelector && percentage > 0) {
                                    onSaleBadge.innerHTML = `<span class="tag tag--sale">Save ${percentage.toFixed(0)}%</span>`;
                                }
                            } 
                        }

                        //Add to Cart button selector function
                        const cartButton = el.cardElement.querySelector('div.card__buttons button.button--addToCart');
                        if(cartButton) {
                            let variantId = el.cardElement.querySelector('form.shopify-product-form input[name="id"]').value;
                            cartButton.removeAttribute('onclick');
                            cartButton.addEventListener('click', function (e) {
                                e.preventDefault();
                                e.stopImmediatePropagation();
                                BoosterTheme.cart.addToCartJSON(e, {items: [{id: variantId, quantity: firstPriceConfig.quantity}]});
                            }, true);
                        }
                    }
                }
            })
        }
    }, 500);
}

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
            const anchorTag = cardElement.querySelector('a.card__img--container');
            if(anchorTag) {
                const href = anchorTag.href; // full absolute URL
                const url = new URL(href);
                const segments = url.pathname.split('/');
                return segments[segments.length - 1]; 
            }

            return null;
        }
        
        heading = cardElement.querySelector(productCardHeadingSelector);
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
    const cardInformationDivs = document.querySelectorAll(productCardSelector);
    if (cardInformationDivs.length > 0) {
        cards = [...cards, ...Array.from(cardInformationDivs)];
    }

    return Array.from(cards).map(card => {
        if(!card.classList.contains(dynamicPortalSphereClass)) {
            card.classList.add(dynamicPortalSphereClass);
            
            let priceDisplay = card.querySelector(productPriceSelector);
            if (priceDisplay) {
                priceDisplay.innerHTML = 'Loading...';
            }
            return {
                cardElement: card,
                productHandle: extractProductHandle(card),
                productVolumePricing: null
            };
        }
        
    }).filter(card => card && card.hasOwnProperty('productHandle') && card.productHandle !== null);
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
    document.querySelector('span[data-button-text]').textContent = `Add to cart - ${text}`;
}

function showProductPriceDisplayHTML(compareAtPrice, displayPrice) {
    return `
        <span class="product__price product__price--sale jsPrice">${displayPrice}</span>
        <span class="product__price--old jsPrice">${compareAtPrice}</span>
        <span class="tag tag--sale">SALE</span>
    `;
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
