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

          if(data != null && !data.hasOwnProperty('error')) {
            const request = store.put(record);
            request.onerror = () => reject(request.error);
            request.onsuccess = () => resolve(request.result);
          } 
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
    document.querySelector('.cart-count-badge').innerHTML = itemCount
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
      event.preventDefault();
      event.stopImmediatePropagation();

      const quantityButtons = document.querySelectorAll('.quantity-wrapper button.quantity__button');
      quantityButtons.disabled = true;

      const container = button.closest('quantity-input');
      const input = container.querySelector('input.quantity__input');
      const variantId = parseInt(input.getAttribute('data-quantity-variant-id'), 10);
      const current = parseInt(input.value, 10);
      const step = parseInt(input.getAttribute('step') || '1', 10);
      const min = parseInt(input.getAttribute('min') || '1', 10);

      let newQty = current;
      if (button.name === 'increment') newQty = current + step;
      if (button.name === 'decrement') newQty = Math.max(min, current - step);

      try {
        // Use your update logic (this works across themes)
        await window.cartService.updateProductToCart(variantId, newQty);
      } catch (err) {
        console.error('Cart quantity update failed:', err);
      }

      quantityButtons.disabled = false;
    }, true);
  });
};

function formatMoneyValueProperly(value, key) {
  var themeSettings = window.theme.settings;

  value = value.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });

  if(key == 'money_format') {
    return themeSettings.money_format.replace('{{amount}}', value);
  }

  if(key == 'money_with_currency_format') {
    return themeSettings.money_with_currency_format.replace('{{amount}}', value);
  }

  return value;
}

if(!window.renderCartDrawerProperly) {
  window.renderCartDrawerProperly = async function renderCartDrawerProperly(htmlDoc, cart) {
    var subtotalPrice = Number(parseFloat(cart.items_subtotal_price / 100).toFixed(2));
    var subTotalHTML = formatMoneyValueProperly(subtotalPrice, 'money_with_currency_format');
    
    //Now try to render cart items into this htmlDoc
    for(var i in cart.items) {
      const item = cart.items[i];
      const unitPriceToDisplay = Number(parseFloat(item.final_price / 100).toFixed(2));
      const unitCrossedOutPrice = Number(parseFloat(item.price / 100).toFixed(2));

      const totalPriceToDisplay = Number(parseFloat(item.final_price * item.quantity / 100).toFixed(2));
      const totalCrossedOutPrice = Number(parseFloat(item.price * item.quantity / 100).toFixed(2));

      const htmlCartItemToTarget = htmlDoc.querySelector('.cart-item a[href="'+item.url+'"]').closest('.cart-item');
      if(htmlCartItemToTarget) {
        const lineItemPriceContainerToTarget = htmlCartItemToTarget.querySelector('.cart-item__price');
        if(lineItemPriceContainerToTarget) {
          lineItemPriceContainerToTarget.innerHTML = `
            <div class="cart-item__discounted-prices">
              <span class="visually-hidden">Sale price</span>
              <ins class="color-red">${formatMoneyValueProperly(unitPriceToDisplay, 'money_format')}</ins>
              <span class="visually-hidden">Regular price</span>
              <del>${formatMoneyValueProperly(unitCrossedOutPrice, 'money_format')}</del>
            </div>
          `;
        } 

        const priceBreakdownToTarget = htmlCartItemToTarget.querySelector('.cart-item__actions--price');
        if(priceBreakdownToTarget) {
          priceBreakdownToTarget.innerHTML = `
            <div class="cart-item__discounted-prices cart-item__price">
              <span class="visually-hidden">Sale price</span>
              <ins class="color-red">${formatMoneyValueProperly(totalPriceToDisplay, 'money_format')}</ins>
              <span class="visually-hidden">Regular price</span>
              <del>${formatMoneyValueProperly(totalCrossedOutPrice, 'money_format')}</del>
            </div>
          `
        }

        var cartButtonsToTarget = htmlCartItemToTarget.querySelector('quantity-input');
        if(cartButtonsToTarget) {
          var middleInput = cartButtonsToTarget.querySelector('.quantity__input');
          if(middleInput) {
            middleInput.setAttribute('data-quantity-variant-id', item.variant_id || item.product_id);
            
            const data = await getProductVolumePricingByVariantId(window.productPageState.productVariantId);
            const volumeConfig = data.volumeConfig;
            try {
                const min = volumeConfig.minimum;
                const inc = volumeConfig.increment;
                const max = volumeConfig.maximum === Number.MAX_SAFE_INTEGER ? '∞' : volumeConfig.maximum;
                
                middleInput.setAttribute('step', inc);
                middleInput.setAttribute('min', min);
                
                if (!volumeConfig.maximum || volumeConfig.maximum == Number.MAX_SAFE_INTEGER) {
                  middleInput.setAttribute('max', MAX_SAFE_INTEGER);
                } else {
                  middleInput.setAttribute('max', max);
                }    
            } catch (error) {
              console.log('error in line 365');
              console.log(error.message);    
            }
          } 
        } 
      } 
    }

    var subtotalSelector = htmlDoc.querySelector('.cart-drawer__total-price');
    if(subtotalSelector) {
      subtotalSelector.innerHTML = subTotalHTML;
    }
    return htmlDoc;
  }
}

if(!window.reloadCartDrawer) {
  window.reloadCartDrawer = async function reloadCartDrawer(flag = true) {
    try {
      const currentCart = await window.cartService.getCart();
      const newResp = await fetch('/?section_id=cart-drawer'); // Shopify section
      const htmlString = await newResp.text(); // <-- This is valid here
      // 3. Parse the HTML string into a DOM element
      var htmlDoc = new DOMParser().parseFromString(htmlString, 'text/html');
      const newDrawer = htmlDoc.querySelector('cart-drawer');

      htmlDoc = window.renderCartDrawerProperly(htmlDoc, currentCart);
      
      const currentDrawer = document.querySelector('cart-drawer');
      if (currentDrawer && newDrawer) {
        currentDrawer.replaceWith(newDrawer);
      }

      if(flag) //We don't wanna open it everytime the page loads
        document.querySelector('cart-drawer').open();              

      // Trigger optional header bubble update
      if (typeof window.updateCartBubbleFromCartJS === 'function') {
        window.updateCartBubbleFromCartJS();
      }
    } catch (err) {
      console.error('[Cart] Drawer refresh failed', err);
    }
  }
}

if(!window.renderCartPageProperly) {
  window.renderCartPageProperly = async function renderCartPageProperly(cart) {
    var subtotalPrice = Number(parseFloat(cart.items_subtotal_price / 100).toFixed(2));
    var subTotalHTML = formatMoneyValueProperly(subtotalPrice, 'money_format');
  
    //Now try to render cart items into this htmlDoc
    for(var i in cart.items) {
      const item = cart.items[i];
      const unitPriceToDisplay = Number(parseFloat(item.final_price / 100).toFixed(2));
      const unitCrossedOutPrice = Number(parseFloat(item.price / 100).toFixed(2));

      const totalPriceToDisplay = Number(parseFloat(item.final_price * item.quantity / 100).toFixed(2));
      const totalCrossedOutPrice = Number(parseFloat(item.price * item.quantity / 100).toFixed(2));

      const htmlCartItemToTarget = document.querySelector('.cart-item__media a[href="'+item.url+'"]').closest('.cart-item');
      if(htmlCartItemToTarget) {
        
        let mainPriceSelector = htmlCartItemToTarget.querySelector('.cart-item__price .color-red');
        let crossedPriceSelector = htmlCartItemToTarget.querySelector('.cart-item__price del');
        if(mainPriceSelector && crossedPriceSelector) {
          mainPriceSelector.innerHTML = formatMoneyValueProperly(unitPriceToDisplay, 'money_format');
          crossedPriceSelector.innerHTML = formatMoneyValueProperly(unitCrossedOutPrice, 'money_format');
        }      

        // let totalPriceSelector = htmlCartItemToTarget.querySelector('.cart-item__total-price .color-red');
        // let totalCrossedPriceSelector = htmlCartItemToTarget.querySelector('.cart-item__total-price del');

        // if(totalPriceSelector && totalCrossedPriceSelector) {
        //   totalPriceSelector.innerHTML = formatMoneyValueProperly(totalPriceToDisplay, 'money_format');
        //   totalCrossedPriceSelector.innerHTML = formatMoneyValueProperly(totalCrossedOutPrice, 'money_format');
        // }
        
        const data = await getProductVolumePricingByVariantId(item.variant_id || item.product_id);
        const volumeConfig = data.volumeConfig;
        try {
          const min = volumeConfig.minimum;
          const inc = volumeConfig.increment;
          var max = volumeConfig.maximum === Number.MAX_SAFE_INTEGER ? '∞' : volumeConfig.maximum;
          
          if (!volumeConfig.maximum || volumeConfig.maximum == Number.MAX_SAFE_INTEGER) {
            max = MAX_SAFE_INTEGER;
          } 

          const quantityButton = htmlCartItemToTarget.querySelector('.quantity__input');
          if(quantityButton) {
            quantityButton.setAttribute('min', min);
            quantityButton.setAttribute('max', max);
            quantityButton.setAttribute('step', inc);
            quantityButton.setAttribute('data-quantity-variant-id', item.variant_id);
          }

        } catch (error) {
          console.log('error in line 365');
          console.log(error.message);    
        }   
      } 
    }

    var subtotalSelector = document.querySelector('.cart__summary-total-price');
    if(subtotalSelector) {
      subtotalSelector.innerHTML = subTotalHTML;
    }
    return true;
  }
}

if(!window.bindCartPageButtons) {
  window.bindCartPageButtons = async function () {
    document.querySelectorAll('quantity-input .quantity__button').forEach((button) => {
      button.addEventListener('click', async (event) => {
        event.preventDefault();
        event.stopImmediatePropagation();

        const quantityButtons = document.querySelectorAll('.quantity-wrapper button.quantity__button');
        quantityButtons.disabled = true;

        const container = button.closest('quantity-input');
        const input = container.querySelector('input.quantity__input');
        const variantId = parseInt(input.getAttribute('data-quantity-variant-id'), 10);
        const current = parseInt(input.value, 10);
        const step = parseInt(input.getAttribute('step') || '1', 10);
        const min = parseInt(input.getAttribute('min') || '1', 10);

        let newQty = current;
        if (button.name === 'increment') newQty = current + step;
        if (button.name === 'decrement') newQty = Math.max(min, current - step);

        try {
          await window.cartService.updateProductToCart(variantId, newQty, {}, false);
          
        } catch (err) {
          console.error('Cart quantity update failed:', err);
        }
        location.reload(true);
        quantityButtons.disabled = false;
      }, true);
    });
  }
}

if(!window.setupCartPage) {
  window.setupCartPage = async function setupCartPage() {
    try {
      const currentCart = await window.cartService.getCart();
      await window.renderCartPageProperly(currentCart);
      
      // Trigger optional header bubble update
      if (typeof window.updateCartBubbleFromCartJS === 'function') {
        await window.updateCartBubbleFromCartJS();
      }
      
      window.bindCartPageButtons();
    } catch (error) {
      console.log('error in setupcart page function');
      console.log(error.message);
    }
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
  window.cartService = {
    addProductToCart: async function(variantId, quantity, properties = {}) {
      try {
        const activeThemeName = Shopify?.theme?.schema_name?.trim() || 'default';
        const themeSectionMap = {
          "Release": ['cart-drawer', 'header'],
          "default": ['cart-drawer', 'header'] // fallback
        };

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
        await window.reloadCartDrawer();
        window.bindCartDrawerQuantityButtons();
                    
        const closeBtn = document.querySelector('.cart-drawer__close');
        if (closeBtn) {
          const currentCartDrawer = document.querySelector('cart-drawer, .global-drawer, .cart-drawer, .drawer', '.cart-drawer__close');
          closeBtn.addEventListener('click', () => {
            if (currentCartDrawer) {
              currentCartDrawer.setAttribute('aria-hidden', 'true');
              currentCartDrawer.classList.remove('is-visible');
            }
          });
        }

      } catch (error) {
        console.error('Error adding product to cart:', error);
        alert('Failed to add product to cart. Please try again.');
      }
    },

    updateProductToCart: async function (variantId, quantity, properties = {}, reloadDrawerFlag = true) {
      // Avoid concurrent updates
      if (!window.updateLocks) window.updateLocks = new Map();
      if (window.updateLocks.get(variantId)) return;
      window.updateLocks.set(variantId, true);
      
      try {
        const cart = await window.cartService.getCart();
        const item = cart.items.find(i => i.variant_id === parseInt(variantId, 10));
        if (!item || !item.key) {
          throw new Error(`Cart item not found or missing key for variant: ${variantId}`);
        }

        const lineNumber = await getLineNumberForVariant( item.id);
    
        const activeThemeName = Shopify?.theme?.schema_name?.trim() || 'default';
        const themeSectionMap = {
          "default": ['cart-drawer', 'header'],
          "Release": ['cart-drawer', 'header']
        };
        
        const sections = themeSectionMap[activeThemeName] || themeSectionMap['default'];
        
        const requestBody = {
          line: lineNumber,
          quantity,
          properties,
          sections
        };
    
        const response = await fetch('/cart/change.js', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(requestBody)
        });
    
        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(`Cart update failed: ${JSON.stringify(errorData)}`);
        }
    
        const result = await response.json();
        if(reloadDrawerFlag) {
          await window.reloadCartDrawer();
          window.bindCartDrawerQuantityButtons();
        }
        
        //updateCartItemsUpsell?.();
        //updateTopProductPrice?.();
      } catch (error) {
        console.error('[Cart] updateProductToCart failed:', error);
        showComplementaryToast?.('Failed to update cart. Please try again.', 'error');
      } finally {
        window.updateLocks.delete(variantId);
      }
    },

    getCart: async function () {
        try {
            const response = await fetch('/cart.js', {
                method: 'GET',
                headers: { 'Content-Type': 'application/json' }   
            });
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

// event listeners
if (!window.GlobalVariables.isGlobalClickEventAdded ) {
  window.GlobalVariables.isGlobalClickEventAdded = true;
  document.body.addEventListener('click', async function(event) {
    if (event.target.closest('.quantity__button')) {
      return;
    }

    const clickedButton = event.target.closest('button');

    if (clickedButton && clickedButton.name === 'add' && clickedButton.type === 'submit') {
      if (Object.hasOwn(window.productPageState, 'skipEvent') && window.productPageState.skipEvent === true) {
        return;
      }

      event.preventDefault();

      const form = clickedButton.closest('form');
      if (!form) return;

      const variantId = form.querySelector('[name="id"]')?.value || form.querySelector('.product-variant-id')?.value;

      let quantity = 1;

      const customInput = document.getElementById('product-quantity-input');
      const fallbackInput = document.querySelector('.quantity__input');

      if (customInput !== null) {
        const value = parseInt(customInput.value, 10);
        if (!isNaN(value)) {
          quantity = value;
        } else {
          console.warn('[Quantity] Custom input present but invalid value:', customInput.value);
        }
      }

      if (quantity === 1 && fallbackInput !== null) {
        const fallbackValue = parseInt(fallbackInput.value, 10);
        if (!isNaN(fallbackValue)) {
          quantity = fallbackValue;
        } else {
          console.warn('[Quantity] Fallback input present but invalid value:', fallbackInput.value);
        }
      }

      console.debug('[Quantity] Final resolved value:', quantity);

      const cart = await window.cartService.getCart();
      const existingItem = cart.items.find(item => item.variant_id === parseInt(variantId));
      //console.log('existingItem****************>', existingItem);
      var addToCartButtonSelector = form.querySelector('[type="submit"]');
      var addToCartInnerHTML = addToCartButtonSelector.innerHTML;
      addToCartButtonSelector.innerHTML = 'Loading...';
          
      try {
        if (existingItem) {
          await window.cartService.updateProductToCart(existingItem.key, existingItem.quantity + quantity, existingItem.properties);
        } else {
          await window.cartService.addProductToCart(variantId, quantity, null);
        }  
      } catch (error) {
        console.log('error here in outside function');
        console.log(error.message);
      }

      addToCartButtonSelector.innerHTML = addToCartInnerHTML;

    } else if (event.target.localName.toLowerCase() === 'input' && event.target.type === 'radio') {
      //console.log("event.target radio");
      setTimeout(() => {
        const baseURI = window.location.href;
        const variantIdMatch = baseURI.match(/variant=(\d+)/);
        if (variantIdMatch) {
          const variantIdNew = variantIdMatch[1];
          if (window.complementaryProductState.variantId != variantIdNew) {
            window.complementaryProductState.variantId = variantIdNew;
            window.productPageState.productVariantId = variantIdNew;
            location.reload();
          }
        }
      }, 1000);
    } else if (event.target.tagName === 'SELECT' && event.target.name === 'options[Size]' && event.target.type === 'select-one') {
      setTimeout(() => {
        const baseURI = window.location.href;
        const variantIdMatch = baseURI.match(/variant=(\d+)/);
        if (variantIdMatch) {
          const variantIdNew = variantIdMatch[1];
          if (window.complementaryProductState.variantId != variantIdNew) {
            window.complementaryProductState.variantId = variantIdNew;
            window.productPageState.productVariantId = variantIdNew;
            location.reload();
          }
        }
      }, 1000);
    } else if (event.target.localName.toLowerCase() === 'label') {
      //console.log("event.target label");
      setTimeout(() => {
        const baseURI = window.location.href;
        const variantIdMatch = baseURI.match(/variant=(\d+)/);
        if (variantIdMatch) {
          const variantIdNew = variantIdMatch[1];
          if (window.complementaryProductState.variantId != variantIdNew) {
            window.complementaryProductState.variantId = variantIdNew;
            window.productPageState.productVariantId = variantIdNew;
            location.reload();
          }
        }
      }, 1000);
    }
  });
};

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
          console.log('calling now');
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
        if(!productVariantId) return null;
        let data = await window.indexDBService.getFromIndexedDb(window.indexDBService.DB_VOLUME_PRICING, productVariantId);
        if (!data) {
          //console.log('calling the volume pricing api here', {customerId, productVariantId});
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
if (!window.productPageService) {
  window.productPageService = {
    createProductPageCustomPricing: function() {
      if (!window.productPageState.productOriginalFlag) {
        const qtyElement = `
          <div id="product-quantity-input-block" style="display: flex; align-items: center; border: 1px solid #ccc; border-radius: 4px; width: fit-content;">
            <button id="product-quantity-minus" style="width: 40px; height: 40px; background: none; border: none; border-right: 1px solid #ccc; font-size: 16px; cursor: pointer;">−</button>
            <input id="product-quantity-input" style="width: 40px; height: 40px; border: none; font-size: 16px; text-align: center;" value="1" readonly>
            <button id="product-quantity-plus" style="width: 40px; height: 40px; background: none; border: none; border-left: 1px solid #ccc; font-size: 16px; cursor: pointer;">+</button>
          </div>
        `;
        let insertAfterElement = window.productPageState.original.productOriginalQuantityElement ? window.productPageState.original.productOriginalQuantityElement : null;
        // Fallback if original quantity element is not present
        //console.log('insertAfterElement', insertAfterElement);
        if ( insertAfterElement === null ) {
          insertAfterElement = document.querySelector('.form') || document.querySelector('.product_form') ;
        //  ||document.querySelector('.product-form__buttons') ||  document.querySelector('.product__price') || document.querySelector('.product-block product-block--price')
                               //|| document.querySelector('.modal_price') || document.querySelector('#product-price') || document.querySelector('.swatch-options')
            }
        if (insertAfterElement) {
          insertAfterElement.insertAdjacentHTML('beforebegin', qtyElement);
        } else {
          //console.log('No suitable location found to insert custom quantity selector.');
          return;
        }
        // window.productPageState.original.productOriginalQuantityElement.insertAdjacentHTML('afterend', qtyElement);
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
        window.productPageState.original.productOriginalPriceElement.insertAdjacentHTML('afterend', priceElement);
        window.productPageState.new.productPriceElement = document.getElementById('product-price');
        window.productPageState.new.productLoadingSpinner = document.getElementById('product-loading-spinner');
      }
    },
    hideProductPageElements: function() {
      window.productPageState.original.productOriginalPriceElement.style.display = 'none';
      if(window.productPageState.original.productOriginalQuantityElement){
        window.productPageState.original.productOriginalQuantityElement.style.display = 'none';
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
        <h5 id="top-seller-title" style="margin: 0; color: black; font-weight: bold;"></h5>
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
      'cart-drawer'
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
      ".cart-drawer__inner",
    ];
    
    // Try to find the cart drawer using the list of selectors
    let cartDrawerInner = null;
    
    for (const selector of cartDrawerSelectors) {
      const element = document.querySelector(selector);
      if (element) {
        cartDrawerInner = element;
        break;
      }
    }

    if(!cartDrawerInner) {
        console.log('returning null for cartDrawerInner');
    }
    return cartDrawerInner;
  },
  
  findCartDrawerFooter: function() {
    const cartDrawerSelectors = [
      ".cart-drawer__bottom"
    ];
    
    let cartDrawerInner = null;
    
    for (const selector of cartDrawerSelectors) {
      const element = document.querySelector(selector);
      if (element) {
        cartDrawerInner = element;
        break;
      }
    }
              
    return cartDrawerInner;
  }
};

async function initializeProductState() {
  return new Promise((resolve) => {
    // Find your custom quantity elements
    window.productPageState.productQuantityInput = document.getElementById('product-quantity-input');
    window.productPageState.productMinusButton = document.getElementById('product-quantity-minus');
    window.productPageState.productPlusButton = document.getElementById('product-quantity-plus');
    
    // ========== ROBUST SELECTORS FOR ORIGINAL ELEMENTS ==========
    
    // Price element - multiple selectors for cross-theme compatibility
    const priceSelectors = [
      '.price__container', //dawn theme
      '.price__sale', //dawn theme
      '.product-price.product-price--large', //expression theme 
      '.price-list',
      '.product-block--price',
      ".portalspere__productpage__price__selector",
      '.price-template--17816651464748__main',
      '[id*="price-template"][id$="__main"]',
      '.price--large',
      '.price',
      '.product__price',
      '.modal_price',
      '.product-single__price',
      '[data-product-price]',
      '.price-item--regular',
      '.product-price',
      'span[data-price]',
      '.product-form__info-item--price',
      '.product-page--pricing',
      '.price',
      '.product-form__info-content',
      '.product__price',
      '#Price',
       '.product-form__price',
       '.product__price-value',
       '.product-block--price',
       '.product-block.product-block--price',
       '.product-form__info-content',
      //  '.price__container',
       '.price.price--medium.price--on-sale',
       '.product-price.product-price--large',
       '.price__default'
      
    ];
    
    // Find the first matching price element
    for (const selector of priceSelectors) {
      const priceElement = document.querySelector(selector);
      if (priceElement) {
        //console.log('priceElement', priceElement);
        window.productPageState.original.productOriginalPriceElement = priceElement;
        break;
      }
    }
    
    // Quantity element - multiple selectors for cross-theme compatibility
    const quantitySelectors = [
      '.js-qty',
      '.js-qty__wrapper',
     '.price-per-item__container',
     '.cart__quantity',
      ".portalspere__productpage__quantity__selector",
      '.product-form__qty-input',
      '[id*="Quantity-Form-template"][id$="__main"]',
       ".product-form__info-item--quantity",
      '.product-form__quantity',
      '.product-quantity-input-block', //flux theme
      '.product-single__quantity',
      '.js-qty__wrapper',
      '.quantity-selector',  
      '.js-qty',
      '[data-quantity-input]',
      '.quantity-wrapper',
      '.product-form__input--quantity',
      '.product-form__info-content', // warehouse theme
      //'.quantity',
      '.product-quantity',
      'product-form__quantity-with-rules',
      'quantity-selector quantity-selector--product',
      '.product-form__quantity-with-rules',
      '.qty-wrapper',
      '.qty-input__btn',
      '.quantity',
      '.product-quantity'
    ];
    
    // Find the first matching quantity element
    for (const selector of quantitySelectors) {
      const quantityElement = document.querySelector(selector);
      if (quantityElement) {
        window.productPageState.original.productOriginalQuantityElement = quantityElement;
        break;
      }
    }
    
    // Quantity input - multiple selectors for cross-theme compatibility
    const quantityInputSelectors = [
      ".portalspere__productpage__quantity__input",
      '.quantity__input',
      'input.quantity__input',
      '.js-qty__num',
      '#product-form-template--17816667881516__main--quantity',
      'input[name="quantity"]',
      '.product-form__qty-input',
      '[aria-label="Quantity"]',
      'input.js-qty__input',
      '.product-quantity-input', //flux theme
      'input.quantity-selector__input',
      '.product-form__input--quantity input',
      '.product-quantity input',
      'quantity-selector__value',
      '.quantity-selector__value',
      '.cc-select__option js-option',
      '.qty-input',
      '.product-quantity input'
    ];
    
    // First try to find the input within the quantity element if we found one
    if (window.productPageState.original.productOriginalQuantityElement) {
      for (const selector of quantityInputSelectors) {
        const quantityInput = window.productPageState.original.productOriginalQuantityElement.querySelector(selector);
        if (quantityInput) {
          //console.log("quantityInput", quantityInput);
          window.productPageState.original.productOriginalQuantityInput = quantityInput;
          break;
        }
      }
    }
    
    // If not found within the quantity element, search the entire document
    if (!window.productPageState.original.productOriginalQuantityInput) {
      for (const selector of quantityInputSelectors) {
        const quantityInput = document.querySelector(selector);
        if (quantityInput) {
          window.productPageState.original.productOriginalQuantityInput = quantityInput;
          break;
        }
      }
    }
    
    // Cart/form selectors - multiple selectors for cross-theme compatibility
    const formSelectors = [
      ".portalspere__productpage__form",
      'product-form.product-form',
      // 'form[action="/cart/add"]',
      // '.product-form',
      '.product-single__form',
      '.product__form-container',
      '#product-form',
      '.cart-btn-wrapper',
      '.product-form__buy-buttons',
      ".product-form__info-list"
    ];
    
    // Find the first matching form element
    for (const selector of formSelectors) {
      const formElement = document.querySelector(selector);
      if (formElement) {
        window.productPageState.original.productOriginalCartButtons = formElement;
        break;
      }
    }
    
    // Add to cart button - multiple selectors for cross-theme compatibility
    const addToCartSelectors = [
      ".portalspere__productpage__buttons",
      'button[type="submit"]',
      'button[name="add"]',
      'input[name="add"]',
      '[data-add-to-cart]',
      '.product-form__cart-submit',
      '.add-to-cart',
      '#AddToCart',
      '.btn--add-to-cart',
      '.ajax-submit'
    ];
    
    // First try within the form element if found
    if (window.productPageState.original.productOriginalCartButtons) {
      for (const selector of addToCartSelectors) {
        const addButton = window.productPageState.original.productOriginalCartButtons.querySelector(selector);
        if (addButton) {
          window.productPageState.original.productOriginalAddToCartButton = addButton;
          break;
        }
      }
    }
    
    // If not found within the form, search the entire document
    if (!window.productPageState.original.productOriginalAddToCartButton) {
      for (const selector of addToCartSelectors) {
        const addButton = document.querySelector(selector);
        if (addButton) {
          window.productPageState.original.productOriginalAddToCartButton = addButton;
          break;
        }
      }
    }

     // Variant picker - multiple selectors for cross-theme compatibility
    
    const variantPickerSelectors = [
      ".portalspere__productpage__variant__selector",
      // Dawn theme and variants
      'variant-radios',
      'variant-selects',
      // Common class-based selectors
      '.product-form__variants',
      '.product-single__variants',
      '.variant-selection',
      '.product__variants',
      // ID-based selectors
      '#productSelect',
      '#ProductSelect-product-template',
      // Other themes
      '.product-block--variant-picker',
      '.product-options',
      '.selector-wrapper',
      // Based on form control types
      'select[id*="ProductSelect"]',
      'select[data-single-option-selector]',
      'select[name="id"]',
      '.single-option-selector',
      // Radio-based variants
      '.radio-wrapper fieldset',
      // Swatches
      '.swatch',
      '.color-swatch-wrapper',
      // New JSON-based variant selectors (newer themes)
      '[data-product-variants]',
      '[data-variant-picker]',
      // Debut and similar themes
      '[data-product-form]'
    ];

      // Find the first matching variant picker element
      for (const selector of variantPickerSelectors) {
      const variantElement = document.querySelector(selector);
      if (variantElement) {
        window.productPageState.original.productOriginalVariantPicker = variantElement;
        break;
      }
    }
    
    // Log success or failure for debugging
    /*
    console.log('Wholesale app initialization:', {
      priceElement: window.productPageState.original.productOriginalPriceElement ? 'Found' : 'Not found',
      quantityElement: window.productPageState.original.productOriginalQuantityElement ? 'Found' : 'Not found',
      quantityInput: window.productPageState.original.productOriginalQuantityInput ? 'Found' : 'Not found',
      cartButtons: window.productPageState.original.productOriginalCartButtons ? 'Found' : 'Not found',
      addToCartButton: window.productPageState.original.productOriginalAddToCartButton ? 'Found' : 'Not found',
      variantPicker: window.productPageState.original.productOriginalVariantPicker ? 'Found' : 'Not found'
    });
    */

    resolve();
  });
}

function waitForQuantityInput() {
  const existing = document.getElementById('product-quantity-input');
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
  var isCartPage = window.location.pathname.includes('/cart');
  
  initializeProductState();
  waitForQuantityInput();

  if(!isCartPage) {
    if(window.reloadCartDrawer) {
      await window.reloadCartDrawer(false);
    }

    if(window.bindCartDrawerQuantityButtons) {
      window.bindCartDrawerQuantityButtons();
    }
  } else {
    window.setupCartPage();
  }
  
 // Variant switch fix for themes not updating URL (e.g., Symmetry, Motion-Cal)
  let lastVariantId = document.querySelector('[name="id"]')?.value;
  setInterval(() => {
    const currentVariantId = document.querySelector('[name="id"]')?.value;
    if (currentVariantId && currentVariantId !== lastVariantId) {
      lastVariantId = currentVariantId;
      window.complementaryProductState.variantId = currentVariantId;
      window.productPageState.productVariantId = currentVariantId;
      if(!isCartPage)
        location.reload(); // reload to trigger custom pricing logic
    }
  }, 500); // check every 0.5 seconds
  if(!isCartPage)
    toggleCartDrawerQuantityInteractivity();
});

if (window.location.pathname.includes('/cart') || document.querySelector('.cart-drawer, #cart-drawer')) {
    const cartDrawerInner = window.topProductEmbedUtils.findCartDrawerInner();
    const existingBlocks = cartDrawerInner?.querySelectorAll('#topseller-product-block');
    existingBlocks?.forEach(el => el.remove());

    // const recommendationsExist =
    // cartDrawerInner?.querySelector('.cart-drawer-recommendations') ||
    // cartDrawerInner?.querySelector('#topseller-product-block');

    // if (!recommendationsExist) {
    //   //const cartDrawerFooter = window.topProductEmbedUtils.findCartDrawerFooter();
    //   // if (cartDrawerInner && cartDrawerFooter) 
    //   //   cartDrawerInner.appendChild(cartDrawerFooter);
    // }
}

function createElementFromHTML(htmlString) {
    const div = document.createElement('div');
    div.innerHTML = htmlString.trim();
    return div.firstChild;
}
