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
var windowPathName = window.location.pathname;  

const impulseCardGrid = 'div.grid__item.grid-product.small--one-half.medium-up--one-quarter.aos-init.aos-animate';
const productPriceSelectors = [
    '.product-grid--price'
];

const productCardSelectors = [
    '.grid-view-item--desc-wrapper'
];

const productCardHeadingSelectors = [
    '.product-grid--title a'
];

const storeType = config.storeType;
const customerId = config.customerId;
const isB2B = storeType === 'B2B' ? true : false;
const isHybrid = (storeType === 'Hybrid' || !storeType) ? true : false;
const isCustomerLoggedIn = (customerId !== null) ? true : false;

(async function () {
    await initializeProductState();

    const url = new URL(window.location.href);
    const params = new URLSearchParams(url.search);

    if (params.has("openCart")) {
        setTimeout(() => {
            const targetDiv = document.querySelector(".js-drawer-open-right-link"); 
            if (targetDiv) targetDiv.click();

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
                console.log("productPriceElement");
                window.productPageState.new.productPriceElement.style.display = 'none';
                window.productPageState.new.productLoadingSpinner.style.display = 'flex';
                window.productPageService.hideProductPageElements();
                const data = await getProductVolumePricingByVariantId(window.productPageState.productVariantId);
                
                const titleSelector = document.querySelector('h1.product-details-product-title');
                if(titleSelector) {
                    populateTableForProductPage(data, titleSelector);
                }

                const compareAtPriceSelector = document.querySelector('#ComparePrice');
                if(compareAtPriceSelector) {
                    compareAtPriceSelector.innerHTML = '';
                }

                const discountShowEl = document.querySelector('li.product-page--pricing--discount');
                if(discountShowEl) {
                    discountShowEl.innerHTML = '';
                }

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

            const allShopNowButtons = document.querySelectorAll('.shop-now-button');
            if(allShopNowButtons) {
                allShopNowButtons.forEach(el => {
                    el.style.display = "none";
                });
            }

            const productsCards = getProductsCards();
            const handleArr = productsCards.map(item => { return item.productHandle });
            const response = await getProductVolumePricingByHandleArr(handleArr);
            const data = response.data;

            if(data != null && data.length > 0) {
                productsCards.map(el => {
                    const matchingResp = data.find(d => {
                        return d.productVariantHandle == el.productHandle
                    });

                    var variantResp = matchingResp.returnData;
                    el.productVolumePricing = variantResp;

                    const priceSelector = el.cardElement.querySelector('.product-grid--price');
                    if(priceSelector) {
                        var firstPriceConfig = variantResp.priceConfig[0];
                        priceSelector.innerHTML = `
                            <a href="/collections/all/products/${el.productHandle}" data-product-id="${el.productId}">
                            </a><a href="/collections/all/products/${el.productHandle}" data-product-id="${el.productId}">
                                <span class="visually-hidden">Regular price</span>
                                <s><span class="money">${firstPriceConfig.currencySymbol}${firstPriceConfig.originalPrice}</span></s>
                                <span class="money sale-price">${firstPriceConfig.currencySymbol}${firstPriceConfig.price}</span>
                            </a>
                        `;

                        const anchors = el.cardElement.querySelectorAll('.grid-view-item--desc-wrapper a');

                        // Find the one that contains "Variation Price Range"
                        const variationSelector = Array.from(anchors).find(a =>
                            a.textContent.includes("Variation Price Range")
                        );

                        if(variationSelector) {
                            variationSelector.innerHTML = null;
                        }

                        const imageSelector = el.cardElement.parentElement.parentElement.querySelector('.grid-view-item');
                        if(imageSelector) {
                            const soldOutSelector = imageSelector.querySelector('div.sold-out-badge');
                            if(!soldOutSelector) {
                                const onSaleBadge = imageSelector.querySelector('div.sale-badge');
                                if(onSaleBadge) {
                                    onSaleBadge.innerHTML = `Save ${firstPriceConfig.percentage}%`;
                                } else {
                                    imageSelector.insertAdjacentHTML('beforeend', `
                                        <div class="sale-badge badge" style="top: 0px; left: 0px;">Save ${firstPriceConfig.percentage}%</div> 
                                    `);
                                }
                            }

                            // const quickViewButton = imageSelector.querySelector('.shop-now-button');
                            // if(quickViewButton) {
                            //     quickViewButton.addEventListener('click', function (e) {
                            //         const quickViewSelector = document.querySelector('.right-drawer-vue');
                            //         setTimeout(async () => {
                            //             await populateAndAttachEventListeners(quickViewSelector);
                            //         }, 2000);
                            //     });

                            //     //quickViewButton.style.display = "block";
                            // }
                        }
                    }
                })
            }
        }, 100);
    }
})();

async function populateAndAttachEventListeners(quickViewSelector) {
    const selectEl = quickViewSelector.querySelector('#productSelect-template--product');
    const optionValues = Array.from(selectEl.options)
        .filter(opt => opt.hasAttribute("value") && opt.value.trim() !== "")
        .map(opt => opt.value);
    
    const selectedValue = selectEl.value;
    var tableHTML = '';
    var qtyElementHTML = '';
    var addToCartButtonsHTML = '';
    const variantResponses = {};

    for await (const variantId of optionValues) {
        var response = await getProductVolumePricingByVariantId(variantId);
        if(response.volumeConfig && response.priceConfig) {
            let trElements = new Array();
            variantResponses[variantId] = response;

            for(var config in response.priceConfig) {
                trElements.push(`
                    <tr>
                        <td style="border: 1px solid #ddd; padding: 8px; background-color: #f2f2f2"> <center>${response.priceConfig[config].quantity}+ </center></td>
                        <td style="border: 1px solid #ddd; padding: 8px; background-color: #f2f2f2"> <center>${response.priceConfig[config].currencySymbol}${response.priceConfig[config].price} </center></td>
                        <td style="border: 1px solid #ddd; padding: 8px; background-color: #f2f2f2"> <center>${response.priceConfig[config].percentage}% </center></td>
                    </tr>    
                `);
            }

            tableHTML += `
                <table id='table-${variantId}' class="variantConfigTable" style="display: ${variantId == selectedValue ? 'table':'none'}; width: 100%; border-collapse: collapse; margin-top: 10px; border-radius: 8px; overflow: hidden; border: 1px solid #ddd;">
                    <thead>
                        <tr>
                            <th style="border: 1px solid #ddd; padding: 8px; background-color: #f2f2f2; border-top-left-radius: 8px;"><center>Quantity</center></th>
                            <th style="border: 1px solid #ddd; padding: 8px; background-color: #f2f2f2;"><center>Price</center></th>
                            <th style="border: 1px solid #ddd; padding: 8px; background-color: #f2f2f2; border-top-right-radius: 8px;"><center>Discount</center></th>
                        </tr>
                    </thead>
                    <tbody>
                        ${trElements.join('')}
                    </tbody>
                </table>
            `;

            qtyElementHTML += `
                <div class="product-quantity-input-block" data-variantid="${variantId}" id="qty-block-${variantId}" style="display: ${variantId == selectedValue ? 'inline-flex':'none'}; align-items: center; border: 1px solid #ccc; border-radius: 4px; width: fit-content;">
                    <button class="product-quantity-minus" id="qty-plus-${variantId}" style="width: 40px; height: 40px; background: none; border: none; border-right: 1px solid #ccc; font-size: 16px; cursor: pointer;">−</button>
                    <input class="product-quantity-input" id="qty-input-${variantId}" style="padding:0; margin: 0; width: 40px; height: 40px; border: none; font-size: 16px; text-align: center;" value="${response.priceConfig[0].quantity}" readonly>
                    <button class="product-quantity-plus" id="qty-minus-${variantId}" style="width: 40px; height: 40px; background: none; border: none; border-left: 1px solid #ccc; font-size: 16px; cursor: pointer;">+</button>
                </div>
            `;

            addToCartButtonsHTML += `
                <button data-variantid="${variantId}" id="AddToCart-${variantId}" class="btn customAddToCart" style="display: ${variantId == selectedValue ? 'block':'none'};border-radius: 0;font-weight: 700; background: #f74423;
                    color: white;
                    padding: 10px 35px;
                    text-transform: none;
                    letter-spacing: 1px;
                    font-size: 12px;
                    min-height: 44px;
                    margin: 0 10px 10px 0;
                    width:50%; 
                    background: #818181; 
                    transition: color .25s ease-in-out,background .25s ease-in-out;"
                >
                    Add to Cart
                </button>
            `;
        }
    }

    var containerHTML = `
        <div class="product-pricing-table-block">
            <div id='volume-pricing-container' style="margin-bottom: 20px; margin-top: 20px;">
                ${tableHTML}
            </div>
        </div>
    `;


    const titleSelector = quickViewSelector.querySelector('.product-details-product-title');
    titleSelector.insertAdjacentHTML('afterend', containerHTML);

    const qtySelector = quickViewSelector.querySelector('.swatches-wrapper');
    qtySelector.insertAdjacentHTML('beforeend', qtyElementHTML);
    qtySelector.querySelector('.js-qty').style.display = 'none';

    const addToCartButtonSelector = quickViewSelector.querySelector('#AddToCart');
    if(addToCartButtonSelector) {
        addToCartButtonSelector.style.display = 'none';
        addToCartButtonSelector.insertAdjacentHTML('afterend', addToCartButtonsHTML)
    }

    const optionsExist = quickViewSelector.querySelectorAll('.swatch.clearfix');
    if(optionsExist.length > 0) {
        optionsExist.forEach(el => {
            el.addEventListener('click', function () {
                const radioButtons = quickViewSelector.querySelectorAll('input[type="radio"]:checked');
                const values = Array.from(radioButtons).map(radio => radio.value);
                const value = values.join(' / ');

                const targetOption = Array.from(selectEl.options).find(opt =>
                    opt.textContent.trim().startsWith(value)
                );

                if(targetOption) {
                    const changedVariantId = targetOption.value;
                    quickViewSelector.querySelectorAll('.variantConfigTable').forEach(el => {
                        el.style.display = 'none';
                    });

                    quickViewSelector.querySelector('#table-'+changedVariantId).style.display = 'table';

                    quickViewSelector.querySelectorAll('.product-quantity-input-block').forEach(el => {
                        el.style.display = 'none';
                    })

                    quickViewSelector.querySelector('#qty-block-'+changedVariantId).style.display = 'inline-flex';
                    var variantQuantity = quickViewSelector.querySelector(`#qty-input-${changedVariantId}`).value;
                    var matchConfig = variantResponses[changedVariantId].priceConfig.find(item => {
                        return item.quantity == variantQuantity;
                    })

                    if(!matchConfig) {
                        matchConfig = variantResponses[changedVariantId].priceConfig[variantResponses[changedVariantId].priceConfig.length - 1];
                    }

                    quickViewSelector.querySelector('#ProductPrice .money').innerHTML = `${matchConfig.currencySymbol}${matchConfig.price}`;

                    reAttachPlusAndMinusListeners(quickViewSelector, variantResponses)

                    quickViewSelector.querySelectorAll('.customAddToCart').forEach(el => {
                        el.style.display = 'none';
                    });

                    quickViewSelector.querySelector(`#AddToCart-${changedVariantId}`).style.display = 'block';
                }
            });
        });
    } else {
        reAttachPlusAndMinusListeners(quickViewSelector, variantResponses);
    }
}

function reAttachPlusAndMinusListeners(quickViewSelector, variantResponses) {
    const minusButton = quickViewSelector.querySelector('.product-quantity-minus');
    const plusButton = quickViewSelector.querySelector('.product-quantity-plus');
    minusButton.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopImmediatePropagation();

        try {
            const variantId = minusButton.parentElement.getAttribute('data-variantid');
            const input = minusButton.parentElement.querySelector('.product-quantity-input');
            const lowerMatch = variantResponses[variantId].priceConfig.find(item => {
                return item.quantity >= (parseInt(input.value) - parseInt(variantResponses[variantId].volumeConfig.increment));
            });

            if(lowerMatch) {
                input.value = lowerMatch.quantity;
            }

            var matchConfig = variantResponses[variantId].priceConfig.find(item => {
                return item.quantity == input.value;
            })

            if(!matchConfig) {
                matchConfig = variantResponses[variantId].priceConfig[0];
            }

            quickViewSelector.querySelector('#ProductPrice .money').innerHTML = `${matchConfig.currencySymbol}${matchConfig.price}`;    
        } catch (error) {
            alert(error.message);    
        }

        return false;
    }, true);

    plusButton.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopImmediatePropagation();

        try {
            const variantId = minusButton.parentElement.getAttribute('data-variantid');
            const input = plusButton.parentElement.querySelector('.product-quantity-input');
            const nextIncrement = variantResponses[variantId].volumeConfig.increment;
            input.value = parseInt(input.value) + parseInt(nextIncrement);

            var matchConfig = variantResponses[variantId].priceConfig.find(item => {
                return item.quantity >= input.value;
            })

            if(!matchConfig) {
                matchConfig = variantResponses[variantId].priceConfig[variantResponses[variantId].priceConfig.length - 1];
            }

            quickViewSelector.querySelector('#ProductPrice .money').innerHTML = `${matchConfig.currencySymbol}${matchConfig.price}`;
            
        } catch (error) {
            alert(error.message);    
        }
        return false;
    }, true)
}

function populateTableForProductPage(response, selector) {
    var tableHTML = '';
    let trElements = new Array();
    for(var config in response.priceConfig) {
        trElements.push(`
            <tr>
                <td style="border: 1px solid #ddd; padding: 8px; background-color: #f2f2f2"> <center>${response.priceConfig[config].quantity}+ </center></td>
                <td style="border: 1px solid #ddd; padding: 8px; background-color: #f2f2f2"> <center>${response.priceConfig[config].currencySymbol}${response.priceConfig[config].price} </center></td>
                <td style="border: 1px solid #ddd; padding: 8px; background-color: #f2f2f2"> <center>${response.priceConfig[config].percentage}% </center></td>
            </tr>    
        `);
    }

    tableHTML = `
        <table id="volume-pricing-table" class="variantConfigTable" style="width: 100%; border-collapse: collapse; margin-top: 10px; border-radius: 8px; overflow: hidden; border: 1px solid #ddd;">
            <thead>
                <tr>
                    <th style="border: 1px solid #ddd; padding: 8px; background-color: #f2f2f2; border-top-left-radius: 8px;"><center>Quantity</center></th>
                    <th style="border: 1px solid #ddd; padding: 8px; background-color: #f2f2f2;"><center>Price</center></th>
                    <th style="border: 1px solid #ddd; padding: 8px; background-color: #f2f2f2; border-top-right-radius: 8px;"><center>Discount</center></th>
                </tr>
            </thead>
            <tbody>
                ${trElements.join('')}
            </tbody>
        </table>
    `;

    var containerHTML = `
        <div class="product-pricing-table-block">
            <div id='volume-pricing-container' style="margin-bottom: 20px; margin-top: 20px;">
                ${tableHTML}
            </div>
        </div>
    `;

    selector.insertAdjacentHTML('afterend', containerHTML);
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

function extractProductHandle(cardElement) {
    try {
        if (windowPathName.includes('/cart')) {
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
      
        const hrefSelector = cardElement.querySelector('.product-grid--title a');
        if(hrefSelector) {
            const href = hrefSelector.getAttribute('href').split('/');
            return href[href.length - 1];
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
        let anchorTagProductId = card.querySelector('a[data-product-id]');
        if (priceDisplay) {
            priceDisplay.innerHTML = 'Loading...';
        }
        return {
            cardElement: card,
            productId: anchorTagProductId != null ? anchorTagProductId.getAttribute('data-product-id'):null,
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
