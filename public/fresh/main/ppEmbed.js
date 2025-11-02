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
    '.current-price'
];

const productCardSelectors = [
    '#AjaxinateContainer .grid__item'
];

//We are replacing the cart page button selectors in this one.
//Because apparently there is some issue with the cart button selectors.

const productCardHeadingSelectors = [
    'span.indiv-product-title-text' //parallax theme
];

const storeType = config.storeType;
const customerId = config.customerId;
const isB2B = storeType === 'B2B' ? true : false;
const isHybrid = (storeType === 'Hybrid' || !storeType) ? true : false;
const isCustomerLoggedIn = (customerId !== null) ? true : false;

(async function () {
    await initializeProductState();
    const form = document.querySelector('form[action="/cart/add"]');
    const currentPage = window.location.pathname;

    if(currentPage.includes('/cart')) {
        await window.enhanceCartPageQuantities();
    }

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

    //  adding min and max price into product page
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
    setTimeout(async () => {
        const productsCards = getProductsCards();
        const pricingPromises = productsCards.map(async productCard => {
            const handle = extractProductId(productCard.cardElement);

            let productId = null;
            try {
                const res = await fetch(`/products/${handle}.js`);
                if (!res.ok) throw new Error('Failed to fetch product JSON');
                const productData = await res.json();
                productId = productData.id.toString();
            } catch (err) {
                console.error(`Could not get productId from handle: ${handle}`, err);
                return { productCard, pricing: null };
            }

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
                    const pricing = await getProductVolumePricingByVariantId(productId);
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
                    const priceDisplay = productPriceSelectors.map(selector => productCard.cardElement.querySelector(selector))
                    .find(el => el);

                    if (priceDisplay) {
                        const { currencySymbol, price, originalPrice } = pricing.priceConfig[0];
                        priceDisplay.innerHTML = `
                            <span style="font-size: 1.2em; font-weight: bold;">${currencySymbol}${price}</span>
                            <span style="font-size: 0.8em; color: #666;">MSRP ${currencySymbol}${originalPrice}</span>
                        `;
                    } else {
                        console.warn(`Price display element not found for product card:`, productCard);
                    }
                } else {
                    console.warn(`Pricing data is missing or empty for product card:`, productCard);
                }
            });
        })
        .catch(error => {
            console.error('Error updating product prices:', error);
        });
    }, 1000);

})();

async function enhanceCartPageQuantities() {
  const cartItems = document.querySelectorAll('tr.line-item');
  if (!cartItems.length) return;

  for (const item of cartItems) {
    const quantityWrapper = item.querySelector('.cart-table-quantity .quantity-controls');
    if (!quantityWrapper || quantityWrapper.dataset.enhanced === "true") continue;

    const quantityInput = quantityWrapper.querySelector('input.quantity-selector');
    if (!quantityInput) continue;

    const currentValue = parseInt(quantityInput.value, 10) || 1;
    const variantId = quantityInput.name.match(/\[(\d+)\]/)?.[1]; // Extract from name="updates[47630907146482]"
    const dataIndex = item.dataset.index || ""; // Add index manually if needed
    const lineId = item.className.match(/id-(\d+)/)?.[1] || ""; // Extract from class like id-47630907146482

    const productTitle = item.querySelector('a.cart-table-title__title')?.textContent?.trim() || "product";

    // Mark as enhanced to avoid duplicate work
    quantityWrapper.dataset.enhanced = "true";
    const style = document.createElement('style');
    style.textContent = `
      quantity-input.quantity.cart-quantity {
        display: flex;
        margin-top: 15px;
      }
      .parallax-cart-input .quantity-popover-container {
        display: flex;
        align-items: center;
      }
      .parallax-cart-input .quantity__button {
        background: #f4f4f4;
        border: none;
        width: 40px;
        height: 40px;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        transition: background 0.2s ease-in-out;
      }
      .parallax-cart-input .quantity__button:hover {
        background: #e2e2e2;
      }
      .parallax-cart-input .quantity__input {
        width: 50px;
        text-align: center;
        // border: 1px solid #ccc;
        font-size: 16px;
        height: 40px;
        padding: 0;
        outline: 0;
        background-color: #fff;
      }
      .parallax-cart-input .quantity__input::-webkit-inner-spin-button,
      .parallax-cart-input .quantity__input::-webkit-outer-spin-button {
        -webkit-appearance: none;
        margin: 0;
      }
      .parallax-cart-input .icon {
        width: 16px;
        height: 16px;
        color: #333;
      }
      .parallax-cart-input .svg-wrapper {
        display: flex;
        align-items: center;
        justify-content: center;
      }
        .dispnone{ display:none; }
    `;
    document.head.appendChild(style);

    // Fetch volume pricing config
    let config = await getProductVolumePricingByVariantId(variantId);
    if (!config || !config.volumeConfig) continue;

    const { minimum, maximum, increment } = config.volumeConfig;
    const minNum = parseInt(minimum);
    const maxNum = parseInt(maximum);
    const stepNum = parseInt(increment);

    // Replace quantity controls with enhanced HTML
    quantityWrapper.innerHTML = `
      <div class="parallax-cart-input cart-item__quantity-wrapper quantity-popover-wrapper">
        <label class="visually-hidden dispnone" for="Quantity-${lineId}">Quantity</label>
        <div class="quantity-popover-container">
          <quantity-input class="quantity cart-quantity" data-enhanced="true">
            <button class="quantity__button" name="minus" type="button" aria-label="Decrease quantity for ${productTitle}">-</button>
            <input
              class="quantity__input"
              type="number"
              name="updates[${variantId}]"
              id="Quantity-${lineId}"
              value="${currentValue}"
              min="${minNum}"
              max="${maxNum}"
              step="${stepNum}"
              data-variant-id="${variantId}"
              data-line-id="${lineId}"
              data-index="${dataIndex}"
            />
            <button class="quantity__button" name="plus" type="button" aria-label="Increase quantity for ${productTitle}">+</button>
          </quantity-input>
        </div>
      </div>
    `;

    // Attach event handlers
    const minusBtn = quantityWrapper.querySelector('button[name="minus"]');
    const plusBtn = quantityWrapper.querySelector('button[name="plus"]');
    const inputField = quantityWrapper.querySelector('input.quantity__input');

    let updating = false;

    const updateQuantity = async (newQty) => {
      if (updating) return;
      updating = true;

      if (newQty < minNum) newQty = minNum;
      if (newQty > maxNum) newQty = maxNum;
      if ((newQty - minNum) % stepNum !== 0) {
        newQty = newQty - ((newQty - minNum) % stepNum);
      }

      inputField.value = newQty;

      try {
        if (typeof updateProductToCart === 'function') {
          await updateProductToCart(variantId, newQty);
          location.reload(); // Or dynamically update cart without reloading
        }
      } catch (err) {
        console.error('Cart update failed:', err);
      } finally {
        updating = false;
      }
    };

    minusBtn.addEventListener('click', () => {
      let val = parseInt(inputField.value, 10) || minNum;
      updateQuantity(val - stepNum);
    });

    plusBtn.addEventListener('click', () => {
      let val = parseInt(inputField.value, 10) || minNum;
      updateQuantity(val + stepNum);
    });

    inputField.addEventListener('change', () => {
      let val = parseInt(inputField.value, 10) || minNum;
      updateQuantity(val);
    });
  }

  const updateBtn = document.getElementById('update_quantities');
  if (updateBtn) updateBtn.classList.add('d-none');
}


function extractVariantIdFromRemoveLink(itemEl) {
  const removeLink = itemEl.querySelector('cart-remove-button a');
  return removeLink?.href?.match(/id=(\d+)/)?.[1] || '';
}

// document.addEventListener('DOMContentLoaded', enhanceCartPageQuantities);



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

async function fetchProductIdFromHandle(handle) {
    const response = await fetch(`/products/${handle}.js`);
    if (response.ok) {
        const product = await response.json();
        return product.id; // This is the product ID
    }
    return null;
}


function extractProductId(cardElement) {
    try {
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

        try {
            const link = cardElement.querySelector('a.indiv-product__link');
                if (link) {
                    const handle = link.getAttribute('href').split('/products/')[1];
                    return handle;
                }
            return element.replace('product-grid-', '');
        } catch (error) {
            console.log('error here', error.message);
        }    
    } catch (error) {
        console.log('Error ine xtracting product id', error.message);
    }
    return null;
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
            if (priceDisplay) {
                break;
            } // Found valid price container
        }
        if (priceDisplay) {
            priceDisplay.innerHTML = 'Loading...';
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