if (!window.updateLocks) {window.updateLocks = new Map();}
// IndexDB Service
if (!window.indexDBService) {
  window.indexDBService = {
    DB_NAME: 'PortalSphereDB',
    DB_VERSION: 1,
    DB_VOLUME_PRICING: 'volumePricingData',
    DB_COMPLEMENTARY_PRODUCTS: 'complementaryProductsData',
    DB_TOP_PRODUCTS: 'topProductsData',
    DB_CUSTOMER_TAG: 'customerTagData',
    initDb: function() {
      return new Promise((resolve, reject) => {
        const request = indexedDB.open(this.DB_NAME, this.DB_VERSION);
        
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result);
        
        request.onupgradeneeded = (event) => {
          const db = event.target.result;
          if (!db.objectStoreNames.contains(this.DB_VOLUME_PRICING)) {
            db.createObjectStore(this.DB_VOLUME_PRICING, { keyPath: 'id' });
          }
          if (!db.objectStoreNames.contains(this.DB_COMPLEMENTARY_PRODUCTS)) {
            db.createObjectStore(this.DB_COMPLEMENTARY_PRODUCTS, { keyPath: 'id' });
          }
          if (!db.objectStoreNames.contains(this.DB_TOP_PRODUCTS)) {
            db.createObjectStore(this.DB_TOP_PRODUCTS, { keyPath: 'id' });
          }
          if (!db.objectStoreNames.contains(this.DB_CUSTOMER_TAG)) {
            db.createObjectStore(this.DB_CUSTOMER_TAG, { keyPath: 'id' });
          }
        };
      });
    },
    saveToIndexedDb: async function(key, data, table) {
      try {
        const db = await this.initDb();
        return new Promise((resolve, reject) => {
          const transaction = db.transaction([table], 'readwrite');
          const store = transaction.objectStore(table);
          
          const record = {
            id: key,
            data: data,
            timestamp: Date.now()
          };
          
          const request = store.put(record);
          request.onerror = () => reject(request.error);
          request.onsuccess = () => resolve(request.result);
        });
      }
      catch (error) {
        console.error('Error saving to IndexedDB:', error);
        throw error;
      }
    },
    isDataFresh: function(timestamp) {
      const FIVE_SECONDS = 5 * 1000;
      return Date.now() - timestamp < FIVE_SECONDS;
    },
    getFromIndexedDb: async function(table, key) {
      if (!key) {
        return null;
      }
      try {
        const db = await this.initDb();
        return new Promise((resolve, reject) => {
          const transaction = db.transaction([table], 'readonly');
          const store = transaction.objectStore(table);
          
          const request = store.get(key);
          
          request.onerror = () => reject(request.error);
          request.onsuccess = () => {
            const record = request.result;
            if (record && this.isDataFresh(record.timestamp)) {
              resolve(record.data);
            } else {
              // Data is either not found or stale
              resolve(null);
            }
          };
        });
      }
      catch (error) {
        console.error('Error fetching from IndexedDB:', error);
        throw error;
      }
    }
  }
}

function refreshCartDrawerAndCountNonDestructive() {
  const cartDrawer = document.querySelector('mini-cart');
  const cartCountBubble = document.querySelector('#cart-icon-bubble');

  fetch(window.Shopify.routes.root + '?sections=mini-cart,header')
    .then(res => res.json())
    .then(data => {
      const drawerHTML = data['mini-cart'];
      const headerHTML = data['header'];

      // Only replace inner content of mini-cart drawer
      const tempDiv = document.createElement('div');
      tempDiv.innerHTML = drawerHTML;

      const newInner = tempDiv.querySelector('.mini-cart__inner');
      const currentInner = cartDrawer?.querySelector('.mini-cart__inner');

      if (newInner && currentInner) {
        currentInner.innerHTML = newInner.innerHTML;
      }

      // Replace header cart icon
      const tempHeader = document.createElement('div');
      tempHeader.innerHTML = headerHTML;
      const newCartIcon = tempHeader.querySelector('#cart-icon-bubble');
      const oldCartIcon = document.querySelector('#cart-icon-bubble');
      if (newCartIcon && oldCartIcon) {
        oldCartIcon.replaceWith(newCartIcon);
      }

      // Manually open cart if needed
      if (!document.body.classList.contains('mini-cart--open')) {
        document.body.classList.add('mini-cart--open');
        cartDrawer?.setAttribute('open', '');
      }
    });
}

function refreshCartIconBubble() {
  fetch('/cart.js')
    .then(res => res.json())
    .then(cart => {
      const itemCount = cart.item_count;

      const cartIconBubble = document.querySelector('#cart-icon-bubble');
      const countSpan = cartIconBubble?.querySelector('.cart-count-bubble span[aria-hidden="true"]');
      const screenReaderSpan = cartIconBubble?.querySelector('.cart-count-bubble span.visually-hidden');

      if (countSpan) {
        countSpan.textContent = itemCount.toString();
      }

      if (screenReaderSpan) {
        screenReaderSpan.textContent = `${itemCount} item${itemCount !== 1 ? 's' : ''}`;
      }

      console.debug('[Cart Icon] Updated to count:', itemCount);
    })
    .catch(err => {
      console.error('[Cart Icon] Failed to update:', err);
    });
}

async function updateCartBubbleFromCartJS() {
  try {
    const response = await fetch('/cart.js', {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    const cart = await response.json();
    const itemCount = cart.item_count;
    console.debug('[Cart Bubble] Updated from /cart.js:', itemCount);

    // Wait for DOM if needed
    if (!document.querySelector('#cart-icon-bubble')) {
      await new Promise(resolve => setTimeout(resolve, 100)); // short delay
    }

    const bubbleWrapper = document.querySelector('#cart-icon-bubble .cart-count-bubble');
    if (!bubbleWrapper) return;

    const visibleSpan = bubbleWrapper.querySelector('span[aria-hidden="true"]');
    const srSpan = bubbleWrapper.querySelector('.visually-hidden');

    if (visibleSpan) {
      visibleSpan.textContent = itemCount;
    }

    if (srSpan) {
      srSpan.textContent = `${itemCount} item${itemCount === 1 ? '' : 's'}`;
    }
  } catch (err) {
    console.error('[Cart Bubble] Failed to update:', err);
  }
}

async function injectUpdatedCartBubble() {
  try {
    const response = await fetch('/cart.js', {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    const cart = await response.json();
    const itemCount = cart.item_count;

    console.debug('[Cart Bubble] Updated from /cart.js:', itemCount);

    const bubbleContainer = document.querySelector('#cart-icon-bubble .cart-count-bubble');
    if (bubbleContainer) {
      const spanVisible = bubbleContainer.querySelector('span[aria-hidden="true"]');
      const spanHidden = bubbleContainer.querySelector('span.visually-hidden');

      if (spanVisible) spanVisible.textContent = itemCount;
      if (spanHidden) spanHidden.textContent = `${itemCount} items`;

      bubbleContainer.style.display = itemCount > 0 ? 'inline-block' : 'none';
    }
  } catch (error) {
    console.error('[Cart Bubble] Failed to update:', error);
  }
}
async function forceInjectCartBubble() {
  try {
    const response = await fetch('/cart.js', {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    const cart = await response.json();
    const itemCount = cart.item_count;
    const bubbleId = 'cart-icon-bubble';
    console.debug('[Cart Bubble] Fetched item count:', itemCount);

    const bubbleWrapper = document.getElementById(bubbleId);
    if (!bubbleWrapper) {
      console.warn('[Cart Bubble] Could not find #cart-icon-bubble');
      return;
    }

    // Find or create .cart-count-bubble
    let bubble = bubbleWrapper.querySelector('.cart-count-bubble');
    if (!bubble && itemCount > 0) {
      bubble = document.createElement('span');
      bubble.className = 'cart-count-bubble';
      bubble.innerHTML = `
        <span aria-hidden="true">${itemCount}</span>
        <span class="visually-hidden">${itemCount} items</span>
      `;
      bubbleWrapper.appendChild(bubble);
      console.debug('[Cart Bubble] Injected new .cart-count-bubble');
    } else if (bubble) {
      // Update existing bubble
      const spanVisible = bubble.querySelector('span[aria-hidden="true"]');
      const spanHidden = bubble.querySelector('span.visually-hidden');

      if (spanVisible) spanVisible.textContent = itemCount;
      if (spanHidden) spanHidden.textContent = `${itemCount} items`;

      bubble.style.display = itemCount > 0 ? 'inline-block' : 'none';
      console.debug('[Cart Bubble] Updated existing .cart-count-bubble');
    }

    // Hide bubble if no items and it existed
    if (itemCount === 0 && bubble) {
      bubble.remove();
      console.debug('[Cart Bubble] Removed .cart-count-bubble (itemCount = 0)');
    }

  } catch (err) {
    console.error('[Cart Bubble] Failed to inject/update:', err);
  }
}
window.bindCartDrawerQuantityButtons = function () {
  document.querySelectorAll('quantity-input .quantity__button').forEach((button) => {
    button.addEventListener('click', async (event) => {
      const container = button.closest('quantity-input');
      const input = container.querySelector('input.quantity__input');
      const variantId = parseInt(input.getAttribute('data-quantity-variant-id'), 10);
      const current = parseInt(input.value, 10);
      const step = parseInt(input.getAttribute('step') || '1', 10);
      const min = parseInt(input.getAttribute('min') || '1', 10);

      let newQty = current;
      if (button.name === 'plus') newQty = current + step;
      if (button.name === 'minus') newQty = Math.max(min, current - step);

      try {
        // Use your update logic (this works across themes)
        await window.cartService.updateProductToCart(variantId, newQty);

        // ✅ Refresh the DOM so price/totals/discounts update
        if (typeof window.reloadCartDrawer === 'function') {
          // await window.reloadCartDrawer();
        }
      } catch (err) {
        console.error('Cart quantity update failed:', err);
      }
    });
  });
};


window.reloadCartDrawer = async function reloadCartDrawer() {
  try {
    const res = await fetch('/cart?sections=cart-drawer');
    const data = await res.json();

    const tempContainer = document.createElement('div');
    tempContainer.innerHTML = data['cart-drawer']; // DOM from Shopify response

    const newInner = tempContainer.querySelector('.drawer__inner');
    const drawer = document.querySelector('cart-drawer, .cart-drawer, .drawer');

    if (!drawer || !newInner) return;

    const currentInner = drawer.querySelector('.drawer__inner');

    if (currentInner) {
      const clone = currentInner.cloneNode(false);
      currentInner.replaceWith(clone);
      clone.innerHTML = newInner.innerHTML;
      toggleCartDrawerQuantityInteractivity();
    } else {
      drawer.appendChild(newInner);
    }

    // Remove 'is-empty' if items exist
    if (drawer.querySelector('.cart-item')) {
      drawer.classList.remove('is-empty');
    }

    // Trigger optional header bubble update
    if (typeof window.updateCartBubbleFromCartJS === 'function') {
      window.updateCartBubbleFromCartJS();
    }

    //console.log('[Cart] Drawer refreshed');
  } catch (err) {
    console.error('[Cart] Drawer refresh failed', err);
  }
}
async function getLineNumberForVariant(variantId) {
  const res = await fetch('/cart.js');
  const cart = await res.json();
  const index = cart.items.findIndex(item => item.variant_id === parseInt(variantId, 10));
  return index >= 0 ? index + 1 : null;
}
function toggleCartDrawerQuantityInteractivity() {
  const topProductEmbed = document.getElementById('top-product-embed');
  const isTopProductVisible = topProductEmbed && window.getComputedStyle(topProductEmbed).display === 'block';

  const quantityInputs = document.querySelectorAll('.cart-item__quantity-wrapper input.quantity__input');
  const quantityButtons = document.querySelectorAll('.cart-item__quantity-wrapper button.quantity__button');

  quantityInputs.forEach(input => {
    input.readOnly = isTopProductVisible;
    input.style.pointerEvents = isTopProductVisible ? 'none' : 'auto';
    input.style.opacity = isTopProductVisible ? '0.6' : '1';
    input.disabled = isTopProductVisible;
  });

  quantityButtons.forEach(button => {
    button.disabled = isTopProductVisible;
    button.style.cursor = isTopProductVisible ? 'not-allowed' : 'pointer';
    button.setAttribute('aria-disabled', isTopProductVisible);
  });
}
if (!window._topProductDisplayObserverInitialized) {
  const topProductDisplayObserver = new MutationObserver(() => {
    toggleCartDrawerQuantityInteractivity();
  });

  const topProductEmbedWatchInterval = setInterval(() => {
    const target = document.getElementById('top-product-embed');
    if (target) {
      topProductDisplayObserver.observe(target, {
        attributes: true,
        attributeFilter: ['style'],
        childList: false,
        subtree: false,
      });
      toggleCartDrawerQuantityInteractivity();
      clearInterval(topProductEmbedWatchInterval);
    }
  }, 50);

  window._topProductDisplayObserverInitialized = true;
}


// Cart Service
if (!window.cartService) {  
     //const isCartPage = window.location.pathname.includes('/cart');
    // if (!isCartPage && !isDrawerOpen && !isParallaxDrawerOpen) return;
  window.cartService = {
    addProductToCart: async function(variantId, quantity, properties = {}) {

      try {
        // injectUpdatedCartBubble();
        // await  forceInjectCartBubble();

        console.debug('Adding variant to cart:', variantId, 'Quantity:', quantity);
        const activeThemeName = Shopify?.theme?.schema_name?.trim() || 'default';
        console.log('activeThemeName', activeThemeName);
        const themeSectionMap = {
          "Be Yours": ['cart-drawer', 'header'],
        };
        console.log("themeSectionMap",themeSectionMap);
        const cartSectionId = themeSectionMap[activeThemeName][0];
        const cartHeaderId = themeSectionMap[activeThemeName][1]
        const response = await fetch('/cart/add.js', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            items: [{
              id: variantId,
              quantity: quantity,
              properties: properties
            }],
            sections: [cartSectionId, cartHeaderId]
          })
        });

        if (!response.ok) {
          const errorData = await response.json();
          console.error('Error response:', errorData);
          throw new Error(`HTTP error! status: ${response.status}, message: ${JSON.stringify(errorData)}`);
        }
        const result = await response.json();
         bindCartDrawerQuantityButtons();
      } catch (error) {
        console.error('Error adding product to cart:', error);
        alert('Failed to add product to cart. Please try again.');
      }
    
    },
    updateProductToCart: async function (variantId, quantity, properties = {}) {
      // Avoid concurrent updates
      if (!window.updateLocks) window.updateLocks = new Map();
      if (window.updateLocks.get(variantId)) return;
      window.updateLocks.set(variantId, true);
    
      try {
        const cart = await window.cartService.getCart();
        const item = cart.items.find(i => i.variant_id === parseInt(variantId, 10));
       // console.log('item ++++++===>',);
        if (!item || !item.key) {
          throw new Error(`Cart item not found or missing key for variant: ${variantId}`);
        }
        const itemKey = item.key;
        const lineNumber = await getLineNumberForVariant( item.id);
       // console.log('lineNumber ===>', lineNumber);

    
        const activeThemeName = Shopify?.theme?.schema_name?.trim() || 'default';
        const themeSectionMap = {
          "Dawn": ['cart-drawer', 'header'],
          "Be Yours": ['cart-drawer', 'header'],
          "Impulse": ['ajax-cart', 'header'],
          "default": ['cart-drawer', 'header']
        };
        
        const sections = themeSectionMap[activeThemeName] || themeSectionMap['default'];
        
        const requestBody = {
          line: lineNumber,
          quantity,
          properties,
          sections
        };
    
        //console.log("[Cart] Sending update request:", requestBody);
    
        const response = await fetch('/cart/change.js', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(requestBody)
        });
    
        if (!response.ok) {
          const errorData = await response.json();
          console.error('[Cart] Error response:', errorData);
          throw new Error(`Cart update failed: ${JSON.stringify(errorData)}`);
        }
    
        const result = await response.json();
        console.debug('[Cart] Update successful:', result);
    
        // Replace cart drawer inner HTML
        const tempContainer = document.createElement('div');
        tempContainer.innerHTML = (result.sections[sections[0]] || '') + (result.sections[sections[1]] || '');
        const newCartDrawerInner = tempContainer.querySelector('cart-items');
        const currentCartDrawer = document.querySelector('mini-cart');
        const existingInner = currentCartDrawer?.querySelector('cart-items');
    
        if (newCartDrawerInner && existingInner) {
          const safeClone = existingInner.cloneNode(false);
          existingInner.replaceWith(safeClone);
          safeClone.innerHTML = newCartDrawerInner.innerHTML;
        }
    
        // Rebind UI behaviors
       // bindCartDrawerQuantityButtons?.();
        updateCartItemsUpsell?.();
        
        setTimeout(() => {
        const el = document.getElementById('top-quantity-input');
        console.log('top-quantity-input exists?', !!el, el);
        updateTopProductPrice?.();
      }, 200);

    
      } catch (error) {
        console.error('[Cart] updateProductToCart failed:', error);
        showComplementaryToast?.('Failed to update cart. Please try again.', 'error');
      } finally {
        window.updateLocks.delete(variantId);
      }
    }
    ,
    getCart: async function () {
      try {
        const response = await fetch('/cart.js', {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          },
        },
        );
        const cart = await response.json();
       
        
        return cart;
      } catch (error) {
        console.error('Error fetching cart:', error);
        throw error;
      }
    }
  }
}

// Global Variables
if (!window.GlobalVariables) {
  window.GlobalVariables = {};
}


if (!window.GlobalVariables?.isGlobalClickEventAdded) {
  window.GlobalVariables = window.GlobalVariables || {};
  window.GlobalVariables.isGlobalClickEventAdded = true;

  // product page add to cart button event
  document.body.addEventListener('click', async function(event) {
    // Prevent duplicate cart updates from quantity buttons
    if (event.target.closest('.quantity__button')) {
      return;
    }

    const clickedButton = event.target.closest('button');

    if (clickedButton && clickedButton.name === 'add' && clickedButton.type === 'submit') {
      if (window.productPageState?.skipEvent === true) {
        console.debug('Skipping custom logic for hybrid non-logged-in or untagged customers');
        return;
      }

      event.preventDefault();       
      // Disable the button to prevent double clicks
      // if (clickedButton.disabled) return;
      clickedButton.disabled = true;

      try {
        const form = clickedButton.closest('form');
        if (!form) return;

        const variantId = form.querySelector('[name="id"]')?.value || form.querySelector('.product-variant-id')?.value;
        if (!variantId) {
          console.warn('No variantId found!');
          return;
        }

        let quantity = 1;
        const customInput = document.getElementById('product-quantity-input');
        const fallbackInput = document.querySelector('.quantity__input');

        if (customInput) {
          const value = parseInt(customInput.value, 10);
          if (!isNaN(value) && value > 0) {
            quantity = value;
          } else {
            console.warn('[Quantity] Custom input present but invalid value:', customInput.value);
          }
        }

        if (quantity === 1 && fallbackInput) {
          const fallbackValue = parseInt(fallbackInput.value, 10);
          if (!isNaN(fallbackValue) && fallbackValue > 0) {
            quantity = fallbackValue;
          } else {
            console.warn('[Quantity] Fallback input present but invalid value:', fallbackInput.value);
          }
        }

        console.debug('[Quantity] Final resolved value:', quantity);

        if (!window.cartService) {
          console.error('Cart service is not initialized');
          return;
        }

        const cart = await window.cartService.getCart();
        const existingItem = cart.items.find(item => item.variant_id === parseInt(variantId, 10));

        if (existingItem) {
          await window.cartService.updateProductToCart(existingItem.key, existingItem.quantity + quantity, existingItem.properties);
        } else {
          await window.cartService.addProductToCart(variantId, quantity, null);
        }

        openDrawerThenInsertTopSeller(); // ✅ Open drawer first
        injectUpdatedCartBubble();
        updateCartItemsUpsell();

      } catch (error) {
        console.error('Error processing add to cart:', error);
      } finally {
        // Re-enable the button no matter what
        clickedButton.disabled = false;
      }
    } else if (event.target.localName.toLowerCase() === 'input' && event.target.type === 'radio') {
      setTimeout(() => {
        const variantIdMatch = window.location.href.match(/variant=(\d+)/);
        if (variantIdMatch) {
          const variantIdNew = variantIdMatch[1];
          if (window.complementaryProductState?.variantId != variantIdNew) {
            window.complementaryProductState.variantId = variantIdNew;
            window.productPageState.productVariantId = variantIdNew;
            location.reload();
          }
        }
      }, 1000);
    } else if (event.target.tagName === 'SELECT' && event.target.name === 'options[Size]' && event.target.type === 'select-one') {
      setTimeout(() => {
        const variantIdMatch = window.location.href.match(/variant=(\d+)/);
        if (variantIdMatch) {
          const variantIdNew = variantIdMatch[1];
          if (window.complementaryProductState?.variantId != variantIdNew) {
            window.complementaryProductState.variantId = variantIdNew;
            window.productPageState.productVariantId = variantIdNew;
            location.reload();
          }
        }
      }, 1000);
    } else if (event.target.localName.toLowerCase() === 'label') {
      setTimeout(() => {
        const variantIdMatch = window.location.href.match(/variant=(\d+)/);
        if (variantIdMatch) {
          const variantIdNew = variantIdMatch[1];
          if (window.complementaryProductState?.variantId != variantIdNew) {
            window.complementaryProductState.variantId = variantIdNew;
            window.productPageState.productVariantId = variantIdNew;
            location.reload();
          }
        }
      }, 1000);
    }
  });
}


// Volume Pricing Service
if (!window.productPricingService) {
  window.productPricingService = {
    getVolumePricingByProductId: async function(appDomain, shopDomain, apiKey, timestamp, hmac, customerId, productId) {
      try {
        let data = null;
        if (await window.indexDBService.getFromIndexedDb(window.indexDBService.DB_VOLUME_PRICING, productId)) {
          data = await window.indexDBService.getFromIndexedDb(window.indexDBService.DB_VOLUME_PRICING, productId);
        } 
        else {
          //console.log('calling now');
          const response = await fetch(`https://${appDomain}/api/volume-pricing?shop=${shopDomain}&api_key=${apiKey}&timestamp=${timestamp}&hmac=${hmac}&customer=${customerId}&productId=${productId}`);
          data = await response.json();
          window.indexDBService.saveToIndexedDb(productId, data, window.indexDBService.DB_VOLUME_PRICING);
        }
        return data;    
      } catch (error) {
        //console.log('Error fetching volume pricing:', error);
        throw error;
      }
    },
    getVolumePricingByProductVariantId: async function(appDomain, shopDomain, apiKey, timestamp, hmac, customerId, productVariantId) {
      try {
        let data = null;
        if (await window.indexDBService.getFromIndexedDb(window.indexDBService.DB_VOLUME_PRICING, productVariantId)) {
          data = await window.indexDBService.getFromIndexedDb(window.indexDBService.DB_VOLUME_PRICING, productVariantId);
        } 
        else {
          //console.log('calling the volume pricing api here', customerId);
          const response = await fetch(`https://${appDomain}/api/volume-pricing?shop=${shopDomain}&api_key=${apiKey}&timestamp=${timestamp}&hmac=${hmac}&customer=${customerId}&productVariantId=${productVariantId}`);
          data = await response.json();
          window.indexDBService.saveToIndexedDb(productVariantId, data, window.indexDBService.DB_VOLUME_PRICING);
        }
        return data;    
      } catch (error) {
        console.error('Error fetching volume pricing:', error);
        throw error;
      }
    },
    getNormalPricingByProductVariantId: async function(appDomain, shopDomain, apiKey, timestamp, hmac, customerId, productVariantId) {
      try {
        const response = await fetch(`https://${appDomain}/api/normal-pricing?shop=${shopDomain}&productVariantId=${productVariantId}&api_key=${apiKey}&timestamp=${timestamp}&hmac=${hmac}`);    
        const data = await response.json();
        return data;
      } catch (error) {
        console.error('Error fetching normal pricing:', error);
        throw error;
      }
    }
  }
}
// Customer Service
if (!window.customerService) {
  window.customerService = {
    getCustomerTag: async function(appDomain, shopDomain, apiKey, timestamp, hmac, customerId) {
      if (!customerId) {
        return null;
      }
      try { 
        let data = null;
        if (await window.indexDBService.getFromIndexedDb(window.indexDBService.DB_CUSTOMER_TAG, customerId)) {
          data = await window.indexDBService.getFromIndexedDb(window.indexDBService.DB_CUSTOMER_TAG, customerId);
        }
        else {
          const response = await fetch(`https://${appDomain}/api/customer-tag?shop=${shopDomain}&api_key=${apiKey}&timestamp=${timestamp}&hmac=${hmac}&customer=${customerId}`);
          data = await response.json();
          window.indexDBService.saveToIndexedDb(customerId, data, window.indexDBService.DB_CUSTOMER_TAG);
        }
        return data;
      } catch (error) {
        console.error('Error fetching customer tag:', error);
        return null;
      }
    }
  }
}

// Product Page State
if (!window.productPageState) {
  window.productPageState = {
    productQuantityInput: null,
    productMinusButton: null,
    productPlusButton: null,
    productPriceElement: null,
    productQuantityElement: null,
    customerId: null,
    productId: null,
    productVariantId: null,
    shop: null,
    productVolumePricing: null,
    minMaxIncrementElement: null,
    discountTableElement: null,
    original: {
      productOriginalPriceElement: null,
      productOriginalQuantityElement: null,
      productOriginalQuantityInput: null,  
      productOriginalCartButtons: null,
      productOriginalAddToCartButton: null,
    },
    new: {}
  };
}

// Complementary Product State
if (!window.complementaryProductState) {
  window.complementaryProductState = {
    customerId: null,
    productId: null,
    variantId: null,
    shop: null,
    complementaryVolumePricing: null,
    complementaryProduct: null,
    complementaryProductElement: {
      addToCartComplementaryProduct: null,
      learnMoreComplementaryProduct: null,
      complementaryProductBlock: null,
      complementaryProductToast: null,
      complementaryProductLoginButtons: null,
      complementaryProductImage: null,
      complementaryProductTitle: null,
      complementaryProductPrice: null,
      complementaryProductDescription: null,
      complementaryQuantityInput: null,
      complementaryQuantityMinus: null,
      complementaryQuantityPlus: null,
      complementaryProductHeader: null,
    },
  };
}

// Login Register Service
if (!window.loginRegisterService) {
  window.loginRegisterService = {
    generateLoginRegisterButtons: function() {
      return `
        <div id='complementary-product-login-buttons' style="display: block; font-family: Arial, sans-serif; text-align: center;">
          <button onclick="window.location.href='/account/login'" style="background-color: #000; color: #fff; border: none; padding: 10px 20px; font-size: 14px; font-weight: bold; width: 100%; cursor: pointer; margin-bottom: 10px;">
            Login to place order
          </button>
          <a id="complementary-product-register-button" href="/pages/wholesale-registration" style="color: #000; text-decoration: none; font-size: 12px;">
            Register for wholesale access
          </a>
        </div>
      `;
    },
    createLoginRegisterButtons: function() {
      const element = this.generateLoginRegisterButtons();
      const complement = window.complementaryProductState.complementaryProductElement;
      complement.complementaryProductBlock = document.getElementById('complementary-product-block');
      complement.complementaryProductBlock.innerHTML = element;
      complement.complementaryProductLoginButtons = document.getElementById('complementary-product-login-buttons');
      complement.complementaryProductRegisterButton = document.getElementById('complementary-product-register-button');
    }
  }
}

// Product Page Service
if (!window.productPageService && /^\/products\/[^\/]+/.test(window.location.pathname)) {
  window.productPageService = {
    createProductPageCustomPricing: function() {
      if (!window.productPageState.productOriginalFlag) {
        // Remove old quantity input if present
        const oldQuantityElement = document.querySelector('.quantity-controls');
        if (oldQuantityElement) {
          oldQuantityElement.style.display = 'none';
        }
        // Only insert if custom quantity selector doesn't exist yet
        if (!document.getElementById('product-quantity-input-block')) {
          const qtyElement = `
            <div id="product-quantity-input-block" style="display: flex; align-items: center; border: 1px solid #ccc; border-radius: 4px; width: fit-content;">
              <button id="product-quantity-minus" style="width: 40px; height: 40px; background: none; border: none; border-right: 1px solid #ccc;color:#000; font-size: 16px; cursor: pointer;">−</button>
              <input id="product-quantity-input" style="width: 40px; height: 40px; border: none; font-size: 16px; text-align: center;" value="1" readonly>
              <button id="product-quantity-plus" style="width: 40px; height: 40px; background: none; border: none; border-left: 1px solid #ccc;color:#000; font-size: 16px; cursor: pointer;">+</button>
            </div>
          `;


          const insertAfterElement = document.querySelector('.form') || document.querySelector('.product-page--submit-action');
          if (insertAfterElement) {
            insertAfterElement.insertAdjacentHTML('beforebegin', qtyElement);
            console.log('Inserted custom quantity selector');
          } else {
            console.error('No suitable insert element found');
          }
        } else {
          console.log('Custom quantity selector already exists, skipping insert.');
        }



        // window.productPageState.original.productOriginalQuantityElement.insertAdjacentHTML('afterend', qtyElement);
        window.productPageState.new = window.productPageState.new || {};
        window.productPageState.new.productQuantityMinus = document.getElementById('product-quantity-minus');
        window.productPageState.new.productQuantityPlus = document.getElementById('product-quantity-plus');
        window.productPageState.new.productQuantityInput = document.getElementById('product-quantity-input');
        window.productPageState.new.productQuantityElement = document.getElementById('product-quantity-input-block');

        window.productPageState.new.productQuantityInput.value = 1;
        if (window.productPageState.original.productOriginalQuantityInput) {
          window.productPageState.original.productOriginalQuantityInput.value = 1;
        }        
        window.productPageState.productOriginalFlag = true;
  
        const priceElement = `
          <span id="product-loading-spinner" class="loading-spinner"></span>
          <p id="product-price" style="display: none; margin: 0 0 10px;"></p>
        `;
        
        const originalPriceElement = window?.productPageState?.original?.productOriginalPriceElement;
        if (originalPriceElement) {
          originalPriceElement.insertAdjacentHTML('afterend', priceElement);


          window.productPageState.new = window.productPageState.new || {};
          window.productPageState.new.productPriceElement = document.getElementById('product-price');
          window.productPageState.new.productLoadingSpinner = document.getElementById('product-loading-spinner');
        }
        window.productPageState.new.productPriceElement = document.getElementById('product-price');
        window.productPageState.new.productLoadingSpinner = document.getElementById('product-loading-spinner');
      }
    },
    hideProductPageElements: function() {
      // window.productPageState.original.productOriginalPriceElement.style.display = 'none';
      if(window.productPageState.original.productOriginalQuantityElement){
        // window.productPageState.original.productOriginalQuantityElement.style.display = 'none';
        }
    }
  }
}

// Complementary Product Service
if (!window.complementaryProductService) {
  window.complementaryProductService = {
    getComplementaryProduct: async function(appDomain, shopDomain, apiKey, timestamp, hmac, productId, variantId) {
      try { 
        let data = null;
        if (await window.indexDBService.getFromIndexedDb(window.indexDBService.DB_COMPLEMENTARY_PRODUCTS, variantId)) {

            data = await window.indexDBService.getFromIndexedDb(window.indexDBService.DB_COMPLEMENTARY_PRODUCTS, variantId);
        } 
        else {
          const response = await fetch(`https://${appDomain}/api/complementary-products?shop=${shopDomain}&productId=${productId}&variantId=${variantId}&api_key=${apiKey}&timestamp=${timestamp}&hmac=${hmac}`);
          data = await response.json();
          window.indexDBService.saveToIndexedDb(variantId, data, window.indexDBService.DB_COMPLEMENTARY_PRODUCTS);
        }
        return data;    
      } catch (error) {
        console.error('Error fetching complementary product:', error);
        throw error;
      }
    },
    generateComplementaryProductPopup: function() {
      return `
      <div class="popup-content">
        <span class="close">&times;</span>
        <div class="popup-grid">
          <div class="popup-left">
            <img id="complementary-popup-product-image" alt="Complementary Product">
          </div>
          <div class="popup-right">
            <h3 id="complementary-popup-product-title"></h3>
            <div class="price-container">
              <span class="discount-price" id="complementary-popup-product-discount-price"></span>
              <span class="msrp-price" id="complementary-popup-product-msrp-price"></span>
            </div>
            
            <table class="volume-pricing-table" style="width: 100%; border-collapse: collapse; margin-top: 10px; border-radius: 8px; overflow: hidden; border: 1px solid #ddd;">
              <thead>
                <tr>
                  <th>Quantity</th>
                  <th>Price</th>
                  <th>Discount</th>
                </tr>
              </thead>
              <tbody id="volume-pricing-tbody">
                <!-- Table rows will be populated dynamically -->
              </tbody>
            </table>
  
            <div class="quantity-selector">
              <button class="quantity-btn minus" id="complementary-popup-quantity-minus">-</button>
              <input class="quantity-input" id="complementary-popup-quantity-input" readonly>
              <button class="quantity-btn plus" id="complementary-popup-quantity-plus">+</button>
            </div>
            
            <div class="quantity-limits" id="complementary-popup-quantity-limits">
              Min • Max • Increments of
            </div>
  
            <button class="add-to-cart-btn">Add</button>
          </div>
        </div>
        <div class="product-description">
          <div class="tooltip">
            <p id="complementary-popup-product-description" style="color: #000; margin-bottom: 20px; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; text-overflow: ellipsis; line-height: 1.4;">
            </p>
            <span id="complementary-popup-product-description-tooltip" class="tooltiptext"></span>
          </div>
        </div>
      </div>
    `;
    },
    generateComplementaryProductBlock: function() {
      return `
      <div id="complementary-product-block-ui" style="display: none; font-family: Arial, sans-serif; border: 1px solid #ccc; padding: 16px; border-radius: 8px;">
        <h2 id="complementary-product-header" style="margin-top: 0; margin-bottom: 16px; font-weight: bold;">Frequently bought together:</h2>
        <p id="complementary-product-subheader"></p>
        <div style="display: flex; align-items: center; margin-bottom: 16px;">
          <img id="complementary-product-image" style="display: none; width: 60px; height: 60px; background-color: #f0f0f0; justify-content: center; align-items: center; margin-right: 16px;">
          <div>
            <h4 id="complementary-product-title" style="margin: 0; font-size: 1.2em; font-weight: bold;">
              <span id="complementary-loading-spinner" class="loading-spinner"></span>
            </h4>
            <p id="complementary-product-price" style="display: none; margin: 4px 0 0; font-size: 15px;"></p>
          </div>
        </div>
        <div style="display: flex; align-items: center; margin-bottom: 16px;">
          <div id="complementary-quantity-input-group" style="display: none; border: 1px solid #ccc; border-radius: 4px; width: fit-content; margin-right: 16px;">
            <button id="complementary-quantity-minus" style="width: 40px; height: 40px; background: none; border: none; border-right: 1px solid #ccc; font-size: 16px; cursor: pointer;">−</button>
            <input id="complementary-quantity-input" style="width: 40px; height: 40px; border: none; font-size: 16px; text-align: center;" value="1" readonly>
            <button id="complementary-quantity-plus" style="width: 40px; height: 40px; background: none; border: none; border-left: 1px solid #ccc; font-size: 16px; cursor: pointer;">+</button>
          </div>
          <p class="tooltip">
            <p id="complementary-product-description" style="color: #000; margin-bottom: 20px; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; text-overflow: ellipsis; line-height: 1.4;">
            </p>
            <span id="complementary-product-description-tooltip" class="tooltiptext"></span>
          </p>
        </div>
        <p id="complementary-volume-quantities" style="margin: 5px; font-size: 12px; color: #666;"></p>
        <button id="add-complementary-product" style="display: none; width: 100%; padding: 10px; background-color: #000; color: #fff; border: none; border-radius: 4px; font-size: 14px; cursor: pointer; margin-bottom: 8px;">Add to cart</button>
        <button id="learn-more-complementary-product" style="width: 100%; background: none; border: none; color: #666; text-decoration: none; font-size: 14px; cursor: pointer;">Learn more ></button>
      </div>
      `;
    }
  }


}

if (!window.topSellerPopupService) {
  window.topSellerPopupService = {
    generateTopSellerPopup: function() {
      return `
        <div class="topseller-popup-content">
          <div style="padding: 20px; height: 100%; display: flex; flex-direction: column;">
            <button id="close-top-seller-popup" style="background: none; border: none; font-size: 32px; cursor: pointer; position: absolute; top: 10px; right: 15px; color: #333; z-index: 10;" aria-label="Close">&times;</button>
            
            <div style="flex-grow: 1; overflow-y: auto; scrollbar-width: none; -ms-overflow-style: none;">
              <h2 id="cp-ts-header-text" style="font-weight: bold; margin-bottom: 10px;"></h2>
              <p id="cp-ts-selling-point" style="color: black; margin-bottom: 20px;"></p>
              
              <div style="margin-bottom: 20px;">
                <div style="display: flex; justify-content: center; align-items: center; margin-bottom: 20px;">
                  <span id="cp-ts-loading-spinner" class="loading-spinner"></span>
                  <img style="display: none; max-width: 100%; height: auto;" id="cp-ts-product-image" src="">
                </div>
                
                <a href="#" id="cp-ts-product-title" style="display: block; font-weight: bold; margin-bottom: 10px; color: #000; text-decoration: none;"></a>
                
                <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 15px;">
                  <p id="cp-ts-product-wholesale-price" style="font-size: 1.2em; font-weight: bold; margin: 0;"></p>
                  <p id="cp-ts-product-original-price" style="font-size: 0.8em; color: #666; margin: 0;"></p>
                </div>
  
                <div class="tooltip">
                  <p id="cp-ts-product-description" style="color: #000; margin-bottom: 20px; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; text-overflow: ellipsis; line-height: 1.4;"></p>
                  <span id="cp-ts-product-description-tooltip" class="tooltiptext"></span>
                </div>
              </div>
            </div>
  
            <div style="padding: 20px; border-top: 1px solid #eee; background: white;">
              <div style="display: flex; align-items: center; margin-bottom: 15px;">
                <div style="display: flex; align-items: center; border: 1px solid #dcdcdc; margin-right: 10px;">
                  <button id="cp-ts-minus" style="width: 40px; height: 40px; background: none; border: none; font-size: 16px; cursor: pointer;">−</button>
                  <input id="cp-ts-quantity-input" style="width: 40px; height: 40px; border: none; border-left: 1px solid #dcdcdc; border-right: 1px solid #dcdcdc; font-size: 16px; text-align: center;" value="1" readonly>
                  <button id="cp-ts-plus" style="width: 40px; height: 40px; background: none; border: none; font-size: 16px; cursor: pointer;">+</button>
                </div>
                <p id="cp-ts-quantity-info" style="font-size: 14px; color: #666; margin: 0;"></p>
              </div>
  
              <button id="cp-ts-add-to-cart" style="background-color: #000; color: white; border: none; padding: 15px; width: 100%; font-size: 16px; cursor: pointer; margin-bottom: 10px;">Add</button>
              <button id="close-top-seller-nothanks" style="background: none; border: none; color: #666; cursor: pointer; width: 100%;">No thank you</button>
            </div>
          </div>
        </div>
      `;
    },
    createTopSellerPopup: function() {
      const popupDiv = document.createElement('div');
      popupDiv.id = 'top-seller-popup';
      popupDiv.className = 'popup';
      popupDiv.style.display = 'none';
      popupDiv.style.justifyContent = 'center';
      popupDiv.style.alignItems = 'center';
      
      popupDiv.innerHTML = window.topSellerPopupService.generateTopSellerPopup();
  
      const cartDrawer = document.querySelector('mini-cart, cart-drawer, .cart-drawer, .global-drawer, .drawer');
      if (cartDrawer) {
        cartDrawer.appendChild(popupDiv); // Attach inside drawer so it doesn’t trigger drawer-close
        console.debug('[Top Seller Patch] Popup attached inside cart drawer');
      } else {
        document.body.appendChild(popupDiv); // Fallback if drawer not found
      }
      // Close button functionality
      const closeBtn = popupDiv.querySelector('#close-top-seller-popup');
      const nothanksBtn = popupDiv.querySelector('#close-top-seller-nothanks');
  
      closeBtn.onclick = function() {
        popupDiv.style.display = 'none';
        unlockScroll();
      };
  
      nothanksBtn.onclick = function() {
        popupDiv.style.display = 'none';
        unlockScroll();
      };    
  
      // Close when clicking outside the popup
      window.onclick = function(event) {
        if (event.target === popupDiv) {
          popupDiv.style.display = 'none';
          unlockScroll();
        }
      };
  
      return popupDiv;
    }
  }
}

function unlockScroll() {
  document.body.style.overflow = '';
}

function wholesalerRegistrationForm() {
  return `
      <h2>Wholesale Registration Form</h2>
      <label for="companyName">Company Name</label>
      <input type="text" id="companyName" name="companyName" required>
      
      <label for="companyAddress">Company Address</label>
      <input type="text" id="companyAddress" name="companyAddress" required>
      
      <label for="contactFirstName">Contact First Name</label>
      <input type="text" id="contactFirstName" name="contactFirstName" required>
      
      <label for="contactLastName">Contact Last Name</label>
      <input type="text" id="contactLastName" name="contactLastName" required>
      
      <label for="emailAddress">Email Address</label>
      <input type="email" id="emailAddress" name="emailAddress" required>
      
      <label for="phoneNumber">Phone Number</label>
      <input type="tel" id="phoneNumber" name="phoneNumber" placeholder="123-456-7890" required>
      
      <label for="buyerType">Buyer Type</label>
      <select id="buyerType" name="buyerType" required>
        <option value="Retailer">Retailer</option>
        <option value="Wholesaler">Wholesaler</option>
        <option value="Distributor">Distributor</option>
      </select>
      
      <label for="locationsOwned">Locations Owned/Serviced</label>
      <input type="number" id="locationsOwned" name="locationsOwned" min="1" required>
      
      <button type="submit" style="background-color: #000; color: #fff; border: none; padding: 10px 20px; font-size: 14px; font-weight: bold; width: 100%; cursor: pointer; margin-bottom: 10px;">Save</button>
      <button type="button" id="closePopup" style="background-color: #fff; color: #000; border: none; padding: 10px 20px; font-size: 14px; font-weight: bold; width: 100%; cursor: pointer; margin-bottom: 10px;">Close</button>
    `;
}

function savingsButtonCssText() {
  return 'background: #000; color: white; padding: 15px; border-radius: 4px; font-weight: bold; margin-top: 8px; display: block; text-align: center; width: 100%; border: none; cursor: pointer;';
}

function topProductExtractVariantIdFromGid(gid) {
  const parts = gid.split('/');
  return parts[parts.length - 1];
}

function generateTopProductPriceElement(priceInfo){
 return `
        <div style="display: block; justify-content: space-between; align-items: center;">
          <span style="font-size: 0.8em; color: #666; text-decoration: line-through;">${priceInfo.currencySymbol}${priceInfo.originalPrice}</span>
          <span style="font-size: 1.2em; font-weight: bold; color: #000;">${priceInfo.currencySymbol}${priceInfo.price}</span>
        </div>
      `;
}

function generateTopSellerBlock() {
  return `
      <div id="topseller-product-block" style="padding: 10px; position: relative; background-color: #f8faf9;">        
        <div style="font-weight: bold; color: black; padding: 8px; text-align: start; margin-bottom: 15px;">
          <h2 id="top-seller-title" style="margin: 0; color: black; font-weight: bold;"></h2>
        </div>
        <div id="top-product-details" style="display: flex; align-items: center; gap: 15px; margin-bottom: 15px;">
          <a href="#" id="top-product-image-container" style="width: 60px; height: 60px; position: relative; flex-shrink: 0;">
            <div id="animated-placeholder" style="width: 100%; height: 100%; position: absolute; background: linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%); background-size: 200% 100%; animation: loading 1.5s infinite;"></div>
            <img id="top-product-image" src="" alt="Top Seller Product" style="max-width: 100%; max-height: 100%; position: absolute; top: 0; left: 0; opacity: 0; transition: opacity 0.3s ease;">
          </a>
          <div style="flex-grow: 1;">
            <h3 id="top-product-title" style="font-weight: 500; margin: 0 0 5px; font-size: 16px;">Loading...</h3>
            <p id="top-product-price" style="margin: 0; font-size: 16px;">Loading...</p>
          </div>
          <div id="top-quantity-input-group" style="border: 1px solid #ddd; border-radius: 4px; display: flex; align-items: center;">
            <button id="top-quantity-minus" style="width: 32px; height: 32px; background: none; border: none; border-right: 1px solid #ddd; font-size: 16px; cursor: pointer; padding: 0;">−</button>
            <input id="top-quantity-input" style="width: 32px; height: 32px; border: none; font-size: 16px; text-align: center; padding: 0;" value="1" readonly>
            <button id="top-quantity-plus" style="width: 32px; height: 32px; background: none; border: none; border-left: 1px solid #ddd; font-size: 16px; cursor: pointer; padding: 0;">+</button>
          </div>
        </div>  
        <div style="display: flex; flex-direction: column; align-items: center; gap: 10px;">
          <button id="add-top-product" style="width: 50%; padding: 12px 24px; background: black; color: white; border: none; border-radius: 4px; font-size: 16px; cursor: pointer;">Add</button>
        </div>
      </div>
    `;
}

function fixDecimals(input) {
  // If input is string, convert to number first
  const num = typeof input === 'string' ? Number(input) : input;
  // Convert to string with exactly 2 decimal places
  return num.toFixed(2).toString();
}


//Top product embed utils
window.topProductEmbedUtils = {
  addTopSellerToCart: async function(variantId, quantity) {
    try {
      // Fetch current cart
      const cart = await window.cartService.getCart();
     
      // Check if item already exists in cart
      const existingItem = cart.items.find(item => item.variant_id === parseInt(variantId));
      
      if (existingItem) {
        // Update existing line item
        const lineItemKey = existingItem.key;
        const existingQty  = existingItem.quantity;
       const updatedQty = existingQty + quantity;
       
       console.debug('[AddMoreSaveMore] Updating existing item:', {
        variantId,
        lineItemKey,
        existingQty,
        addQty: quantity,
        newQty: updatedQty
      });

      await window.cartService.updateProductToCart(lineItemKey, updatedQty, {
        _isUpsellOrigin: existingItem.properties?._isUpsellOrigin || true,
        _upsellQuantity: parseInt(existingItem.properties?._upsellQuantity || 0) + quantity
      });
        
      }else {
        // Item not in cart – add fresh
        console.debug('[AddMoreSaveMore] Adding new item to cart:', {
          variantId,
          quantity
        });
  
        await window.cartService.addProductToCart(variantId, quantity, {
          _isUpsellOrigin: true,
          _upsellQuantity: quantity
        });
      }   
        // After cart update, rebind + refresh UI
    setTimeout(() => {
     // window.bindCartDrawerQuantityButtons?.();
      window.updateCartItemsUpsell?.();
      window.updateTopProductPrice?.();
    }, 300);
      
    } catch (error) {
      console.error('Error adding/updating complementary product in cart:', error);
     // showComplementaryToast('Failed to add complementary product to cart. Please try again.', 'error');
    }
  },
  disableCartButtons: function() {
    const quantityButtons = document.querySelectorAll('.quantity__button');
    const savingsBadges = document.querySelectorAll('.savings-badge');
    quantityButtons.forEach(button => {
      button.disabled = true;
      button.style.cursor = 'not-allowed';
    });
    savingsBadges.forEach(badge => {
      badge.disabled = true;
      badge.style.cursor = 'not-allowed';
    });
  },
  findCartDrawer: function() {
    // Initialize the list of possible cart drawer selectors

    const cartDrawerSelectors = [
      ".portalspere__cart__drawer",
      // Dawn theme and Dawn-based themes
      'cart-drawer',
      '#cart-drawer',
      
      // Drawer ID-based selectors (common across many themes)
      '#CartDrawer',
      '#cart-drawer-container',
      '#drawer-cart',
      '#mini-cart',
      '#sidebar-cart',
      '#cart-sidebar',
      '#slideout-cart',
      
      // Class-based selectors (wide coverage across themes)
      '.cart-drawer',
      '.drawer--right[data-drawer-cart]',
      '.drawer--slideout',
      '.ajax-cart',
      '.mini-cart',
      '.mini-cart-container',
      '.cart-sidebar',
      '.cart-toggle',
      '.cart-popup-wrapper',
      '.cart-popup',
      '.drawer__inner--cart',
      '.offcanvas-cart',
      
      // Specific premium theme selectors
      '.cart-drawer__content', // Warehouse theme
      '.cart-flyout', // Streamline theme
      '.minicart-wrapper', // Canopy theme
      '.cart-offcanvas', // Focal theme
      '.side-cart', // Venue theme
      '.cart-slider', // Parallax theme
      '.cart-dropdown', // Brooklyn theme
      '.off-canvas-cart', // Expanse theme
      
      // Shopify Section selectors
      '[data-section-type="cart-drawer"]',
      '[data-section-id*="cart-drawer"]',
      '[data-section-type="ajax-cart"]',
      '[data-section-type="mini-cart"]',
      
      // Data attribute selectors (common in newer themes)
      '[data-cart-drawer]',
      '[data-mini-cart]',
      '[data-ajax-cart-drawer]',
      '[data-drawer="cart"]',
      
      // AJAX cart containers (older themes)
      '#ajaxifyCart',
      '#CartContainer',
      '.ajaxcart',
      '.ajaxcart__drawer',
      
      // Right drawer selectors that might contain cart
      '.drawer--right',
      '.drawer[data-drawer-right]',
      
      // Modal-based cart drawers
      '.cart-modal',
      '.modal--cart',
      '[data-cart-modal]',
      
      // Common third-party app selectors
      '.bc-cart-drawer',
      '.bold-cart-drawer',
      '.sca-cart-drawer',
      '.shogun-cart-drawer',

      // Right drawer selectors that might contain cart Parallax theme
      '.mm-menu_position-front'
    ];

    // Try to find the cart drawer using the list of selectors
    let cartDrawer = null;

    for (const selector of cartDrawerSelectors) {
      const element = document.querySelector(selector);
      if (element) {
        cartDrawer = element;
        console.log(`Cart drawer found using selector: ${selector}`);
        break;
      }
    }

    return cartDrawer;
  },

  findCartDrawerInner: function() {
    const cartDrawerSelectors = [
      ".portalspere__cart__drawer__inner",
      ".drawer__inner",
      ".mini-cart__inner",
      ".mm-panels",
    ];
    
    // Try to find the cart drawer using the list of selectors
    let cartDrawerInner = null;
    
    for (const selector of cartDrawerSelectors) {
      const element = document.querySelector(selector);
      if (element) {
        cartDrawerInner = element;
        console.log(`Cart drawer found using selector: ${selector}`);
        break;
      }
    }
    return cartDrawerInner;
  },
  
  findCartDrawerFooter: function() {
    const cartDrawerSelectors = [
      ".portalspere__cart__drawer__footer",
      ".drawer__footer",
      ".mini-cart__recap",
    ];
    
    let cartDrawerInner = null;
    
    for (const selector of cartDrawerSelectors) {
      const element = document.querySelector(selector);
      if (element) {
        cartDrawerInner = element;
        console.log(`Cart drawer found using selector: ${selector}`);
        break;
      }
    }
              
    return cartDrawerInner;
  }
};
async function initializeProductState() {
  return new Promise((resolve) => {
    // Initialize global state objects
    window.productPageState = window.productPageState || {};
    window.productPageState.original = window.productPageState.original || {};

    // === NEW THEME DIRECT SELECTORS ===
    const quantityWrapper = document.querySelector('.quantity-controls__outer');
    const quantityInput = document.querySelector('.quantity-selector');
    const qtyPlusBtn = document.querySelector('#product-quantity-plus');
    const qtyMinusBtn = document.querySelector('#product-quantity-minus');
    const priceElement = document.querySelector('#price-field .money');
    const addToCartBtn = document.querySelector('button#purchase.secondary-button[name="add"]');
    if (priceElement) {
      priceElement.style.display = 'none'; 
      window.productPageState.original.productOriginalPriceElement = priceElement;
    }

    // === Save Elements to State ===
    if (quantityWrapper) window.productPageState.original.productOriginalQuantityElement = quantityWrapper;
    if (quantityInput) window.productPageState.original.productOriginalQuantityInput = quantityInput;
    if (qtyPlusBtn) window.productPageState.productPlusButton = qtyPlusBtn;
    if (qtyMinusBtn) window.productPageState.productMinusButton = qtyMinusBtn;
    if (priceElement) window.productPageState.original.productOriginalPriceElement = priceElement;
    if (addToCartBtn) window.productPageState.original.productOriginalAddToCartButton = addToCartBtn;

    // === Quantity Change Handlers ===
    const config = window.productPageState.quantityConfig || { min: 1, max: 9999, step: 1 };
    const getQty = () => parseInt(quantityInput?.value || '1', 10) || config.min;

    if (qtyPlusBtn && quantityInput) {
      qtyPlusBtn.addEventListener('click', () => {
        let val = getQty();
        val = Math.min(val + config.step, config.max);
        quantityInput.value = val;
      });
    }

    if (qtyMinusBtn && quantityInput) {
      qtyMinusBtn.addEventListener('click', () => {
        let val = getQty();
        val = Math.max(config.min, val - config.step);
        quantityInput.value = val;
      });
    }

    // === Optional: Add fallback selectors for theme compatibility ===
    const fallbackSelectors = {
      quantityInputs: ['input[name="quantity"]', 'input.quantity', '.quantity__input'],
      priceElements: ['.product-price', '.price-item--regular'],
      addToCart: ['button[name="add"]', '.product-form__cart-submit']
    };

    if (!window.productPageState.original.productOriginalQuantityInput) {
      for (const sel of fallbackSelectors.quantityInputs) {
        const input = document.querySelector(sel);
        if (input) {
          window.productPageState.original.productOriginalQuantityInput = input;
          break;
        }
      }
    }

    if (!window.productPageState.original.productOriginalPriceElement) {
      for (const sel of fallbackSelectors.priceElements) {
        const price = document.querySelector(sel);
        if (price) {
          window.productPageState.original.productOriginalPriceElement = price;
          break;
        }
      }
    }

    if (!window.productPageState.original.productOriginalAddToCartButton) {
      for (const sel of fallbackSelectors.addToCart) {
        const btn = document.querySelector(sel);
        if (btn) {
          window.productPageState.original.productOriginalAddToCartButton = btn;
          break;
        }
      }
    }

    resolve();
  });
}

function waitForQuantityInput() {
  const existing = document.getElementById('product-quantity-input');
  window.productPageState = window.productPageState || {};
  window.productPageState.original = window.productPageState.original || {};
  if (existing) {
    window.productPageState.original.productOriginalQuantityInput = existing;
    console.debug('[Observer] Found #product-quantity-input early, assigned immediately.');
    return;
  }

  const observer = new MutationObserver((mutations, obs) => {
    const injectedInput = document.getElementById('product-quantity-input');
    if (injectedInput) {
      window.productPageState.original.productOriginalQuantityInput = injectedInput;
      console.debug('[Observer] #product-quantity-input injected later, assigned.');
      obs.disconnect(); // ✅ stop observing once found
    }
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true
  });
}

document.addEventListener('DOMContentLoaded', async function() {  
  initializeProductState();
  waitForQuantityInput();
 // Variant switch fix for themes not updating URL (e.g., Symmetry, Motion-Cal)
 let lastVariantId = document.querySelector('[name="id"]')?.value;
 setInterval(() => {
   const currentVariantId = document.querySelector('[name="id"]')?.value;
   if (currentVariantId && currentVariantId !== lastVariantId) {
     console.debug('Detected variant switch:', currentVariantId);
     lastVariantId = currentVariantId;
     window.complementaryProductState.variantId = currentVariantId;
     window.productPageState.productVariantId = currentVariantId;
     location.reload(); // reload to trigger custom pricing logic
   }
 }, 500); // check every 0.5 seconds
 toggleCartDrawerQuantityInteractivity();
});

if (window.location.pathname.includes('/cart') || document.querySelector('.cart-drawer, #cart-drawer') || document.querySelector('.side-cart-position--right') || document.querySelector('.mm-menu_position-front')) {
  document.addEventListener('DOMContentLoaded', () => {
    const cartDrawerInner = window.topProductEmbedUtils.findCartDrawerInner();
    const existingBlocks = cartDrawerInner?.querySelectorAll('#topseller-product-block');
    existingBlocks?.forEach(el => el.remove());

    const recommendationsExist =
      cartDrawerInner?.querySelector('.cart-drawer-recommendations') ||
      cartDrawerInner?.querySelector('#topseller-product-block');
  
    if (!recommendationsExist) {
      // const fallbackTopSeller = generateTopSellerBlock(); // from global function
      const cartDrawerFooter = window.topProductEmbedUtils.findCartDrawerFooter();
      console.log(cartDrawerFooter);

  //  createElementFromHTML(fallbackTopSeller),
      if (cartDrawerInner && cartDrawerFooter) 
        cartDrawerInner.appendChild(
          cartDrawerFooter
        );
      }
    }
  
);
  
  function createElementFromHTML(htmlString) {
    const div = document.createElement('div');
    div.innerHTML = htmlString.trim();
    return div.firstChild;
  }
}



// parallax theme cart page 
document.addEventListener('DOMContentLoaded', () => {
  enhanceCartQuantities();
});

const drawer = document.querySelector('.mm-listview'); // Update selector if needed
if (drawer) {
  const observer = new MutationObserver(() => {
    // Inject CSS styles only once


    enhanceCartQuantities();
  });

  observer.observe(drawer, {
    childList: true,
    subtree: true
  });
}


function enhanceCartQuantities() {
  const quantityContainers = [
    ...document.querySelectorAll('.cart__quantity'),
    ...Array.from(document.querySelectorAll('p[id^="quantity_"]')).filter(p => p.querySelector('input.quantity'))
  ];

  if (!quantityContainers.length) return;

  quantityContainers.forEach(quantityContainer => {
    if (quantityContainer.dataset.enhanced === "true") return; // Prevent double enhancement
    const originalInput = quantityContainer.querySelector('input.quantity');
    if (!originalInput) return;

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
        border: 1px solid #ccc;
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
    `;
    document.head.appendChild(style);

    const inputValue = parseInt(originalInput.value, 10) || 0;
    const inputName = originalInput.name;
    const idParts = originalInput.id.includes('_') ? originalInput.id.split('_') : [];
    const variantId = idParts.length > 1 ? idParts[1] : originalInput.dataset?.variantId || '';
    const lineId = originalInput.getAttribute('data-line-id') || '';

    let productTitle = 'product';
    const productTitleElem = quantityContainer.closest('.cart-item')?.querySelector('.product-title');
    if (productTitleElem && productTitleElem.textContent.trim().length) {
      productTitle = productTitleElem.textContent.trim();
    }

    const quantityPopover = document.createElement('quantity-popover');

    getVolumePricingConfig(variantId).then(volumeApiConfig => {
      if (!volumeApiConfig) return;

      const { minimum, maximum, increment } = volumeApiConfig.volumeConfig;
      const minNum = Number(minimum);
      const maxNum = Number(maximum);
      const stepNum = Number(increment);

      quantityPopover.innerHTML = `
        <div class="parallax-cart-input cart-item__quantity-wrapper quantity-popover-wrapper">
          <label class="visually-hidden" for="Quantity-${lineId || variantId || 'default'}">Quantity</label>
          <div class="quantity-popover-container">
            <quantity-input class="quantity cart-quantity">
              <button class="quantity__button" name="minus" type="button" aria-label="Decrease quantity for ${productTitle}">
                <span class="svg-wrapper">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" class="icon icon-minus" viewBox="0 0 10 2">
                    <path fill="currentColor" fill-rule="evenodd" d="M.5 1C.5.7.7.5 1 .5h8a.5.5 0 1 1 0 1H1A.5.5 0 0 1 .5 1" clip-rule="evenodd"></path>
                  </svg>
                </span>
              </button>
              <input
                class="quantity__input"
                type="number"
                name="${inputName}"
                id="Quantity-${lineId || variantId || 'default'}"
                value="${inputValue}"
                min="${minNum}"
                max="${maxNum}"
                step="${stepNum}"
                data-line-id="${lineId}"
                data-variant-id="${variantId}"
                aria-label="Quantity for ${productTitle}"
                ${originalInput.disabled ? 'disabled' : ''}
              />
              <button class="quantity__button" name="plus" type="button" aria-label="Increase quantity for ${productTitle}">
                <span class="svg-wrapper">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" class="icon icon-plus" viewBox="0 0 10 10">
                    <path fill="currentColor" fill-rule="evenodd" d="M1 4.51a.5.5 0 0 0 0 1h3.5l.01 3.5a.5.5 0 0 0 1-.01V5.5l3.5-.01a.5.5 0 0 0-.01-1H5.5L5.49.99a.5.5 0 0 0-1 .01v3.5l-3.5.01z" clip-rule="evenodd"></path>
                  </svg>
                </span>
              </button>
            </quantity-input>
          </div>
        </div>
      `;

      quantityContainer.replaceWith(quantityPopover);
      quantityPopover.dataset.enhanced = "true"; // Prevent duplicate enhancement

      const minusBtn = quantityPopover.querySelector('button[name="minus"]');
      const plusBtn = quantityPopover.querySelector('button[name="plus"]');
      const quantityInput = quantityPopover.querySelector('input.quantity__input');
      let updateInProgress = false;

      async function updateQuantity(newQty) {
        if (updateInProgress) return;
        updateInProgress = true;

        if (newQty < minNum) newQty = minNum;
        if (newQty > maxNum) newQty = maxNum;
        const remainder = (newQty - minNum) % stepNum;
        if (remainder !== 0) newQty = newQty - remainder;

        quantityInput.value = newQty;

        try {
          if (typeof updateProductToCart === 'function' && variantId) {
            await updateProductToCart(variantId, newQty);

          }
        } catch (e) {
          console.error('Update cart failed:', e);
        } finally {
          updateInProgress = false;
        }
      }

      minusBtn.addEventListener('click', () => {
        let currentQty = parseInt(quantityInput.value, 10) || minNum;
        updateQuantity(currentQty - stepNum);
      });

      plusBtn.addEventListener('click', () => {
        let currentQty = parseInt(quantityInput.value, 10) || minNum;
        updateQuantity(currentQty + stepNum);
      });

      quantityInput.addEventListener('change', () => {
        let val = parseInt(quantityInput.value, 10);
        if (isNaN(val)) val = minNum;
        updateQuantity(val);
      });
    });
  });
}

//  after add to cart call openCart drawer
function openCartDrawer() {
  const details = document.querySelector('cart-drawer > details.cart-drawer-container');
  if (details && !details.hasAttribute('open')) {
    details.classList.add('menu-opening');
    details.setAttribute('open', '');
    return true;
  }
  return false;
}

//  wait for render cart data
function waitForMiniCartInnerAndInsert(maxWait = 3000) {
  const start = Date.now();

  function check() {
    const miniCartInner = document.querySelector('cart-drawer .mini-cart__inner');
    if (miniCartInner) {
      console.debug('[TopSeller] .mini-cart__inner found, inserting...');
      insertTopSeller(); // Call your real insert logic
    } else if (Date.now() - start < maxWait) {
      requestAnimationFrame(check);
    } else {
      console.error('[TopSeller] Failed to find .mini-cart__inner after waiting.');
    }
  }

  check();
}

function openDrawerThenInsertTopSeller() {
  const opened = openCartDrawer();
  if (opened) {
    waitForMiniCartInnerAndInsert();
  } else {
    console.warn('[TopSeller] Drawer already open or not found.');
    waitForMiniCartInnerAndInsert(); // still try
  }
}


async function getVolumePricingConfig(variantId) {
  try {
    const data = await window.productPricingService.getVolumePricingByProductVariantId(
      tpConfig.appDomain,
      topProductState.shop,
      tpConfig.apiKey,
      tpConfig.timestamp,
      tpConfig.hmac,
      topProductState.customerId,
      variantId
    );

    const volumeConfig = data;
    const discountType = data.type;

    console.log("volumeConfigvolumeConfigvolumeConfig", volumeConfig);

    // Optionally, if you're configuring input fields, you can do:
    // input.readOnly = true;
    // input.min = volumeConfig.volumeConfig.minimum;
    // input.max = volumeConfig.volumeConfig.maximum;
    // input.step = volumeConfig.volumeConfig.increment;

    return volumeConfig; // Return the result from the function
  } catch (error) {
    console.error("Failed to fetch volume pricing:", error);
    return null;
  }
}


// fetchVolumeConfig();


function updateCartSidebar() {
  fetch('/cart?view=sidebar') // Or whatever view renders your cart sidebar HTML
    .then(response => response.text())
    .then(html => {
      const parser = new DOMParser();
      const newDocument = parser.parseFromString(html, 'text/html');
      const newSidebar = newDocument.querySelector('#cart'); // or the correct wrapper

      const currentSidebar = document.querySelector('#cart'); // or your target
      if (currentSidebar && newSidebar) {
        currentSidebar.innerHTML = newSidebar.innerHTML;
      }
    });
}

function updateCartCount() {
  fetch('/cart.js')
    .then(res => res.json())
    .then(cart => {
      const count = cart.item_count;

      // Update all cart count <span>s
      document.querySelectorAll('.cart-button span').forEach(span => {
        span.textContent = count;
      });
    });
}

async function updateProductToCart(variantId, quantity) {
  if (quantity < 0) quantity = 0;

  const response = await fetch('/cart/change.js', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({
      id: variantId,
      quantity: quantity
    })
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.description || 'Failed to update cart');
  }

   await updateCartSidebar();
   await updateCartCount();

  const cart = await response.json();

  return cart;
}