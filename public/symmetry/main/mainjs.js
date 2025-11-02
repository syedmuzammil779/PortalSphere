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
        console.debug('Adding variant to cart:', variantId, 'Quantity:', quantity);
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
            sections: ['cart-drawer', 'header']
          })
        });

        if (!response.ok) {
          const errorData = await response.json();
          console.error('Error response:', errorData);
          throw new Error(`HTTP error! status: ${response.status}, message: ${JSON.stringify(errorData)}`);
        }

        const result = await response.json();
        console.debug('Product added to cart:', result);

        // Update the cart drawer with the new HTML
        document.dispatchEvent(new Event("dispatch:cart-drawer:refresh"))
        document.dispatchEvent(new Event("on:cart:change"))
        document.dispatchEvent(new Event("dispatch:cart-drawer:open"))
      } catch (error) {
        console.error('Error adding product to cart:', error);
        alert('Failed to add product to cart. Please try again.');
      }
    },
    updateProductToCart: async function(variantId, quantity, properties = {}) {
      try {
        console.debug('Updating cart line:', variantId, 'New Quantity:', quantity);
        const response = await fetch('/cart/change.js', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            id: variantId,
            quantity: quantity,
            properties: properties,
            sections: ['cart-drawer', 'header']
          })
        });

        if (!response.ok) {
          const errorData = await response.json();
          console.error('Error response:', errorData);
          throw new Error(`HTTP error! status: ${response.status}, message: ${JSON.stringify(errorData)}`);
        }

        const result = await response.json();
        console.debug('Cart line updated:', result);

        document.dispatchEvent(new Event("dispatch:cart-drawer:refresh"))
        document.dispatchEvent(new Event("on:cart:change"))
        document.dispatchEvent(new Event("dispatch:cart-drawer:open"))
      } catch (error) {
        console.error('Error updating cart:', error);
        alert('Failed to update cart. Please try again.');
      }
    },
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
        console.debug('Cart fetched:', cart);
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

  const addToCartButtonSelector = document.querySelector('button[name="add"][type="submit"]');
  if(addToCartButtonSelector) {
    addToCartButtonSelector.addEventListener('click', async function (event) {
      if (Object.hasOwn(window.productPageState, 'skipEvent') && window.productPageState.skipEvent === true) {
        return;
      }
      event.preventDefault();
      event.stopImmediatePropagation();
      // Get the form element
      const form = event.target.closest('form');
      if (form) {
        const variantId = form.querySelector('[name="id"]')?.value;
        let quantity = document.getElementById('product-quantity-input')?.value || document.querySelector('.quantity__input')?.value || 1;
        const cart = await window.cartService.getCart();
        const existingItem = cart.items.find(item => item.variant_id === parseInt(variantId));
        if (existingItem) {
          window.cartService.updateProductToCart(existingItem.key, existingItem.quantity + parseInt(quantity), existingItem.properties);
        } else {
          window.cartService.addProductToCart(variantId, quantity, null);
        }
      }
    });
  }

  const variantPicker = document.querySelector('variant-picker');
  if(variantPicker) {
    variantPicker.addEventListener('click', function () {
      setTimeout(() => {
        location.reload();
      }, 250);
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
        }
        else {
          const response = await fetch(`https://${appDomain}/api/volume-pricing?shop=${shopDomain}&api_key=${apiKey}&timestamp=${timestamp}&hmac=${hmac}&customer=${customerId}&productId=${productId}`);
          data = await response.json();
          window.indexDBService.saveToIndexedDb(productId, data, window.indexDBService.DB_VOLUME_PRICING);
        }
        console.debug('Volume Pricing Service:', data);
        return data;
      } catch (error) {
        console.error('Error fetching volume pricing:', error);
        throw error;
      }
    },
    getVolumePricingBulkByHandleArray: async function (appDomain, shopDomain, apiKey, timestamp, hmac, customerId, handleArr) {
      let data = null;

      try {
        const response = await fetch(`https://${appDomain}/api/volume-pricing-handle-bulk`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
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
      }
      catch (error) {
        throw error
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
        console.debug('Volume Pricing Service:', data);
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
          <p id="product-price" style="display: none; margin: 0 0 10px;"></p>
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
        console.debug('Complementary Product Service:', data);
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
          <div class="tooltip">
            <p id="complementary-product-description" style="color: #000; margin-bottom: 20px; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; text-overflow: ellipsis; line-height: 1.4;">
            </p>
            <span id="complementary-product-description-tooltip" class="tooltiptext"></span>
          </div>
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
        <div class="topseller-popup-content" style="max-width: 40rem; background-color: white; height: 100%; padding: 20px;">
          <div style="padding: 20px; height: 100%; display: flex; flex-direction: column;">
            <button id="close-top-seller-popup" style="background: none; border: none; font-size: 32px; cursor: pointer; position: absolute; top: 10px; right: 15px; color: #333; z-index: 10;" aria-label="Close">&times;</button>

            <div style="flex-grow: 1; overflow-y: auto; scrollbar-width: none; -ms-overflow-style: none;">
              <h2 id="cp-ts-header-text" style="font-weight: bold; margin-bottom: 10px;"></h2>
              <p id="cp-ts-selling-point" style="color: black; margin-bottom: 20px;"></p>

              <div style="margin-bottom: 20px;">
                <div style="display: flex; justify-content: center; align-items: center; margin-bottom: 20px;">
                  <span id="cp-ts-loading-spinner" class="loading-spinner"></span>
                  <img style="display: none; max-width: 100%; height: 270px;" id="cp-ts-product-image" src="">
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
      popupDiv.style.display = 'none'; // initially hidden
      popupDiv.style.justifyContent = 'center';
      popupDiv.style.alignItems = 'center';

      // Additional styles from the CSS
      popupDiv.style.position = 'fixed'; // you likely need positioning
      popupDiv.style.right = '0';
      popupDiv.style.left = 'auto';
      popupDiv.style.height = '100%';
      popupDiv.style.width = '100%';
      popupDiv.style.background = '#00000050';
      popupDiv.style.flexDirection = 'column'; // optional depending on layout
      popupDiv.style.zIndex = '1000000000000';
      popupDiv.style.alignItems = 'flex-end'; // overridden from 'center' above

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
      '.shogun-cart-drawer'
    ];

    // Try to find the cart drawer using the list of selectors
    let cartDrawer = null;

    for (const selector of cartDrawerSelectors) {
      const element = document.querySelector(selector);
      if (element) {
        cartDrawer = element;
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
      ".portalspere__productpage__price__selector",
      '[id*="price-template"][id$="__main"]',
      '.price--large',
      '.product__price',
      '.product-single__price',
      '[data-product-price]',
      '.price-item--regular',
      '.product-price',
      'span[data-price]',
      '.product-form__info-item--price',
      '.product-page--pricing',
      '.price',
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
      ".portalspere__productpage__quantity__selector",
      '[id*="Quantity-Form-template"][id$="__main"]',
      ".product-form__info-item--quantity",
      '.product-form__quantity',
      '.product-single__quantity',
      '.quantity-selector',
      '.js-qty',
      '[data-quantity-input]',
      '.quantity-wrapper',
      '.product-form__input--quantity',
      '.product-form__info-content', // warehouse theme
      '.quantity',
      '.product-quantity'
    ];

    // Find the first matching quantity element
    for (const selector of quantitySelectors) {
      const quantityElement = document.querySelector("quantity-wrapper");
      window.productPageState.original.productOriginalQuantityElement = quantityElement;
    }


    // First try to find the input within the quantity element if we found one
    if (window.productPageState.original.productOriginalQuantityElement) {
        const quantityInput = window.productPageState.original.productOriginalQuantityElement.querySelector("quantity-wrapper input#quantity");
        window.productPageState.original.productOriginalQuantityInput = quantityInput;
    }

    // Cart/form selectors - multiple selectors for cross-theme compatibility
    const formSelectors = [
      'form[action="/cart/add"]'
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
      'button[name="add"]'
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

    /*
    // Log success or failure for debugging
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
