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
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            items: [{
              id: variantId,
              quantity: quantity,
              properties: properties
            }],
            sections: ['cart-drawer', 'header']
          })
        });
    
        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(`HTTP error! status: ${response.status}, message: ${JSON.stringify(errorData)}`);
        }
    
        return await response.json(); 
      } catch (error) {
        alert('Failed: '+error.message);
      }
    },
    updateProductToCart: async function(variantId, quantity, properties = {}) {
      try {
        const response = await fetch('/cart/change.js', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: variantId,
            quantity: quantity,
            properties: properties,
            sections: ['cart-drawer', 'header']
          })
        });
    
        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(`HTTP error! status: ${response.status}, message: ${JSON.stringify(errorData)}`);
        }
    
        return await response.json();  
      } catch (error) {
        console.error('Error updating cart:', error);
        alert('Failed: '+error.message);
      }
    },
    getCart: async function () {
      try {
        const response = await fetch('/cart.js', {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' }
        });
        return await response.json();
      } catch (error) {
        console.error('Error fetching cart:', error);
        throw error;
      }
    },

    openCartDrawer: function () {
      const selector = document.querySelector('label.minicart__label[for="minicart__button--header--inline-search"]');
      if(selector) {
        selector.click();
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

  const addToCartButtonSelector = document.querySelector('form.shopify-product-form button.button--addToCart');
  if(addToCartButtonSelector) {
    addToCartButtonSelector.addEventListener('click', async function (e) {
      if (Object.hasOwn(window.productPageState, 'skipEvent') && window.productPageState.skipEvent === true) {
        return;
      }

      e.preventDefault();
      e.stopImmediatePropagation();
      
      const eTarget = e.target;
      const form = eTarget.closest('form');
      eTarget.innerHTML = 'Adding...';
      if (form) {
        const variantId = form.querySelector('[name="id"]')?.value;
        let quantity = document.getElementById('product-quantity-input')?.value || document.querySelector('.quantity__input')?.value || 1;  
      
        const cart = await window.cartService.getCart();
        const existingItem = cart.items.find(item => item.variant_id === parseInt(variantId));
        if (existingItem) {
          await window.cartService.updateProductToCart(existingItem.key, existingItem.quantity + parseInt(quantity), existingItem.properties);
        } else {
          await window.cartService.addProductToCart(variantId, quantity, null);
        }

        if (tspConfig.enableTopProducts === 'true') {
          window.topSellerPopupService.createTopSellerPopup();
          const lineItems = cart.items.map(x => {
            return {product_id: x.product_id, variant_id: x.variant_id, quantity: x.quantity}
          });
          if(lineItems.length === 0){
            setTimeout(async () => {
              await window.displayTopSellerPopup();
            }, 500);
          } 
        }
      }
      eTarget.innerHTML = 'Add to cart';
      
    }, true);
  }
  
  const variantPickerSelector = document.querySelector('div[data-dynamic-variants-enabled]');
  if(variantPickerSelector) {
    variantPickerSelector.addEventListener('click', function () {
      setTimeout(async ()=> {
        location.reload(); 
      }, 500);
    });
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
        } else {
          const response = await fetch(`https://${appDomain}/api/volume-pricing?shop=${shopDomain}&api_key=${apiKey}&timestamp=${timestamp}&hmac=${hmac}&customer=${customerId}&productId=${productId}`);
          data = await response.json();
          window.indexDBService.saveToIndexedDb(productId, data, window.indexDBService.DB_VOLUME_PRICING);
        }
        return data;    
      } catch (error) {
        console.error('Error fetching volume pricing:', error);
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
        } else {
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
      productOriginalAddToCartButton: null
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
          <div id="product-price" class="product__price--holder product__price--ppPrice font__family--base font__size--medium margin__bottom--reduced" style="display: none;"></div>
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
        } else {
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
            <p id="complementary-product-price" style="display: none; margin: 4px 0 0; font-size: 15px; color:white !important"></p>
          </div>
        </div>
        <div class="tooltip">
          <span id="complementary-product-description" style="color: #fff; margin-bottom: 20px; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; text-overflow: ellipsis; line-height: 1.4;">
          </span>
          <span id="complementary-product-description-tooltip" class="tooltiptext"></span>
        </div>
        <div style="display: flex; align-items: center; margin-bottom: 16px;">
          <div id="complementary-quantity-input-group" style="display: none; border: 1px solid #ccc; border-radius: 4px; width: fit-content; margin-right: 16px;">
            <button id="complementary-quantity-minus" style="width: 40px; height: 40px; background: none; border: none; border-right: 1px solid #ccc; font-size: 16px; cursor: pointer;">−</button>
            <input id="complementary-quantity-input" style="width: 40px; height: 40px; border: none; font-size: 16px; text-align: center;" value="1" readonly>
            <button id="complementary-quantity-plus" style="width: 40px; height: 40px; background: none; border: none; border-left: 1px solid #ccc; font-size: 16px; cursor: pointer;">+</button>
          </div>
        </div>
        <p id="complementary-volume-quantities" style="margin: 5px; font-size: 12px; color: #ddd;"></p>
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
              <h2 id="cp-ts-header-text" style="font-weight: bold; margin-bottom: 10px;color: black"></h2>
              <p id="cp-ts-selling-point" style="color: black; margin-bottom: 20px;"></p>
              
              <div style="margin-bottom: 20px;">
                <div style="display: flex; justify-content: center; align-items: center; margin-bottom: 20px;">
                  <span id="cp-ts-loading-spinner" class="loading-spinner"></span>
                  <img style="display: none; max-width: 100%; height: 250px;" id="cp-ts-product-image" src="">
                </div>
                
                <a href="#" id="cp-ts-product-title" style="display: block; font-weight: bold; margin-bottom: 10px; color: #000; text-decoration: none;"></a>
                
                <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 15px;">
                  <p id="cp-ts-product-wholesale-price" style="font-size: 1.2em; font-weight: bold; margin: 0;color: black"></p>
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
              </div>
              <p id="cp-ts-quantity-info" style="font-size: 14px; color: #666; margin: 20px 0px;"></p>
  
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
      popupDiv.style.display = 'none'; // initially hidden
      popupDiv.style.justifyContent = 'center';
      popupDiv.style.alignItems = 'center';

      // Additional styles from the CSS
      popupDiv.style.position = 'fixed'; // you likely need positioning
      popupDiv.style.right = '0';
      popupDiv.style.left = 'auto';
      popupDiv.style.height = '100%';
      popupDiv.style.width = '30rem';
      popupDiv.style.background = '#fff';
      popupDiv.style.padding = '20px';
      popupDiv.style.flexDirection = 'column'; // optional depending on layout
      popupDiv.style.alignItems = 'flex-start'; // overridden from 'center' above
      
      popupDiv.innerHTML = window.topSellerPopupService.generateTopSellerPopup();
  
      document.body.appendChild(popupDiv);
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

function unlockScroll() {
  document.body.style.overflow = '';
}

function topProductExtractVariantIdFromGid(gid) {
  const parts = gid.split('/');
  return parts[parts.length - 1];
}

if(!window.reloadPageWithCartOpen) {
  window.reloadPageWithCartOpen = function (param, value) {
    const url = new URL(window.location.href);
    const params = new URLSearchParams(url.search);
    params.set(param, value);
    url.search = params.toString();
    window.location.href = url.toString();
  }
}

function generateTopSellerBlock() {
  return `
    <div id="topseller-product-block" style="position: relative; background-color: #f8faf9;">        
      <div style="font-weight: bold; color: black; padding: 8px; text-align: start; margin-bottom: 15px;">
        <h5 id="top-seller-title" style="margin: 0; color: black; font-weight: bold;"></h5>
      </div>
      <div id="top-product-details" style="display: flex; align-items: center; gap: 15px; margin-bottom: 15px; padding: 10px;">
        <a href="#" id="top-product-image-container" style="width: 60px; height: 60px; position: relative; flex-shrink: 0;">
          <div id="animated-placeholder" style="width: 100%; height: 100%; position: absolute; background: linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%); background-size: 200% 100%; animation: loading 1.5s infinite;"></div>
          <img id="top-product-image" src="" alt="Top Seller Product" style="max-width: 100%; max-height: 100%; position: absolute; top: 0; left: 0; opacity: 0; transition: opacity 0.3s ease;">
        </a>
        <div style="flex-grow: 1;">
          <h3 id="top-product-title" style="color: black; font-weight: 500; margin: 0 0 5px; font-size: 16px;">Loading...</h3>
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

//Top product embed utils
window.topProductEmbedUtils = {
  addTopSellerToCart: async function(variantId, quantity) {
    try {
      const cart = await window.cartService.getCart();
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
    
    // ========== ROBUST SELECTORS FOR ORIGINAL ELEMENTS ==========
    
    // Price element - multiple selectors for cross-theme compatibility
    const priceSelectors = [
      'form.shopify-product-form .product__price--ppPrice'
    ];
    
    // Find the first matching price element
    for (const selector of priceSelectors) {
      const priceElement = document.querySelector(selector);
      if (priceElement) {
        window.productPageState.original.productOriginalPriceElement = priceElement;
        break;
      }
    }
    
    // Quantity element - multiple selectors for cross-theme compatibility
    const quantitySelectors = [
      "form.shopify-product-form div.quantity--input"
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
      'input.quantity__input',
      'input[name="quantity"]',
      '[aria-label="Quantity"]',
      'input.js-qty__input',
      'input.quantity-selector__input',
      '.product-form__input--quantity input',
      '.product-quantity input'
    ];
    
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
    
    // Cart/form selectors - multiple selectors for cross-theme compatibility
    const formSelectors = [
      'form.shopify-product-form'
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
      'form.shopify-product-form button.button--addToCart'
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
          console.log('selector worked here 2', selector);
          window.productPageState.original.productOriginalAddToCartButton = addButton;
          break;
        }
      }
    }

    resolve();
  });
}

document.addEventListener('DOMContentLoaded', async function() {  
  initializeProductState();
});

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