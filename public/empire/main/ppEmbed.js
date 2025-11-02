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

const productPriceSelectors = [
    '.price.productitem__price'
];

const productCardSelectors = [
    '.productgrid--item'
];

const productCardHeadingSelectors = [
    '.productitem--title a' //parallax theme
];

const storeType = config.storeType;
const customerId = config.customerId;
const isB2B = storeType === 'B2B' ? true : false;
const isHybrid = (storeType === 'Hybrid' || !storeType) ? true : false;
const isCustomerLoggedIn = (customerId !== null) ? true : false;

(async function () {
    await initializeProductState();
    var centeredPriceResponse = null;
            
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

        if(windowPathName == '/') {
            const containerToInject = document.querySelector('.product-details');
            const variantId = containerToInject.querySelector('variant-selection').getAttribute('variant');
            centeredPriceResponse = await getProductVolumePricingByVariantId(variantId);
    
            await refreshTable(containerToInject, centeredPriceResponse);
            const firstPriceConfig = centeredPriceResponse.priceConfig[0];
            const quantitySelector = containerToInject.querySelector('quantity-selector');
            var quantityElement = quantitySelector.querySelector('input.quantity-selector__input');
            if(quantitySelector && quantityElement) {
                quantityElement.value = firstPriceConfig.quantity
            }
            const plusButton = containerToInject.querySelector('button.quantity-selector__button--plus');
            const minusButton = containerToInject.querySelector('button.quantity-selector__button--minus');

            if(plusButton && minusButton && quantityElement) {
                plusButton.addEventListener('click', function (e) { 
                    e.preventDefault();
                    e.stopImmediatePropagation();
                    const newValue = parseInt(quantityElement.value) + parseInt(centeredPriceResponse.volumeConfig.increment);
                    quantityElement.value = newValue;
                    minusButton.parentElement.classList.remove('quantity-selector__button-wrapper--disabled');
                    var firstOneInConfig = centeredPriceResponse.priceConfig.find((item) => { return quantityElement.value == item.quantity });
                    if(firstOneInConfig) {
                        updateHomePageProductFormPricing(containerToInject, firstOneInConfig);
                    }
                }, true);

                minusButton.addEventListener('click', function (e) { 
                    e.preventDefault();
                    e.stopImmediatePropagation();
                    quantityElement.value = parseInt(quantityElement.value) - parseInt(centeredPriceResponse.volumeConfig.increment);
                    if(parseInt(quantityElement.value) <= parseInt(firstPriceConfig.quantity)) {
                        quantityElement.value = firstPriceConfig.quantity;
                        minusButton.parentElement.classList.add('quantity-selector__button-wrapper--disabled');
                    }

                    var firstOneInConfig = centeredPriceResponse.priceConfig.find((item) => { return quantityElement.value == item.quantity });
                    if(firstOneInConfig) {
                        updateHomePageProductFormPricing(containerToInject, firstOneInConfig);
                    }

                }, true);

                const optionsSelectors = containerToInject.querySelectorAll('span.options-selection__option-value-name');
                if(optionsSelectors) {
                    optionsSelectors.forEach(el => {
                        el.addEventListener('click', function () {
                            setTimeout(async () => {
                                const variantId = containerToInject.querySelector('variant-selection').getAttribute('variant');
                                centeredPriceResponse = await getProductVolumePricingByVariantId(variantId);
                                const firstPriceConfig = centeredPriceResponse.priceConfig[0];
                                quantityElement.value = firstPriceConfig.quantity
                                await refreshTable(containerToInject, centeredPriceResponse);
                            }, 100);
                        }, true)
                    })
                }
            }
        }
    }
    if (isHybrid && !isCustomerLoggedIn) {
        return;
    }
    if (isB2B && !isCustomerLoggedIn) {
        const currentPage = windowPathName;
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
        const currentPage = windowPathName;
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
                    showIncrementsText(volumeConfig);
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
        const currentPage = windowPathName;
        if (currentPage.includes('/products/')){
            window.productPageService.createProductPageCustomPricing();
            if (window.productPageState.new.productPriceElement) {
                window.productPageState.new.productPriceElement.style.display = 'none';
                window.productPageState.new.productLoadingSpinner.style.display = 'flex';
                window.productPageService.hideProductPageElements();
                const data = await getProductVolumePricingByVariantId(window.productPageState.productVariantId);
                window.productPageState.productVolumePricing = data;

                const volumeConfig = data.volumeConfig;
                showIncrementsText(volumeConfig);
                await Promise.all([
                    updateProductElement(),
                    updateProductButtons()
                ]);
            }
        }      
    }

    setTimeout(async () => {
        const productsCards = getProductsCards();
        const handleArr = new Array();

        productsCards.map(async productCard => {
            const productHandle = extractProductId(productCard.cardElement);
            handleArr.push(productHandle);
        });

        if(handleArr.length > 0) {
            const response = await getProductVolumePricingByHandleArr(handleArr);   
            if(response.data && response.count) {
                productsCards.map(el => {
                    const pricingSelector = el.cardElement.querySelector(productPriceSelectors[0]);
                    const productHandle = extractProductId(el.cardElement);
                    const matchingTagResponse = response.data.find(item => { return item.productVariantHandle === productHandle });
                    if(matchingTagResponse) {
                        const firstPriceConfig = matchingTagResponse.returnData.priceConfig[0];
                        pricingSelector.innerHTML = getHTMLForCatalogPricing(firstPriceConfig.originalPrice, firstPriceConfig.price, firstPriceConfig.currencySymbol);
                        
                        const isProductSoldOut = el.cardElement.querySelector('.productitem__badge--soldout');
                        if(!isProductSoldOut) {
                            const part = parseFloat(firstPriceConfig.price);
                            const whole = parseFloat(firstPriceConfig.originalPrice);
                            const percentageSaved = parseFloat(100 - ((part / whole) * 100)).toFixed(0);

                            const alreadyExistingDiscountCard = el.cardElement.querySelector('.productitem__badge--sale');
                            if(alreadyExistingDiscountCard) {
                                alreadyExistingDiscountCard.style.display = 'block';
                                alreadyExistingDiscountCard.innerHTML = `
                                    <span data-badge-sales-range="">
                                        Save <span data-price-percent-saved="">${percentageSaved}</span>%
                                    </span>
                                `;
                            } 
                        } 
                    }
                })
            }   
        }
    }, 500);

    if(windowPathName.includes('/cart')) {
        setTimeout(async () => {
            const cartSelector = document.querySelector('ul.cartitems--list');
            const allItems = cartSelector.querySelectorAll('li');

            console.log('allItems length', allItems.length);

            if(allItems.length > 0) {
                for(var i in allItems) {
                    const currentLineItemCart = allItems[i];
                    const variantId = currentLineItemCart.getAttribute('data-cartitem-id');
                    const minusButton = currentLineItemCart.querySelector('button.quantity-selector__button--minus');
                    const plusButton = currentLineItemCart.querySelector('button.quantity-selector__button--plus');
        
                    if(minusButton && plusButton && variantId) {
                        const input = currentLineItemCart.querySelector('input.quantity-selector__input');
                        const variantVolumeConfig = await getProductVolumePricingByVariantId(variantId);
                        const intIncrement = parseInt(variantVolumeConfig.volumeConfig.increment);
                        const intInputValue = parseInt(input.value);
                        const intMinimum = parseInt(variantVolumeConfig.volumeConfig.minimum);
                        const intMaximum = parseInt(variantVolumeConfig.volumeConfig.maximum);

                        if(intInputValue <= intMinimum) {
                            minusButton.disabled = true;
                        }

                        minusButton.addEventListener('click', function(e) {
                            e.preventDefault();
                            e.stopImmediatePropagation();
                            e.target.disabled = true;
                            var newValue = intInputValue - intIncrement;
                            if(newValue < intMinimum) {
                                newValue = intMinimum;
                            }

                            input.value = newValue;
                            input.blur();
                            setTimeout(() => {
                                location.reload();
                            }, 3000);
                        }, true);

                        plusButton.addEventListener('click', function (e) {
                            e.preventDefault();
                            e.stopImmediatePropagation();
                            e.target.disabled = true;
                            var newValue = intInputValue + intIncrement;
                            if(newValue > intMaximum) {
                                newValue = intMaximum;
                            }

                            input.value = newValue;
                            input.blur();
                            setTimeout(() => {
                                location.reload();
                            }, 3000);
                        });
                    }
                }
            }
        }, 500);
    }
})();

async function refreshTable(container, variantConfig) {
    const tableClass = 'product-pricing-table-block';
    container.querySelector(`.${tableClass}`)?.remove();
    const htmlString = `
        <div class="${tableClass}">
            <div id='volume-pricing-container' style="margin-bottom: 20px; margin-top: 20px;">
                <div id="loading-spinner" style="display: none; width: 40px; height: 40px; margin: 20px auto; border: 4px solid #f3f3f3; border-top: 4px solid #3498db; border-radius: 50%; animation: spin 1s linear infinite;"></div>
                <table id='volume-pricing-table' style="width: 100%; border-collapse: collapse; margin-top: 10px; border-radius: 8px; overflow: hidden; border: 1px solid #ddd;">
                    <thead>
                    <tr>
                        <th style="border: 1px solid #ddd; padding: 8px; background-color: #f2f2f2 ; border-top-left-radius: 8px;">Quantity</th>
                        <th style="border: 1px solid #ddd; padding: 8px; background-color: #f2f2f2;">Price</th>
                        <th style="border: 1px solid #ddd; padding: 8px; background-color: #f2f2f2; border-top-right-radius: 8px;">Discount</th>
                    </tr>
                    </thead>
                </table>
            </div>
        </div>
    `;
    container.querySelector('.product-block--title').insertAdjacentHTML("afterend", htmlString);
    if(variantConfig != null && variantConfig.hasOwnProperty('priceConfig') && variantConfig.priceConfig != null && variantConfig.priceConfig.length > 0) {
        const { volumeConfig, priceConfig, tag, type } = variantConfig;
        const volumePricingTable = document.getElementById('volume-pricing-table');
        const body = volumePricingTable.createTBody();
        priceConfig.forEach(config => {
            const row                   = body.insertRow();
            const quantityCell          = row.insertCell();
            const priceCell             = row.insertCell();
            const discountCell          = row.insertCell();
            quantityCell.textContent    = `${config.quantity === 0 ? volumeConfig.minimum : config.quantity}+`;
            priceCell.textContent       = `${config.currencySymbol}${fixDecimals(config.price)}`;              
            
            if (type === 'fixedAmount'){   
                const discountAmount = `${config.discountAmount}`;
                discountCell.textContent = `${config.currencySymbol}${fixDecimals(discountAmount)}`;
            } else {
                const discountPercentage = `${config.percentage}`;
                discountCell.textContent = `${discountPercentage}%`;
            }
            
            [quantityCell, priceCell, discountCell].forEach(cell => {
                cell.style.border = '1px solid #ddd';
                cell.style.padding = '8px';
                cell.style.textAlign = 'center';
            });
        });

        const firstPriceConfig = priceConfig[0];
        const quantitySelector = container.querySelector('quantity-selector');
        var quantityElement = quantitySelector.querySelector('input.quantity-selector__input');
        if(quantitySelector && quantityElement) {
            quantityElement.value = firstPriceConfig.quantity
        }

        updateHomePageProductFormPricing(container, firstPriceConfig);
    } else {
        container.querySelector(`.${tableClass}`).remove();
    }
}

function updateHomePageProductFormPricing(containerToInject, priceConfig) {
    const pricingDiv = containerToInject.querySelector('div.product-pricing');
    if(pricingDiv) {
        const savePercentage = pricingDiv.querySelectorAll('span[data-price-percent-saved]');
        if(savePercentage) {
            savePercentage.forEach(el => {
                el.innerHTML = priceConfig.percentage;
            })
        }

        const compareAtPriceMoney = pricingDiv.querySelectorAll('.price__compare-at--single');
        if(compareAtPriceMoney) {
            compareAtPriceMoney.forEach(el => {
                el.innerHTML = `${priceConfig.currencySymbol}${priceConfig.originalPrice}`;
            });
        }

        const showMoney = pricingDiv.querySelectorAll('span[data-price]');
        if(showMoney) {
            showMoney.forEach(el => {
                el.innerHTML = `${priceConfig.currencySymbol}${priceConfig.price}`
            })
        }
    }
}

function showIncrementsText(volumeConfig) {
    var textContent;
    try {
        if(volumeConfig != null && volumeConfig.hasOwnProperty('minimum') && volumeConfig.hasOwnProperty('increment') && volumeConfig.hasOwnProperty('maximum')) {
            const min = volumeConfig.minimum;
            const inc = volumeConfig.increment;
            const max = volumeConfig.maximum === Number.MAX_SAFE_INTEGER ? '∞' : volumeConfig.maximum;
            if (!volumeConfig.maximum || volumeConfig.maximum == Number.MAX_SAFE_INTEGER) {
                textContent = `Min. ${min} &#x2022; Increments of ${inc}`;
            } else {
                textContent = `Min. ${min} &#x2022; Max ${max} &#x2022; Increments of ${inc}`;
            }
        }
    } catch(err) {
        console.log('Error in line 201');
        console.log(err.message);    
    }
    
    document.querySelector('.product-block--inventory_status').insertAdjacentHTML('beforeend',`
        <div class="product-stock-level-wrapper" data-stock-level="" data-stock-variant-id="41487863742554" data-stock-variant-selected="true">
            <span class="product-stock-level product-stock-level--high">
                <span class="product-stock-level__availability">Constraints: </span>
                <span class="product-stock-level__text">
                    <div class="product-stock-level__badge-text" style="color:black;font-weight:bold">   
                        ${textContent}
                    </div>
                </span>
            </span>
        </div>
    `);             
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
                        productId: productId,
                        variantId: variant.id,
                        productName: productName
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
        
        for (let selector of productCardHeadingSelectors) {
            heading = cardElement.querySelector(selector);
            if (heading) break;
        }
        
        if (heading) {
            const idParts = heading.getAttribute('href').split("/");
            return idParts[idParts.length - 1];
        }
        
        return null;
    } catch (error) {
        return null;
    }
}

function getHTMLForCatalogPricing(compareAtPrice = null, productPrice = null, currencySymbol = null) {
    return `
        <div class="price__compare-at visible" data-price-compare-container="">
            <span class="visually-hidden">Original price</span>
            <span class="money price__compare-at--single" data-price-compare="">
                ${compareAtPrice ? currencySymbol+''+compareAtPrice : ''}
            </span>
        </div>
      
        <div class="price__compare-at--hidden" data-compare-price-range-hidden="">      
            <span class="visually-hidden">Original price</span>
            <span class="money price__compare-at--min" data-price-compare-min="">
                ${compareAtPrice ? currencySymbol+''+compareAtPrice : ''}
            </span>
            -
            <span class="visually-hidden">Original price</span>
            <span class="money price__compare-at--max" data-price-compare-max="">
                ${compareAtPrice ? currencySymbol+''+compareAtPrice : ''}
            </span>
        </div>

        <div class="price__compare-at--hidden" data-compare-price-hidden="">
            <span class="visually-hidden">Original price</span>
            <span class="money price__compare-at--single" data-price-compare="">
            ${compareAtPrice ? currencySymbol+''+compareAtPrice : ''}
            </span>
        </div>

        <div class="price__current price__current--emphasize price__current--on-sale" data-price-container="">
            <span class="money price__current--min" data-price-min=""></span>
            <span class="money price__current--max" data-price-max="">${productPrice ? currencySymbol+''+productPrice : ''}</span>
        </div>
        
        <div class="price__current--hidden" data-current-price-range-hidden="">
            <span class="money price__current--min" data-price-min="">${productPrice ? currencySymbol+''+productPrice : ''}</span>
            <span class="money price__current--max" data-price-max=""></span>
        </div>
        
        <div class="price__current--hidden" data-current-price-hidden="">
            <span class="visually-hidden">Current price</span>
            <span class="money" data-price="">
                ${productPrice ? currencySymbol+''+productPrice : ''}
            </span>
        </div> 
        
        <div class="productitem__unit-price hidden" data-unit-price="">
            <span class="productitem__total-quantity" data-total-quantity=""></span> | 
            <span class="productitem__unit-price--amount money" data-unit-price-amount=""></span> / 
            <span class="productitem__unit-price--measure" data-unit-price-measure=""></span>
        </div>
    `;
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
            if (priceDisplay)  { 
                break; 
            } // Found valid price container
        }
        if (priceDisplay) {
            priceDisplay.innerHTML = getHTMLForCatalogPricing(null, 'Loading...', '');
        }
        return {
            cardElement: card,
            productId: extractProductId(card)
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

function changeAllSavedPercentageLabels(percentage) {
    const parentSelector = document.querySelector('section.product__container');
    if(parentSelector) {
        parentSelector.querySelectorAll('span[data-price-percent-saved]').forEach(el => {
            el.textContent = percentage
        });
    }
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
        changeAllSavedPercentageLabels(priceConfig.percentage);
        window.productPageState.new.productPriceElement.style.alignItems = 'center';
        window.productPageState.new.productPriceElement.innerHTML = getPriceDisplayHTML(`${priceConfig.currencySymbol}${priceConfig.originalPrice}`, `${priceConfig.currencySymbol}${priceConfig.price}`);
      }
      window.productPageState.original.productOriginalQuantityInput.value = currentValue;
      window.productPageState.new.productQuantityInput.value = currentValue;
      return;
    }
}

function getPriceDisplayHTML(compareAtPrice, displayPrice) {
    return `
        <span style="font-size: 1.2em; font-weight: bold; margin-right: 5px;">${displayPrice}</span>
        <span style="font-size: 0.8em; color: #666;">MSRP ${compareAtPrice}</span>
    `;
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
        changeAllSavedPercentageLabels(priceConfig.percentage);
        window.productPageState.new.productPriceElement.style.alignItems = 'center';
        window.productPageState.new.productPriceElement.innerHTML = getPriceDisplayHTML(`${priceConfig.currencySymbol}${priceConfig.originalPrice}`, `${priceConfig.currencySymbol}${priceConfig.price}`);
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
        window.productPageState.new.productPriceElement.innerHTML = getPriceDisplayHTML(`${priceInfo.currencySymbol}${priceInfo.originalPrice}`, `${priceInfo.currencySymbol}${priceInfo.price}`);
        if (window.productPageState.original.productOriginalQuantityInput) {
            window.productPageState.original.productOriginalQuantityInput.value = volumeConfig.minimum === 0 ? 1 : volumeConfig.minimum;
        }      
        window.productPageState.new.productQuantityInput.value = volumeConfig.minimum === 0 ? 1 : volumeConfig.minimum;
        window.productPageState.new.productPriceElement.readOnly = true;
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
