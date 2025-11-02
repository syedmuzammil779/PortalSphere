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

if (!window.topProductState) {
  window.topProductState = {
    quantityInput: null,
    plusButton: null,
    minusButton: null,
    addToCartTopProduct: null,
    priceElement: null,
    topProductEmbed: null,
    topProductVolumePricing: {},
    eventListenerFlags: {},
    variantId: null
  };
}

// Cart Service
if (!window.cartService) {  
  window.cartService = {
    addProductToCart: async function(variantId, quantity, properties = {}) {
      try {
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
            }]
          })
        });
    
        if (!response.ok) {
          const errorData = await response.json();
          console.error('Error response:', errorData);
          throw new Error(`HTTP error! status: ${response.status}, message: ${JSON.stringify(errorData)}`);
        }
    
        const result = await response.json();
        return result;
      } catch (error) {
        console.error('Error adding product to cart:', error);
        alert('Failed to add: '+error.message);
      }
    },
    updateProductToCart: async function(variantId, quantity, properties = {}) {
      try {
        variantId = variantId.split(':')[0];
        const response = await fetch('/cart/change.js', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            id: variantId,
            quantity: quantity,
            properties: properties
          })
        });
    
        if (!response.ok) {
          const errorData = await response.json();
          console.error('Error response:', errorData);
          throw new Error(`HTTP error! status: ${response.status}, message: ${JSON.stringify(errorData)}`);
        }
    
        const result = await response.json();
        return result;
      } catch (error) {
        console.error('Error updating cart:', error);
        alert('Failed to add: '+error.message);
      }
    },
    getCart: async function () {
      try {
        const response = await fetch('/cart.js', {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json'
          }
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

  const addToCartButton = document.querySelector('form.product-form button[type="submit"]');
  if(addToCartButton && addToCartButton.classList?.contains('product-form__add-button')) {
    addToCartButton.addEventListener('click', async function (event) {
      if (Object.hasOwn(window.productPageState, 'skipEvent') && window.productPageState.skipEvent === true) {
        return;
      }
      event.preventDefault();
      event.stopImmediatePropagation(); 
      
      event.target.innerHTML = 'Adding...'; 
      // Get the form element
      const form = event.target.closest('form');
      if (form) {
        const variantId = form.querySelector('[name="id"]')?.value;
        let quantity = document.getElementById('product-quantity-input')?.value || document.querySelector('.quantity__input')?.value || 1;  
        const cart = await window.cartService.getCart();
        const existingItem = cart.items.find(item => item.variant_id === parseInt(variantId));
        let cartResponse = null;
        if (existingItem) {
          cartResponse = await window.cartService.updateProductToCart(existingItem.key, existingItem.quantity + parseInt(quantity), existingItem.properties);
        } else {
          cartResponse = await window.cartService.addProductToCart(variantId, quantity, null);
        }

        if(cartResponse != null) {
          if (tspConfig.enableTopProducts === 'true') {
            const lineItems = cart.items.map(x => {
              return {product_id: x.product_id, variant_id: x.variant_id, quantity: x.quantity}
            });
            if(lineItems.length === 0) {
              setTimeout(async () => {
                const tspElement = window.topSellerPopupService.createTopSellerPopup();
                const volumeConfig = productPageState.productVolumePricing.volumeConfig;
                if (productPageState.original.productOriginalQuantityInput.value < volumeConfig.minimum){
                  productPageState.original.productOriginalQuantityInput.value = productPageState.new.productQuantityInput.value;
                } 

                const miniCartSelector = document.querySelector('form.mini-cart .mini-cart__content--empty');
                if(miniCartSelector) {
                  miniCartSelector.innerHTML = null;
                  miniCartSelector.insertAdjacentElement('beforeend', tspElement);
                  await window.displayTopSellerPopup();
                } 
              });
            }
          } else {
            document.documentElement.dispatchEvent(
              new CustomEvent('cart:refresh', {
                bubbles: true
              })
            );
          }
        }  
        
        var btnSelector = document.querySelector('a[href="/cart"]');
        if(btnSelector) {
          btnSelector.scrollIntoView({ behavior: 'smooth' });
          btnSelector.click();
        }

        event.target.innerHTML = 'Add to cart'
        
        setTimeout(async () => {
          await window.bindCartDrawerQuantityButtons();
        }, 500);
      }
    }, true);
  }

  var variantSelector = document.querySelector('variant-picker');
  if(variantSelector) {
    variantSelector.addEventListener('click', function (e) {
      setTimeout(() => {
        location.reload(true);
      }, 500);
    })
  }
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
          const response = await fetch(`https://${appDomain}/api/volume-pricing?shop=${shopDomain}&api_key=${apiKey}&timestamp=${timestamp}&hmac=${hmac}&customer=${customerId}&productId=${productId}`);
          data = await response.json();
          window.indexDBService.saveToIndexedDb(productId, data, window.indexDBService.DB_VOLUME_PRICING);
        }
        //console.debug('Volume Pricing Service:', data);
        return data;    
      } catch (error) {
        console.error('Error fetching volume pricing:', error);
        throw error;
      }
    },
    getVolumePricingBulkByHandleArray: async function (appDomain, shopDomain, apiKey, timestamp, hmac, customerId, handleArr) {
      let data = null;
      const response = await fetch(`https://${appDomain}/api/volume-pricing-handle-bulk`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'  // Tell server it's JSON
        },
        body: JSON.stringify({
          shop: shopDomain,
          api_key: apiKey,
          timestamp: timestamp,
          hmac: hmac,
          customer: customerId,
          handleArr: handleArr
        })
      })

      data = await response.json();
      return data;
    },
    getVolumePricingByProductVariantId: async function(appDomain, shopDomain, apiKey, timestamp, hmac, customerId, productVariantId) {
      try {
        let data = null;
        if (await window.indexDBService.getFromIndexedDb(window.indexDBService.DB_VOLUME_PRICING, productVariantId)) {
          data = await window.indexDBService.getFromIndexedDb(window.indexDBService.DB_VOLUME_PRICING, productVariantId);
        } 
        else {
          const response = await fetch(`https://${appDomain}/api/volume-pricing?shop=${shopDomain}&api_key=${apiKey}&timestamp=${timestamp}&hmac=${hmac}&customer=${customerId}&productVariantId=${productVariantId}`);
          data = await response.json();
          window.indexDBService.saveToIndexedDb(productVariantId, data, window.indexDBService.DB_VOLUME_PRICING);
        }
        //console.debug('Volume Pricing Service:', data);
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
    },
    getVolumePricingBulkByHandleArray: async function (appDomain, shopDomain, apiKey, timestamp, hmac, customerId, handleArr) {
      try {
        const response = await fetch(`https://${appDomain}/api/volume-pricing-handle-bulk`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            shop: shopDomain,
            api_key: apiKey,
            timestamp: timestamp,
            hmac: hmac,
            customer: customerId,
            handleArr: handleArr
          })
        })

        return await response.json();
      }
      catch (error) {
        throw error
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
    },

    recordButtonClick: async function(appDomain, shopDomain, apiKey, timestamp, hmac, customerId, tag, buttonType, operation) {
      if(!customerId || !tag) {
        return false;
      }

      try {
        const response = await fetch(`https://${appDomain}/api/record-button-click`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json", // Sending JSON
          },
          body: JSON.stringify({
            shopDomain: shopDomain,
            apiKey: apiKey,
            timestamp: timestamp,
            hmac: hmac,
            customerId: customerId,
            tag: tag,
            buttonType: buttonType,
            operation: operation
          })
        });
        data = await response.json();
          
      } catch (error) {
        console.error('Error recording button click:', error);
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
      complement.complementaryProductLoginButtons.addEventListener('click', function (e) {
        e.preventDefault();
        window.top.location.href = '/account/login';
      }, true);
      complement.complementaryProductRegisterButton = document.getElementById('complementary-product-register-button');
      complement.complementaryProductRegisterButton.addEventListener('click', function (e) {
        e.preventDefault();
        window.top.location.href = '/account/login';
      }, true);
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
        window.productPageState.original.productOriginalQuantityElement.insertAdjacentHTML('afterend', qtyElement);
        window.productPageState.new.productQuantityMinus = document.getElementById('product-quantity-minus');
        window.productPageState.new.productQuantityPlus = document.getElementById('product-quantity-plus');
        window.productPageState.new.productQuantityInput = document.getElementById('product-quantity-input');
        window.productPageState.new.productQuantityElement = document.getElementById('product-quantity-input-block');
        window.productPageState.new.productQuantityInput.value = 1;
        window.productPageState.original.productOriginalQuantityInput.value = 1;
        window.productPageState.productOriginalFlag = true;
  
        const priceElement = `
          <span id="product-loading-spinner" class="loading-spinner"></span>
          <div class="price-list">
            <span class="price">
              <span class="visually-hidden">Sale price</span>
              <b id="product-price">$10.00</b>
            </span>
          </div>
        `;
        window.productPageState.original.productOriginalPriceElement.insertAdjacentHTML('afterend', priceElement);
        window.productPageState.new.productPriceElement = document.getElementById('product-price');
        window.productPageState.new.productLoadingSpinner = document.getElementById('product-loading-spinner');
      }
    },
    hideProductPageElements: function() {
      window.productPageState.original.productOriginalPriceElement.style.display = 'none';
      window.productPageState.original.productOriginalQuantityElement.style.display = 'none';
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
        //console.debug('Complementary Product Service:', data);
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
      <div id="complementary-product-block-ui" style="display: none; font-family: Arial, sans-serif; border: 1px solid #ccc; padding: 16px; border-radius: 8px;margin-top: 20px;">
        <h5 id="complementary-product-header" style="margin-top: 0; margin-bottom: 16px; font-weight: bold;">Frequently bought together:</h5>
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
          <div class="tooltip">
            <p id="complementary-product-description" style="color: #000; margin-bottom: 20px; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; text-overflow: ellipsis; line-height: 1.4;">
            </p>
            <span id="complementary-product-description-tooltip" class="tooltiptext"></span>
          </div>
        </div>
        <p id="complementary-volume-quantities" style="margin: 5px; font-size: 12px; color: #666;"></p>
        <button id="add-complementary-product" style="display: none; width: 100%; padding: 10px; background-color: #000; color: #fff; border: none; border-radius: 4px; font-size: 14px; cursor: pointer; margin-bottom: 8px;">Add to cart</button>
        <button id="learn-more-complementary-product" style="display:none; width: 100%; background: none; border: none; color: #666; text-decoration: none; font-size: 14px; cursor: pointer;">Learn more ></button>
      </div>
      `;
    }
  }


}

if (!window.topSellerPopupService) {
  window.topSellerPopupService = {
    generateTopSellerPopup: function() {
      return `
        <div class="topseller-popup-content" style="height:90vh !important;margin:0 !important;box-shadow:none">
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

                <div id="top-seller-variants" style="width: 100%">
                  <input id="carouselCounter" type="hidden" />
                  <input id="selectedTopVariant" type="hidden" />
                  <div style="align-items: center; border: 1px solid #dcdcdc;">
                    <button id="showPrev" style="width: 10%; height: 40px; background: none; border: none; font-size: 16px; cursor: pointer;"><−</button>
                    <input id="carouselValue" class="" style="width: 70%; height: 40px; border: none; border-left: 1px solid #dcdcdc; border-right: 1px solid #dcdcdc; font-size: 16px; text-align: center;" readonly>
                    <button id="showNext" style="width: 10%; height: 40px; background: none; border: none; font-size: 16px; cursor: pointer;">-></button>
                  </div> 
                </div>
                
                <a href="#" id="cp-ts-product-title" target="_blank" style="display: block; font-weight: bold; margin-top: 10px; margin-bottom: 10px; color: #000; text-decoration: none;"></a>
                
                <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 15px; justify-content: center;">
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
              <div style="display: flex; align-items: center; margin-bottom: 15px; justify-content: center">
                <div style="display: flex; align-items: center; border: 1px solid #dcdcdc; margin-right: 10px;">
                  <button id="cp-ts-minus" style="width: 40px; height: 40px; background: none; border: none; font-size: 16px; cursor: pointer;">−</button>
                  <input id="cp-ts-quantity-input" style="width: 40px; height: 40px; border: none; border-left: 1px solid #dcdcdc; border-right: 1px solid #dcdcdc; font-size: 16px; text-align: center;" value="1" readonly>
                  <button id="cp-ts-plus" style="width: 40px; height: 40px; background: none; border: none; font-size: 16px; cursor: pointer;">+</button>
                </div>                
              </div>
              <p id="cp-ts-quantity-info" style="font-size: 14px; color: #666; margin: 0;"></p>

              <button id="cp-ts-add-to-cart" style="background-color: #000; color: white; border: none; padding: 15px; width: 100%; font-size: 16px; cursor: pointer;margin-top: 10px; margin-bottom: 10px;">Add</button>
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
      popupDiv.style.setProperty('display', 'block', 'important');
      popupDiv.style.setProperty('justify-content', 'center');
      popupDiv.style.setProperty('align-items', 'center');
      popupDiv.style.setProperty('background-color', 'white');
      popupDiv.style.setProperty('height', '90vh', 'important');
      
      popupDiv.innerHTML = window.topSellerPopupService.generateTopSellerPopup();
  
      // Close button functionality
      const closeBtn = popupDiv.querySelector('#close-top-seller-popup');
      const nothanksBtn = popupDiv.querySelector('#close-top-seller-nothanks');
  
      closeBtn.onclick = function(e) {
        e.preventDefault();
        e.stopImmediatePropagation();
        window.closeTopSellerPopupAndRefreshCart();
        unlockScroll();
      };
  
      nothanksBtn.onclick = function(e) {
        e.preventDefault();
        e.stopImmediatePropagation();
        window.closeTopSellerPopupAndRefreshCart();
        unlockScroll();
      };    
  
      // Close when clicking outside the popup
      window.onclick = function(event) {
        if (event.target === popupDiv) {
          window.closeTopSellerPopupAndRefreshCart();
          unlockScroll();
        }
      };
  
      return popupDiv;
    },
    getTopProductForTopSeller: async function (tspConfig, lineItems) {
      try {
        const response = await fetch(`https://${tspConfig.appDomain}/api/top-products?shop=${tspConfig.shopDomain}&customer=${tspConfig.customerId}&api_key=${tspConfig.apiKey}&timestamp=${tspConfig.timestamp}&hmac=${tspConfig.hmac}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ lineItems })
        });
        return await response.json();
      } catch (error) {
        console.error('Error:', error);
        return false;
      }
    }
  }
}

function unlockScroll() {
  document.body.style.overflow = '';
}

if(!window.closeTopSellerPopupAndRefreshCart) {
  window.closeTopSellerPopupAndRefreshCart = function () {
    document.querySelector('.mini-cart').setAttribute('aria-hidden', 'true');
    document.documentElement.dispatchEvent(
      new CustomEvent('cart:refresh', {
        bubbles: true
      })
    );
    document.querySelector('.mini-cart').setAttribute('aria-hidden', 'false');
    setTimeout(async () => {
      await window.bindCartDrawerQuantityButtons();
    }, 500);
  }
}

function savingsButtonCssText() {
  return 'font-size:0.8em; background: #000; color: white; padding: 5px; border-radius: 4px; font-weight: bold; margin-top: 2px; display: block; text-align: center; width: 100%; border: none; cursor: pointer;';
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
        <button id="add-top-product" style="width: 50%; padding: 2px 2px; background: black; color: white; border: none; border-radius: 4px; font-size: 16px; cursor: pointer;">Add</button>
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
        const lineItemId = existingItem.key;
        const existingUpsellQuantity = existingItem.properties?._upsellQuantity || 0;
        const existingIsUpsellOrigin = existingItem.properties?._isUpsellOrigin || null;
        
        await window.cartService.updateProductToCart(lineItemId, existingItem.quantity + quantity, {
          "_isUpsellOrigin": existingIsUpsellOrigin,
          "_upsellQuantity": parseInt(existingUpsellQuantity) + quantity
        });
      } else {
        // Add new item
        await window.cartService.addProductToCart(variantId, quantity, {
          "_isUpsellOrigin": true,
          "_upsellQuantity": quantity
        });
      }     
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
  }
};

async function initializeProductState() {
  return new Promise((resolve) => {
    // Find your custom quantity elements
    window.productPageState.productQuantityInput = document.getElementById('product-quantity-input');
    window.productPageState.productMinusButton = document.getElementById('product-quantity-minus');
    window.productPageState.productPlusButton = document.getElementById('product-quantity-plus');
    
    // Price element - multiple selectors for cross-theme compatibility
    const priceSelectors = [
      '.price-list'
    ];
    // Quantity element - multiple selectors for cross-theme compatibility
    const quantitySelectors = [
      ".product-form__info-item--quantity"
    ];
    // Quantity input - multiple selectors for cross-theme compatibility
    const quantityInputSelectors = [
      'input[name="quantity"]'
    ];
    // Cart/form selectors - multiple selectors for cross-theme compatibility
    const formSelectors = [
      '.product-form__buy-buttons'
    ];
    // Add to cart button - multiple selectors for cross-theme compatibility
    const addToCartSelectors = [
      'button[type="submit"]'
    ];
    // Variant picker - multiple selectors for cross-theme compatibility
    const variantPickerSelectors = [
      '.product-form__variants'
    ];
    
    // Find the first matching price element
    for (const selector of priceSelectors) {
      const priceElement = document.querySelector(selector);
      if (priceElement) {
        window.productPageState.original.productOriginalPriceElement = priceElement;
        break;
      }
    }
    
    // Find the first matching quantity element
    for (const selector of quantitySelectors) {
      const quantityElement = document.querySelector(selector);
      if (quantityElement) {
        window.productPageState.original.productOriginalQuantityElement = quantityElement;
        break;
      }
    }
    
    // First try to find the input within the quantity element if we found one
    if (window.productPageState.original.productOriginalQuantityElement) {
      for (const selector of quantityInputSelectors) {
        const quantityInput = window.productPageState.original.productOriginalQuantityElement.querySelector(selector);
        if (quantityInput) {
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
    
    // Find the first matching form element
    for (const selector of formSelectors) {
      const formElement = document.querySelector(selector);
      if (formElement) {
        window.productPageState.original.productOriginalCartButtons = formElement;
        break;
      }
    }
    
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
    
    // Find the first matching variant picker element
    for (const selector of variantPickerSelectors) {
      const variantElement = document.querySelector(selector);
      if (variantElement) {
        window.productPageState.original.productOriginalVariantPicker = variantElement;
        break;
      }
    }

    resolve();
  });
}

document.addEventListener('DOMContentLoaded', async function() {  
  initializeProductState();
});

function formatMoneyValueProperly(value, key) {
  var themeSettings = window.theme;

  value = value.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });

  if(key == 'money_format') {
    return themeSettings.moneyFormat.replace('{{amount}}', value);
  }

  if(key == 'money_with_currency_format') {
    return themeSettings.moneyWithCurrencyFormat.replace('{{amount}}', value);
  }

  return value;
}

function hideTopSellerButtonsIfBroken() {
  const input = document.getElementById('top-quantity-input');
  const plus = document.getElementById('top-quantity-plus');
  const minus = document.getElementById('top-quantity-minus');
  const group = document.getElementById('top-quantity-input-group');

  if (!input || !plus || !minus) return;

  const originalValue = parseInt(input.value, 10);
  if (isNaN(originalValue)) return;

  // Simulate increment
  plus.click();
  const afterPlus = parseInt(input.value, 10);
  input.value = originalValue;

  // Simulate decrement
  minus.click();
  const afterMinus = parseInt(input.value, 10);
  input.value = originalValue;

  const buttonsAreBroken = (afterPlus === originalValue && afterMinus === originalValue);

  if (buttonsAreBroken) {
    if (group) group.style.display = 'none';
  } else {
    if (group) group.style.display = '';
  }
}