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
    //Dawn Theme
    'div.price__container',
    '.portalspere__product__price',
    'div.card-information',
    'div.price-wrapper',
    'div.price-rating',
    '.product-item .price',
    'div.product-price',
    // Warehouse Theme,  
    // 'div.product-form__info-content',
    "div.product-item__price-list",
    'div.line-item__price-list',//cart price,
    'div.product-thumbnail__info-container',
    'div.modal_price',
    'product-thumbnail__info-container',  //parallax theme
    'product-block.product-block',
    '.grid-product__price',//impulse theme
    '.price__container',
    '.product-price',
    // '.price.price--on-sale', //be yours
    '.product-price--sale',
    '.product-price--regular'
];

const productCardSelectors = [
    '.portalspere__product__card',
    'div.card__information',  // Dawn Theme
    'div.product-card',       // Debut Theme
    'div.product-item',       // Other common themes
    // Warehouse Theme,
    'product-block.product-block',
    'div.grid__item.grid-product.aos-init.aos-animate',
    'div.card__section',
    'div.one-third.column.medium-down--one-half.thumbnail', // parallax theme
    'div.thumbnail',// parallax theme
    impulseCardGrid,
    '.featured-product',
    'div.grid-product__content', //Implulse theme
    'div.product-item__info', 
    'tr.line-item.line-item--stack', //cart Card
    'div.product-item product-item--vertical',
    //'.card-wrapper', //flux theme - removed this for now to check the generic
    'div.one-third',  //parallax theme
    '.js-product product-info quickbuy-content spaced-row container',
    '.grid__item',
    '.js-pagination-result'
    // '.product-block',
    // '.product-block.grid__item.one-quarter.small-down--one-half'
];

const productCardHeadingSelectors = [
    '.portalspere__product__card__heading',
    'h3.card__heading',          // Dawn Theme
    '.product-title',            // Debut Theme
    '.product-item__title',       // Warehouse Theme
    'h2.product-grid-item__title',// Some other themes
    "div.container .column",
    "div.grid-product",
    'div.product-thumbnail__title-container' //parallax theme
];

const storeType = config.storeType;
const customerId = config.customerId;
const isB2B = storeType === 'B2B' ? true : false;
const isHybrid = (storeType === 'Hybrid' || !storeType) ? true : false;
const isCustomerLoggedIn = (customerId !== null) ? true : false;

(async function () {
    await initializeProductState();

    const pathname = window.top.location.pathname;
    if(pathname.includes('collections')) {
        setOptionsOnTheDom();
    }

    if(pathname.includes('products')) {
        setOptionsOnTheProductPageDom();
    }

    if(pathname.includes('cart')) {
        if(isCustomerLoggedIn) {
            setOptionsOnTheCartPageDom();
        }
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
    resetTheCurrentPage();

})();

function resetTheCurrentPage() {
    setTimeout(async () => {
        const productsCards = getProductsCards();
        const pricingPromises = productsCards.map(async productCard => {
            const productId = extractProductId(productCard.cardElement);
            if(productId.length===13) {
                try {
                    const pricing = await getProductVolumePricingByProductId(productId);
                    return ({ productCard, pricing });
                } catch (error) {
                    console.error(`Error fetching pricing for product ${productId}:`, error);
                    return { productCard, pricing: null };
                }
            } else {
                try {
                    const pricing_1 = await getProductVolumePricingByVariantId(productId);
                    return ({ productCard, pricing });
                } catch (error_1) {
                    console.error(`Error fetching pricing for product ${productId}:`, error_1);
                    return { productCard, pricing: null };
                }
            }
        });

        Promise.all(pricingPromises)
        .then(results => {
            results.forEach(({ productCard, pricing }) => {
                if (pricing && pricing.priceConfig.length > 0) {
                    const priceDisplay = productPriceSelectors
                    .map(selector => productCard.cardElement.querySelector(selector))
                    .find(el => el);

                    if (priceDisplay) {
                        const { currencySymbol, price, originalPrice } = pricing.priceConfig[0];
                        priceDisplay.innerHTML = `
                            <span style="font-size: 1.2em; font-weight: bold;">${currencySymbol}${price}</span>
                            <span style="font-size: 0.8em; color: #666;">MSRP ${currencySymbol}${originalPrice}</span>
                        `;
                        
                        const quantitySelector = priceDisplay.parentElement.parentElement.parentElement.parentElement.querySelector('input.quantity__input');
                        if(quantitySelector) {
                            quantitySelector.setAttribute('data-step', pricing.volumeConfig.increment.toString());
                            quantitySelector.setAttribute('step', pricing.volumeConfig.increment.toString());
                            quantitySelector.setAttribute('data-min', pricing.volumeConfig.minimum.toString());
                            quantitySelector.setAttribute('min', pricing.volumeConfig.minimum);

                            const hiddenElements = `
                                <input type="hidden" class="minimum" value="${pricing.volumeConfig.minimum}">
                                <input type="hidden" class="increment" value="${pricing.volumeConfig.increment}">
                            `;
                            const parentQuantitySelector = quantitySelector.parentElement;
                            if(priceDisplay.parentElement.parentElement.parentElement.parentElement.querySelector('.card__information'))
                                priceDisplay.parentElement.parentElement.parentElement.parentElement.querySelector('.card__information').insertAdjacentHTML('afterend', hiddenElements);
                            const minusButton = parentQuantitySelector.querySelector('button[name="minus"]');
                            const plusButton = parentQuantitySelector.querySelector('button[name="plus"]');
                            if(minusButton && plusButton) {
                                minusButton.removeAttribute('disabled');
                                minusButton.addEventListener('click', resetTheCurrentPage);
                                plusButton.removeAttribute('disabled');
                                plusButton.addEventListener('click', resetTheCurrentPage);
                            }
                        } 
                    } 
                } 
            });
        })
        .catch(error => {
            console.error('Error updating product prices:', error);
        });
    }, 10);
}

function setOptionsOnTheCartPageDom() {
    const cartItemsTable = document.querySelector('cart-items');
    const trItems = cartItemsTable.querySelectorAll('quantity-input.cart-quantity');
    trItems.forEach(async (row) => {
        const quantitySelector = row.querySelector('.quantity__input');
        quantitySelector.setAttribute('readonly', "true");
        const variantId = quantitySelector.getAttribute('data-quantity-variant-id');
        const minusButtonSelector = row.querySelector('button[name="minus"]');
        const plusButtonSelector = row.querySelector('button[name="plus"]');
        
        if(minusButtonSelector && plusButtonSelector) {
            minusButtonSelector.setAttribute('disabled', 'disabled');
            plusButtonSelector.setAttribute('disabled', 'disabled');

            minusButtonSelector.addEventListener('click', function () {
               setTimeout(() => { location.reload() }, 1000); 
            })

            plusButtonSelector.addEventListener('click', function () {
               setTimeout(() => { location.reload() }, 1000); 
            })
            
            const variantPriceConfig = await getProductVolumePricingByVariantId(variantId);
            try {
                if(variantPriceConfig) {
                    let firstPriceConfig = variantPriceConfig.priceConfig.find((item) => { 
                        return quantitySelector.value >= item.quantity && quantitySelector.value <= item.maxQuantity 
                    });
                    
                    if(!firstPriceConfig) {
                        firstPriceConfig = variantPriceConfig.priceConfig.reduce((minItem, current) => 
                            current.quantity < minItem.quantity ? current : minItem
                        );
                    }

                    const volumePriceConfig = variantPriceConfig.volumeConfig;
                    quantitySelector.setAttribute('step', volumePriceConfig.increment.toString());
                    quantitySelector.setAttribute('min', volumePriceConfig.minimum.toString());
                }    
            } catch (error) {
                console.log('here error caught ');
                console.log(error.message);
            }
            
            minusButtonSelector.removeAttribute('disabled');
            plusButtonSelector.removeAttribute('disabled');
        }
    });
}

async function attachTrEventListeners(trSelector) {
    const productSelector = trSelector.querySelector('a.cart-item__name');
    if(productSelector) {
        const variantId = productSelector.getAttribute('href').split('?variant=')[1];
        const volResponse = await getProductVolumePricingByVariantId(variantId);

    }
}

function setOptionsOnTheProductPageDom() {
    const optionButton = document.querySelector('quick-order-list');
    if(optionButton) {
        var dataModal = optionButton.getAttribute('id');
        setTimeout(async () => {
            await setVariantOptions(dataModal);
        }, 100);
    }
}

function setOptionsOnTheDom() {
    const optionsButtons = document.querySelectorAll('modal-opener');
    if(optionsButtons && optionsButtons.length > 0) {
        optionsButtons.forEach(el => {
            var dataModal = el.getAttribute('data-modal');
            el.addEventListener('click', function (e) {
                e.preventDefault();
                setTimeout(async () => {
                    await setVariantOptions(dataModal);
                }, 100);
            });
        });
    }
}

async function setVariantOptions(dataModal) {
    const modalDialog = document.getElementById(dataModal.replace('#', '').trim());
    if(modalDialog) {
        const tableSelector = modalDialog.querySelector('table.quick-order-list__table tbody');
        await setVariantOptionsInTable(dataModal, tableSelector);
        const removeAllButton = modalDialog.querySelector('.quick-order-list__button-confirm');
        if(removeAllButton) {
            removeAllButton.addEventListener('click', (e) => {
                setTimeout(async () => {
                    await setVariantOptions(dataModal);
                }, 1000);
            }) 
        }

        const paginationButtons = modalDialog.querySelectorAll('.pagination__item');
        if(paginationButtons && paginationButtons.length > 0) {
            paginationButtons.forEach(el => {
                el.addEventListener('click', () => {
                    setTimeout(async () => {
                        await setVariantOptions(dataModal);
                    }, 1000);               
                });
            })
        }
    }
}

function getPriceDisplayElementForVariantTable(msrpPrice = '', showPrice = '') {
    return `
        <dl class="variant-item__discounted-prices">
            <dt class="visually-hidden">
                Regular price
            </dt>
            <dd>
                <s class="variant-item__old-price price price--end">${msrpPrice}</s>
            </dd>
            <dt class="visually-hidden">
                Sale price
            </dt>
            <dd class="price">
                <span class="price">${showPrice}</span>
            </dd>
        </dl>
    `
}

async function setVariantOptionsInTable(dataModal, tableSelector) {
    if(tableSelector) {
        const trItems = tableSelector.querySelectorAll('tr.variant-item');
        if(trItems) {
            var subtotalPrice = 0;
            var currencySymbol = null;
            trItems.forEach(async (row) => {
                const variantId = row.getAttribute('data-variant-id');
                const minusButtonSelector = row.querySelector('button[name="minus"]');
                const plusButtonSelector = row.querySelector('button[name="plus"]');
                const removeItemSelector = row.querySelector('.quick-order-list-remove-button button');

                if(minusButtonSelector && plusButtonSelector) {
                    const quantitySelector = row.querySelector('.quantity__input');
                    const variantPriceSelector = row.querySelector('td.variant-item__price');
                    const variantTotalSelector = row.querySelectorAll('td.variant-item__totals');
                    
                    variantPriceSelector.innerHTML = getPriceDisplayElementForVariantTable('', 'Loading...');
                    
                    minusButtonSelector.setAttribute('disabled', 'disabled');
                    minusButtonSelector.style.pointerEvents = 'not-allowed';
                    minusButtonSelector.style.cursor = 'not-allowed';
                    
                    plusButtonSelector.setAttribute('disabled', 'disabled');
                    plusButtonSelector.style.pointerEvents = 'not-allowed';
                    plusButtonSelector.style.cursor = 'not-allowed';
                    
                    const variantPriceConfig = await getProductVolumePricingByVariantId(variantId);
                    try {
                        if(variantPriceConfig) {
                            let firstPriceConfig = variantPriceConfig.priceConfig.find((item) => { return quantitySelector.value >= item.quantity && quantitySelector.value <= item.maxQuantity });
                            if(!firstPriceConfig) {
                                firstPriceConfig = variantPriceConfig.priceConfig.reduce((minItem, current) => 
                                    current.quantity < minItem.quantity ? current : minItem
                                );
                            }

                            const volumePriceConfig = variantPriceConfig.volumeConfig;
                            variantPriceSelector.innerHTML = getPriceDisplayElementForVariantTable(
                                `${firstPriceConfig.currencySymbol}${firstPriceConfig.originalPrice}`, 
                                `${firstPriceConfig.currencySymbol}${firstPriceConfig.price}`
                            );

                            if(!currencySymbol) {
                                currencySymbol = firstPriceConfig.currencySymbol;
                            }

                            if(quantitySelector.value > 0) {
                                var itemSubtotalPrice = parseFloat(firstPriceConfig.price) * parseInt(quantitySelector.value);
                                subtotalPrice += itemSubtotalPrice;
                                variantTotalSelector.forEach(el => {
                                    el.innerHTML = `
                                        <span class="price">${firstPriceConfig.currencySymbol}${parseFloat(itemSubtotalPrice).toFixed(2)}</span>
                                    `;
                                })
                            }

                            quantitySelector.setAttribute('step', volumePriceConfig.increment.toString());
                            quantitySelector.setAttribute('min', volumePriceConfig.minimum.toString());

                        }    
                    } catch (error) {
                        console.log('here error caught ');
                        console.log(error.message);
                    }
                    
                    minusButtonSelector.removeAttribute('disabled');
                    minusButtonSelector.style.pointerEvents = 'pointer';
                    minusButtonSelector.style.cursor = 'pointer';
                    plusButtonSelector.removeAttribute('disabled');
                    plusButtonSelector.style.pointerEvents = 'pointer';
                    plusButtonSelector.style.cursor = 'pointer';

                    quantitySelector.addEventListener('blur', function () {
                        setTimeout(async () => {
                            await setVariantOptions(dataModal);
                        }, 2000);
                    });

                    if(removeItemSelector) {
                        removeItemSelector.addEventListener('click', function () {
                            setTimeout(async () => {
                                await setVariantOptions(dataModal);
                            }, 2000);
                        })
                    }

                    minusButtonSelector.addEventListener('click', function() {
                        setTimeout(async () => {
                            await setVariantOptions(dataModal);
                        }, 2000); 
                    });

                    plusButtonSelector.addEventListener('click', function() {
                        setTimeout(async () => {
                            await setVariantOptions(dataModal);
                        }, 2000);
                    });
                    
                    if(subtotalPrice > 0) {
                        const subtotalSelector = tableSelector.parentElement.parentElement.parentElement.parentElement.querySelectorAll('span.totals__subtotal-value');
                        if(subtotalSelector && subtotalSelector.length > 0) {
                            subtotalSelector.forEach(el => {
                                el.innerHTML = `${currencySymbol}${parseFloat(subtotalPrice).toFixed(2)}`;
                            });
                        }
                    }
                }
            });
        }
    }
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
            const quantitySelectorEl = priceDisplay.parentElement.parentElement.parentElement.parentElement.querySelector('quantity-input');
            if(quantitySelectorEl) {
                const minusButton = quantitySelectorEl.querySelector('button[name="minus"]');
                const plusButton = quantitySelectorEl.querySelector('button[name="plus"]');
                if(minusButton && plusButton) {
                    minusButton.setAttribute('disabled', 'disabled');
                    plusButton.setAttribute('disabled', 'disabled');
                }
            }
        }
        return {
            cardElement: card,
            productId: extractProductId(card),
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
        window.productPageState.new.productPriceElement.innerHTML = `
          <span style="font-size: 1.2em; font-weight: bold; margin-right: 5px;">${priceConfig.currencySymbol}${priceConfig.price}</span>
          <span style="font-size: 0.8em; color: #666;">MSRP ${priceConfig.currencySymbol}${priceConfig.originalPrice}</span>
        `;
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
        window.productPageState.new.productPriceElement.innerHTML = `
          <span style="font-size: 1.2em; font-weight: bold; margin-right: 5px;">${priceConfig.currencySymbol}${priceConfig.price}</span>
          <span style="font-size: 0.8em; color: #666;">MSRP ${priceConfig.currencySymbol}${priceConfig.originalPrice}</span>               
        `;
      }

      window.productPageState.original.productOriginalQuantityInput.value = currentValue;
      window.productPageState.new.productQuantityInput.value = currentValue;      
      return;
    }
}

function updateProductElement() {
    if (window.productPageState.productVolumePricing) {
      const priceInfo = window.productPageState.productVolumePricing.priceConfig[0];
      const volumeConfig = window.productPageState.productVolumePricing.volumeConfig;

      window.productPageState.new.productPriceElement.style.alignItems = 'center';
      window.productPageState.new.productPriceElement.innerHTML = `
        <span style="font-size: 1.2em; font-weight: bold; margin-right: 5px;">${priceInfo.currencySymbol}${priceInfo.price}</span>
        <span style="font-size: 0.8em; color: #666;">MSRP ${priceInfo.currencySymbol}${priceInfo.originalPrice}</span>      
      `;      
      if (window.productPageState.original.productOriginalQuantityInput) {
        window.productPageState.original.productOriginalQuantityInput.value = volumeConfig.minimum === 0 ? 1 : volumeConfig.minimum;
      }      
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
