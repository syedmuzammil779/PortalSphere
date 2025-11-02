const currentScript = document.currentScript || (function () {
    const scripts = document.getElementsByTagName('script');
    return scripts[scripts.length - 1];
})();

const url = new URL(currentScript.src);
const params = new URLSearchParams(url.search);

const pptPathName = window.top.location.pathname;

// Extract the parameters
const config = {
    apiKey: params.get("api_key"),
    appDomain: params.get("appDomain"),
    customerId: params.get("customerId"),
    shopId: params.get("shopId"),
    shopDomain: params.get("shopDomain"),
    storeType: params.get("storeType"),
    timestamp: params.get("timestamp"),
    hmac: params.get("hmac"),
    productVariantId: params.get("productVariantId")
};

var Shopify = Shopify || {};
Shopify.theme = Shopify.theme || {};   

const productPriceSelectors = [
    'span.grid-product__price-wrap' //Brooklyn Theme
];

const productCardSelectors = [
    'div.grid-product',  // Brooklyn Theme
];

const productCardHeadingSelectors = [
    'a.grid-product__image-link'
];

const storeType = config.storeType;
const customerId = config.customerId;
const isB2B = storeType === 'B2B' ? true : false;
const isHybrid = (storeType === 'Hybrid' || !storeType) ? true : false;
const isCustomerLoggedIn = (customerId !== null) ? true : false;

async function populateVolumePricingTable() {
    let volumePricingContainer = document.getElementById('volume-pricing-container');
    let volumePricingTable = document.getElementById('volume-pricing-table');
    let loadingSpinner = document.getElementById('loading-spinner');
    // Show loading spinner and hide table
    loadingSpinner.style.display = 'block';
    volumePricingTable.style.display = 'none';
    try {
        let volumePricingData = await window.productPricingService.getVolumePricingByProductVariantId(config.appDomain, config.shopDomain, config.apiKey, config.timestamp, config.hmac, config.customerId, config.productVariantId);        
        // Hide loading spinner
        loadingSpinner.style.display = 'none';
        const volumeConfig = volumePricingData?.volumeConfig;
        const priceConfig = volumePricingData?.priceConfig;         
        if (!priceConfig || priceConfig.length === 0) {
            volumePricingContainer.style.display = 'none';
            return;
        }
        // Show table and populate data
        volumePricingTable.style.display = 'table';          
        const body = volumePricingTable.createTBody();
        priceConfig.forEach(config => {
            const row = body.insertRow();
            const quantityCell = row.insertCell();
            const priceCell = row.insertCell();
            const discountCell = row.insertCell();
            quantityCell.textContent = `${config.quantity === 0 ? volumeConfig.minimum : config.quantity}+`;
            priceCell.textContent = `${config.currencySymbol}${fixDecimals(config.price)}`;              
            if (volumePricingData.type === 'fixedAmount'){   
                const discountAmount = `${config.discountAmount}`;
                discountCell.textContent = `${config.currencySymbol}${fixDecimals(discountAmount)}`;
            }
            else {
                const discountPercentage = `${config.percentage}`;
                discountCell.textContent = `${discountPercentage}%`;
            }
            [quantityCell, priceCell, discountCell].forEach(cell => {
                cell.style.border = '1px solid #ddd';
                cell.style.padding = '8px';
                cell.style.textAlign = 'center';
                cell.style.backgroundColor = 'white';
            });
        });
    } catch (error) {
        console.error('Error updating product prices:', error);
        volumePricingContainer.style.display = 'none'; // Hide the container if there's an error
        loadingSpinner.style.display = 'none'; // Hide the loading spinner
    }
}

const setInputConstraints = (input, config) => {
    input.readOnly = true;
    input.min = config.volumeConfig.minimum;
    input.max = config.volumeConfig.maximum;
    input.step = config.volumeConfig.increment;
    input.parentElement.querySelector('.js-qty__adjust--minus').addEventListener('click', async function (e) { 
        e.preventDefault();
        e.stopImmediatePropagation();
        await changeThisCartPageItem(input, 'decrement'); 
    }, true);
    input.parentElement.querySelector('.js-qty__adjust--plus').addEventListener('click', async function (e) {  
        e.preventDefault();
        e.stopImmediatePropagation();
        await changeThisCartPageItem(input, 'increment');
    }, true);
};

async function changeThisCartPageItem(input, type = 'increment') {
  let value = parseInt(input.value);
  if(type == 'increment') {
    value = value + parseInt(input.step);
  } else {
    value = value - parseInt(input.step);
  }

  if(value < 0) value = 0;

  const variantId = input.getAttribute('data-id').split(':')[0];
  await window.cartService.updateProductToCart(variantId, value);
  input.value = value;
  location.reload();
}

function disableCartPageQuantityButtons() {
    const quantityButtons = document.querySelectorAll('button.js-qty__adjust');
    if(quantityButtons) {
        quantityButtons.forEach(el => {
            el.disabled = true;
            el.style.cursor = 'not-allowed';
        })
    }
}

function enableCartPageQuantityButtons() {
    const quantityButtons = document.querySelectorAll('button.js-qty__adjust');
    if(quantityButtons) {
        quantityButtons.forEach(el => {
            el.disabled = false;
            el.style.cursor = 'pointer';
        })
    }
}

if(pptPathName.includes('/cart')) {
    if(isCustomerLoggedIn) {
        disableCartPageQuantityButtons();
        
        try {
            const cartRows = document.querySelectorAll('.cart__row');
            cartRows.forEach(async (el) => {
                const anchorTag = el.querySelector('a.cart__product-name');
                if(anchorTag) {
                    const variantId = anchorTag.getAttribute('href').split('?variant=')[1];
                    const volResponse = await getProductVolumePricingByVariantId(variantId);
                    if(volResponse.volumeConfig && volResponse.volumeConfig.increment) {
                        const input = el.querySelector('.js-qty__num');
                        setInputConstraints(input, volResponse);
                    }
                }
            });    
        } catch (error) {
            console.error(error);    
        }
        
        enableCartPageQuantityButtons();
    }
}

if(pptPathName.includes('products')) {
    const tableHTML = `
        <div class="product-pricing-table-block">
            <div id='volume-pricing-container' style="margin-bottom: 20px; margin-top: 20px;">
                <div id="loading-spinner" style="display: none; width: 40px; height: 40px; margin: 20px auto; border: 4px solid #f3f3f3; border-top: 4px solid #3498db; border-radius: 50%; animation: spin 1s linear infinite;"></div>
                <table id='volume-pricing-table' style="width: 100%; border-collapse: collapse; margin-top: 10px; border-radius: 8px; overflow: hidden; border: 1px solid #ddd;">
                    <thead>
                        <tr>
                            <th style="border: 1px solid #ddd; padding: 8px; background-color: white ; border-top-left-radius: 8px;"><center><b>Quantity</b></center></th>
                            <th style="border: 1px solid #ddd; padding: 8px; background-color: white;"><center><b>Price</b></center></th>
                            <th style="border: 1px solid #ddd; padding: 8px; background-color: white; border-top-right-radius: 8px;"><center><b>Discount</b></center></th>
                        </tr>
                    </thead>
                </table>
            </div>
        </div>
        <style>
        @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
        }
        </style>
    `;

    const placeToInjectTable = document.querySelector('.product-single__title');
    if(placeToInjectTable) {
        placeToInjectTable.insertAdjacentHTML('afterend', tableHTML);
        setTimeout(async () => { await populateVolumePricingTable(); }, 10);
    }
}

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
                window.productPageState.new.productLoadingSpinner.style.display = 'flex';
                window.productPageService.hideProductPageElements();
                const data = await getProductVolumePricingByVariantId(window.productPageState.productVariantId);
                window.productPageState.productVolumePricing = data;
                const volumeConfig = data.volumeConfig;
                const quantityInfo = document.createElement('p');
                quantityInfo.id = 'volume-pricing-quantity-info';
                //quantityInfo.style.textAlign = 'left';
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
    setTimeout(async () => {
        const productsCards = getProductsCards();
        const allHandles = productsCards.map(item => { return item.productId });

        if(allHandles != null && allHandles.length > 0) {
            const resp = await getProductVolumePricingByHandleArr(allHandles);
            if(resp.data != null && resp.data.length > 0) {
                for(var i in resp.data) {
                    const currentRespData = resp.data[i];
                    const currentHandle = currentRespData.productVariantHandle;
                    const priceConfig = currentRespData.returnData.priceConfig[0];

                    const priceSelector = document.querySelector(`.grid-product__meta[href="/products/${currentHandle}"]`);
                    if(priceSelector) {
                        const priceDisplaySelector = priceSelector.querySelector('.grid-product__price-wrap');
                        if(priceDisplaySelector) {

                            const priceDiff = parseFloat(priceConfig.originalPrice) - parseFloat(priceConfig.price);

                            priceDisplaySelector.innerHTML = `
                                <br>
                                <span class="grid-product__price">
                                    <span class="on-sale__regular-price"><s>${priceConfig.currencySymbol}${priceConfig.originalPrice}</s></span>
                                    <span class="visually-hidden">Sale price</span>
                                    ${priceConfig.currencySymbol}${priceConfig.price}
                                </span>
                            `;

                            //Now see if you can find the save balloon on the card
                            const parentSelector = priceSelector.parentElement.parentElement;
                            const balloonSelector = parentSelector.querySelector('.grid-product__on-sale');
                            const outOfStockSelector = parentSelector.querySelector('.grid-product__sold-out');
                            if(!outOfStockSelector) {
                                if(balloonSelector) {
                                    balloonSelector.innerHTML = `
                                        <p>Save <br> ${priceConfig.currencySymbol}${priceDiff.toFixed(1)} </p>
                                    `;
                                } else {
                                    const buttonSelector = parentSelector.querySelector('.grid-product__image-link');
                                    if(buttonSelector) {
                                        buttonSelector.insertAdjacentHTML(`afterend`, `
                                            <div class="grid-product__on-sale">
                                                <p>Save <br> ${priceConfig.currencySymbol}${priceDiff.toFixed(1)} </p>
                                            </div>    
                                        `);
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }

        
    }, 1000);

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
        
        for (let selector of productCardHeadingSelectors) {
            heading = cardElement.querySelector(selector);
            if (heading) break;
        }
        
        if (heading) {
            const idParts = heading.getAttribute('href').split("/products/");
            return idParts[idParts.length - 1];
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
            priceDisplay.innerHTML = `
                <br>
                <span class="grid-product__price">
                    <span class="on-sale__regular-price"></span>
                    <span class="visually-hidden">Sale price</span>
                    Loading...
                </span>
            `;
        }
        return {
            cardElement: card,
            productId: extractProductId(card),
            productVolumePricing: null
        };
    });
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
        window.productPageState.new.productPriceElement.innerHTML = `${priceConfig.currencySymbol}${priceConfig.price}`;
        window.productPageState.new.productMSRPPriceElement.innerHTML = `MSRP ${priceConfig.currencySymbol}${priceConfig.originalPrice}`;
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
        window.productPageState.new.productPriceElement.innerHTML = `${priceConfig.currencySymbol}${priceConfig.price}`;
        window.productPageState.new.productMSRPPriceElement.innerHTML = `MSRP ${priceConfig.currencySymbol}${priceConfig.originalPrice}`;
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

      window.productPageState.new.productPriceElement.innerHTML = `${priceInfo.currencySymbol}${priceInfo.price}`;
      window.productPageState.new.productMSRPPriceElement.innerHTML = `MSRP ${priceInfo.currencySymbol}${priceInfo.originalPrice}`;
      
      if (window.productPageState.original.productOriginalQuantityInput) {
        window.productPageState.original.productOriginalQuantityInput.value = volumeConfig.minimum === 0 ? 1 : volumeConfig.minimum;
      }

      window.productPageState.new.productQuantityInput.value = volumeConfig.minimum === 0 ? 1 : volumeConfig.minimum;
      window.productPageState.new.productPriceElement.readOnly = true;
    }
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
