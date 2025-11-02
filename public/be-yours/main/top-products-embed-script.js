let tpScript = document.currentScript || (function () {
  let tpScripts = document.getElementsByTagName('script');
  return tpScripts[tpScripts.length - 1];
})();

let tpUrl = new URL(tpScript.src);
let tpParams = new URLSearchParams(tpUrl.search);

// Extract the parameters
const tpConfig = {
  apiKey: tpParams.get("api_key"),
  appDomain: tpParams.get("appDomain"),
  customerId: tpParams.get("customerId"),
  shopId: tpParams.get("shopId"),
  shopDomain: tpParams.get("shopDomain"),
  storeType: tpParams.get("storeType"),
  timestamp: tpParams.get("timestamp"),
  hmac: tpParams.get("hmac"),
  productVariantId: tpParams.get("productVariantId"),
  productId: tpParams.get("productId"),
  enableTopProducts: tpParams.get("enableTopProducts"),
  authSignature: tpParams.get("authSignature")
};


(function() {
  // State management
  let topProductState = {
    priceElement: document.getElementById('top-product-price'),
    quantityInput: document.getElementById('top-quantity-input'),
    minusButton: document.getElementById('top-quantity-minus'),
    plusButton: document.getElementById('top-quantity-plus'),
    quantityInputGroup: document.querySelector('#top-product-embed quantity-input.quantity'),
    eventListenerFlags: {},
    customerId: tpConfig.customerId,
    productId: tpConfig.productId,
    variantId: tpConfig.productVariantId,
    shop: tpConfig.shopDomain,
    topProductVolumePricing: null,
    topProduct: null,
    addToCartTopProduct: document.getElementById('add-top-product'),
    topProductEmbed: document.getElementById('top-product-embed'),
    cartLineItems: null,
    cartItemsVariants: []
  };

  window.topProductState = topProductState

  let topProductPopupState = {
    topProductData: null,
    topProductVolumePricing: null,
    customerId: tpConfig.customerId,
    shop: tpConfig.shopDomain,
  }

  window.topProductEmbedSettings = {
    shop: tpConfig.shopDomain,
    customerId: tpConfig.customerId,
    appDomain: tpConfig.appDomain,
    apiKey: tpConfig.apiKey,
    timestamp: tpConfig.timestamp,
    hmac: tpConfig.authSignature
  };

  if (tpConfig.enableTopProducts === 'true') {
    checkCartDrawerAndToggle();
    
    const cartDrawer = document.querySelector('cart-drawer');
    if (cartDrawer) {
      const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
          if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
            checkCartDrawerAndToggle();
          }
        });
      });

      observer.observe(cartDrawer, { attributes: true });
    }
    
    setInterval(checkCartDrawerAndToggle, 1000);
  }
})();

  function createTopSellerElement() {
  const topSellerDiv = document.createElement('div');
  topSellerDiv.id = 'top-product-embed';
  topSellerDiv.style.display = 'none';
  topSellerDiv.innerHTML = window.generateTopSellerBlock();
  return topSellerDiv;
  }

  function showTopProductPopup(productInfo) {
    // Redirect to the product page with the specific variant
    const variantId = topProductExtractVariantIdFromGid(topProductState.variantId);
    const productUrl = `${productInfo.url}?variant=${variantId}`;
    window.location.href = productUrl;
  }

  async function addTopSellerToCart(variantId, quantity) {
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
    showComplementaryToast('Failed to add complementary product to cart. Please try again.', 'error');
  }
  }


  function insertTopSeller() {
    const MAX_ATTEMPTS = 10;
    let attempts = 0;

    async function tryInsert() {
      const cartDrawer = document.querySelector('cart-drawer');
      const drawerInner = cartDrawer?.querySelector('mini-cart');
      const miniCartInner = drawerInner?.querySelector('.mini-cart__inner');
      const drawerFooter = miniCartInner?.querySelector('.mini-cart__footer');
      if (!cartDrawer || !drawerInner || !miniCartInner) {
        if (attempts < MAX_ATTEMPTS) {
          attempts++;
          return setTimeout(tryInsert, 300); // Retry in 300ms
        } else {
          console.error('[TopSeller] Failed to find mini-cart__inner.');
          return;
        }
      }

      if (miniCartInner.querySelector('#top-product-embed')) {
        console.debug('[TopSeller] Already inserted.');
        return;
      }

      const topSellerDiv = createTopSellerElement();
      

      if (drawerFooter && miniCartInner.contains(drawerFooter)) {
        miniCartInner.insertBefore(topSellerDiv, drawerFooter);
      } else {
        miniCartInner.appendChild(topSellerDiv);
      }

      // Setup element references
      topProductState.priceElement = document.getElementById('top-product-price');
      topProductState.quantityInput = document.getElementById('top-quantity-input');
      topProductState.minusButton = document.getElementById('top-quantity-minus');
      topProductState.plusButton = document.getElementById('top-quantity-plus');
      topProductState.quantityInputGroup = document.querySelector('#top-product-embed quantity-input.quantity');
      topProductState.addToCartTopProduct = document.getElementById('add-top-product');
      topProductState.topProductEmbed = document.getElementById('top-product-embed');
      const topsellerTitle = document.getElementById('top-seller-title');

      if (topsellerTitle) {
        topsellerTitle.innerHTML = 'Don\'t miss out on a customer favorite!';
      }

          await fetchTopSeller();



      // Quantity input events
      if (!topProductState.eventListenerFlags.quantityInput && topProductState.quantityInput) {
        topProductState.quantityInput.addEventListener('input', () => {
          const config = topProductState.topProductVolumePricing?.volumeConfig || {};
          const min = config.minimum || 1;
          const max = config.maximum || Number.MAX_SAFE_INTEGER;

          let val = parseInt(topProductState.quantityInput.value, 10);
          if (isNaN(val)) val = min;

          topProductState.quantityInput.value = Math.min(max, Math.max(min, val));
          updateTopProductPrice();
        });
        topProductState.eventListenerFlags.quantityInput = true;
      }


      // Minus button
      if (topProductState.minusButton && !topProductState.eventListenerFlags.minusButton) {
        topProductState.minusButton.addEventListener('click', (e) => {
          e.preventDefault(); // Prevents form submission
                    alert(Number.MAX_SAFE_INTEGER);

          const config = topProductState.topProductVolumePricing?.volumeConfig || {};
          const min = config.minimum || 1;
          const inc = config.increment || 1;

          let current = parseInt(topProductState.quantityInput.value, 10) - inc;
          if (current < min) current = min;

          topProductState.quantityInput.value = current.toString();
          updateTopProductPrice();
        });
        topProductState.eventListenerFlags.minusButton = true;
      }

      
      // Plus button
      if (topProductState.plusButton && !topProductState.eventListenerFlags.plusButton) {
              topProductState.plusButton.addEventListener('click', (e) => {
                e.preventDefault(); // Prevents form submission
                const config = topProductState.topProductVolumePricing?.volumeConfig;
                if (!config) return;

                let currentValue = parseInt(topProductState.quantityInput.value, 10);
                let increment = topProductState.topProductVolumePricing.volumeConfig.increment || 1;
                let maxQuantity = topProductState.topProductVolumePricing.volumeConfig.maximum || Number.MAX_SAFE_INTEGER; // Default to Infinity if not specified

                // Calculate the next value that is higher and divisible by the increment
                let nextValue = currentValue;
                if (increment > 1) {
                    nextValue = Math.ceil((currentValue + 1) / increment) * increment;
                } 
                
                topProductState.quantityInput.value = Math.min(maxQuantity, nextValue).toString();
                updateTopProductPrice();
            });
        topProductState.eventListenerFlags.plusButton = true;
      }

      // Add to cart
      if (topProductState.addToCartTopProduct && !topProductState.eventListenerFlags.addToCart) {
        topProductState.addToCartTopProduct.onclick = async (e) => {
          e.preventDefault(); // Prevents form submission
          const variantGid = topProductState.variantId;
          const variantId = topProductExtractVariantIdFromGid(variantGid);
          const quantity = parseInt(topProductState.quantityInput.value, 10);
          try {
          await addTopSellerToCart(variantId, quantity);
          
          // update cart drawer data after add product into cart
          refreshCartDrawerAndCountNonDestructive();
          
          // ✅ Remove the top seller element after successful addition
          removeTopSeller();
          }catch(error){
            console.error('[TopSeller] Failed to add product to cart:', error);
          }
        };
        topProductState.eventListenerFlags.addToCart = true;
      }

    }

    tryInsert();
  }

 function removeTopSeller() {
  const topSellerElement = document.querySelector('#top-product-embed');
  if (topSellerElement) {
      topSellerElement.remove();
      // 🔁 Only reset relevant keys
      topProductState.variantId = null;
      topProductState.topProductVolumePricing = null;
      topProductState.priceElement = null;
      topProductState.quantityInput = null;
      topProductState.minusButton = null;
      topProductState.plusButton = null;
      topProductState.quantityInputGroup = null;
      topProductState.addToCartTopProduct = null;
      topProductState.topProductEmbed = null;

      // Reset flags only
      topProductState.eventListenerFlags = {
        quantityInput: false,
        minusButton: false,
        plusButton: false,
        addToCart: false
      };
      

    console.debug('[TopSeller] Top seller element removed.');
  } else {
    console.warn('[TopSeller] No element found to remove.');
  }
}


//  update cart data after product add from top seller
async function addTopSellerUsingUpdateCart(variantId, quantity, properties = {}) {
  const payload = {
    id: variantId,
    quantity: quantity,
    properties: properties
  };

  try {
    console.log('[TopSeller] Adding product via updateProductToCart...');
    await window.updateProductToCart(variantId, quantity, properties);
    console.log('[TopSeller] Product added and cart drawer refreshed!');
  } catch (err) {
    console.error('[TopSeller] Failed to add product via updateProductToCart', err);
  }
}


  function enableCartButtons() {
      const quantityButtons = document.querySelectorAll('.quantity__button');
      const savingsBadges = document.querySelectorAll('.savings-badge');
      quantityButtons.forEach(button => {
        button.disabled = false;
        button.style.cursor = 'pointer';
      });
      savingsBadges.forEach(badge => {
        badge.disabled = false;
        badge.style.cursor = 'pointer';
      });
  }

  function disableCartButtons() {
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

  function checkCartDrawerAndToggle() {
      const cartDrawer = document.querySelector('cart-drawer');
      if (cartDrawer) {
        const topSellerBlock = document.getElementById('top-product-embed');
        if (!topSellerBlock && tpConfig.enableTopProducts === 'true') {
          insertTopSeller();
          const savingsbadge = document.querySelectorAll('.savings-badge');
          if (savingsbadge.length === 0) {
            disableCartButtons();
            updateCartItemsUpsell();
            // workaround
            setTimeout(() => {
              updateCartItemsUpsell();
              enableCartButtons();
            }, 2000);
          }
        }
      } else {
        removeTopSeller();
      }
  }

  async function fetchTopProductVolumePricing() {
      return fetch(`https://${tpConfig.appDomain}/api/volume-pricing?shop=${topProductState.shop}&api_key=${tpConfig.apiKey}&timestamp=${tpConfig.timestamp}&hmac=${tpConfig.hmac}&customer=${topProductState.customerId}&productVariantId=${topProductState.variantId}`)
        .then(response => {
          return response.json();
        })
        .then(data => {
          topProductState.topProductVolumePricing = data;
          topProductState.quantityInput.value = data.volumeConfig.minimum;

          return data;
        })
        .catch(error => {
          console.error('Error fetching volume pricing:', error);
          throw error;
        });
  }

  async function fetchTopSeller() {
      var customerId = tpConfig.customerId;
      var shop = tpConfig.shopDomain;
      var cart = await window.cartService.getCart();

      if (!customerId || tpConfig.enableTopProducts !== 'true') {
        return;
      }

      const lineItems = cart.items.map(x => { 
        return {product_id: x.product_id, variant_id: x.variant_id}
      });

      topProductState.cartLineItems = lineItems;

      if (lineItems.length === 0) {
        topProductState.topProductEmbed.style.display = 'none';
        return;
      }

      try {
        const response = await fetch(`https://${tpConfig.appDomain}/api/top-products?shop=${shop}&customer=${customerId}&api_key=${tpConfig.apiKey}&timestamp=${tpConfig.timestamp}&hmac=${tpConfig.hmac}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ lineItems }),
        });
        const data = await response.json();
        if (data.error) {
          console.error(data.error);
          return;
        }
        topProductState.variantId = data.productVariantId;
        topProductState.topProduct = data;
        const pricing = await fetchTopProductVolumePricing();
        const quantityInput = document.getElementById('top-quantity-input');
        updateTopSellerUI(data, pricing);
      } catch (error) {
        console.error('Error:', error);
      }
  }

  function updateTopProductPrice() {
  const state = window.topProductState;

  if (!state) {
    console.error('topProductState is not available');
    return;
  }

  console.log(state.quantityInput);

  if (!state.quantityInput) {
    console.error('quantityInput element is not available');
    if (state.priceElement) {
      state.priceElement.textContent = 'Quantity input missing';
    }
    return;
  }

  let quantity = parseInt(state.quantityInput.value, 10);

  if (!state.topProductVolumePricing || !state.topProductVolumePricing.priceConfig) {
    console.error('Price config is missing');
    if (state.priceElement) {
      state.priceElement.textContent = 'Price config missing';
    }
    return;
  }

  const priceInfo = state.topProductVolumePricing.priceConfig.find(
    p => quantity >= p.quantity && quantity <= p.maxQuantity
  );

  if (priceInfo) {
    if (state.priceElement) {
      state.priceElement.innerHTML = window.generateTopProductPriceElement(priceInfo);
    } else {
      console.error('priceElement is not available');
    }
  } else {
    if (state.priceElement) {
      state.priceElement.textContent = 'Price not available';
    } else {
      console.error('priceElement is not available');
    }
  }
  }



    function updateTopSellerUI(data, pricing) {
      const topprodembed = document.getElementById('top-product-embed');
      if (topprodembed) {
        topprodembed.style.display = 'block';
        var img = document.getElementById('top-product-image');
        const productUrl = `${data.productInfo.url}?variant=${topProductExtractVariantIdFromGid(data.productVariantId)}`;
        
        // Create wrapper link for image
        const imagecontainer = document.getElementById('top-product-image-container');
        imagecontainer.href = productUrl;
        imagecontainer.style.cursor = 'pointer';     
        img.src = data.productInfo.image;
        document.getElementById('animated-placeholder').style.display = 'none';
        
        img.onload = function() {
          img.style.opacity = '1';
        };
        img.onerror = function() {
          console.error('Failed to load image:', data.productInfo.image);
        };

        // Create title with link
        const titleText = data.productInfo.title + ' ' + (data.productInfo.variantTitle && data.productInfo.variantTitle.toLowerCase() === 'default title' ? '' : data.productInfo.variantTitle);
        document.getElementById('top-product-title').innerHTML = `
          <a href="${productUrl}" style="text-decoration: none; color: inherit; cursor: pointer;">
            ${titleText}
          </a>
        `;
        
        updateTopProductPrice();  
      }    
    }

    async function addTopSellerToCart(variantId, quantity) {
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
        showComplementaryToast('Failed to add complementary product to cart. Please try again.', 'error');
      }
    }
    
    async function waitForCartService(retries = 10, delay = 200) {
    for (let i = 0; i < retries; i++) {
      if (window.cartService && typeof window.cartService.getCart === 'function') return;
      await new Promise(res => setTimeout(res, delay));
    }
    throw new Error("cartService.getCart not available after waiting");
      }

    async function updateCartItemsUpsell() {
    const cartItemElements = document.querySelectorAll('cart-items ul.mini-cart__navigation > li');
      topProductState.cartItemsVariants = Array.from(cartItemElements).map(item => {
          const href = item.querySelector('a[href*="variant="]')?.href;
          if (!href) return null;
          return href.split('variant=')[1];
      }).filter(id => id);

      // Get quantity inputs (assuming they exist somewhere inside each li)
      topProductState.cartQuantityInputs = Array.from(cartItemElements).map(item => {
          return item.querySelector('input[name="updates[]"]'); // Adjust selector if your input structure is different
      }).filter(input => input);

    for (let i = 0; i < topProductState.cartItemsVariants.length; i++) {
        const input = topProductState.cartQuantityInputs[i];
        const variantId = topProductState.cartItemsVariants[i];
        const itemElement = cartItemElements[i];

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

        const setInputConstraints = (input, config) => {
            if (!input) return;
            input.readOnly = true;
            input.min = config.volumeConfig.minimum;
            input.max = config.volumeConfig.maximum;
            input.step = config.volumeConfig.increment;
        };

        setInputConstraints(input, volumeConfig);

        if (input) {
            input.addEventListener('change', async () => {
                disableCartButtons();

                try {
                    const data2 = await window.productPricingService.getVolumePricingByProductVariantId(
                        tpConfig.appDomain,
                        topProductState.shop,
                        tpConfig.apiKey,
                        tpConfig.timestamp,
                        tpConfig.hmac,
                        topProductState.customerId,
                        variantId
                    );
                    setInputConstraints(input, data2);

                    setTimeout(async () => {
                        const newcartData = await window.cartService.getCart();
                        const cartLineItem = newcartData.items[i];

                        if (cartLineItem.properties._isUpsellOrigin) {
                            const properties = {
                                ...cartLineItem.properties,
                                '_upsellQuantity': cartLineItem.quantity
                            };
                            await addTopSellerToCart(variantId, cartLineItem.quantity, properties);
                        }
                    }, 2000);
                } catch (error) {
                    console.error('Error processing cart update:', error);
                } finally {
                    enableCartButtons();
                }
            });
        }

        // Create savings badge button
        const existingSavings = document.getElementById(`savings-badge-${variantId}`);
        if (existingSavings) existingSavings.remove();

        const savingsButton = document.createElement('button');
        savingsButton.id = `savings-badge-${variantId}`;
        savingsButton.className = 'savings-badge';
        console.log("itemElementitemElement",itemElement);

        const currentQty = parseInt(input?.value || itemElement.getAttribute('data-quantity')) || 0;
        const nextTier = volumeConfig.priceConfig.find(tier => tier.quantity > currentQty) || volumeConfig.priceConfig[0];
        const diff = nextTier.quantity - currentQty;

        if (!nextTier || diff <= 0) continue;

        if (discountType === 'fixedAmount') {
            savingsButton.innerHTML = `Add ${diff} more, save ${fixDecimals(nextTier.discountAmount)}`;
        } else {
            savingsButton.innerHTML = `Add ${diff} more, save ${nextTier.percentage}%`;
        }

        savingsButton.style.cssText = savingsButtonCssText();
        savingsButton.onclick = async (e) => {
            e.preventDefault();
            savingsButton.disabled = true;
            savingsButton.style.cursor = 'not-allowed';

            const newVariantId = topProductExtractVariantIdFromGid(variantId);
            const cartData = await window.cartService.getCart();
            const properties = cartData.items[i]?.properties || {};
            await addTopSellerToCart(newVariantId, diff, properties);
            const newQty = currentQty + diff;
            if (input) input.value = newQty;


            savingsButton.disabled = false;
            savingsButton.style.cursor = 'pointer';
        };


        const container = itemElement.querySelector('.cart-item__error') || itemElement;
        container.appendChild(savingsButton);
    }
    }
