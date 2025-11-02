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
    
    const drawer = document.querySelector('#theme-ajax-cart');
    if (drawer) {
      const observer = new MutationObserver(() => {
        checkCartDrawerAndToggle();
      });

      observer.observe(drawer, { attributes: true, childList: true, subtree: true });
    }

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

  function waitForDrawerAndInsertTopSeller() {
  const drawer = document.querySelector('cart-drawer');
  const observer = new MutationObserver(() => {
    const ready = drawer?.querySelector('.cart-drawer__footer');
    if (ready) {
      observer.disconnect();
      insertTopSeller();
        const cartFooter = document.querySelector('.cart-drawer__footer');
    // ⬇ Show popup + hide footer
      if (cartFooter) cartFooter.style.display = '';
      
    }
  });
  observer.observe(drawer, { childList: true, subtree: true });
}


  function insertTopSeller() {
  const MAX_ATTEMPTS = 10;
  let attempts = 0;
   async function tryInsert() {
    // Select all drawers
    const allDrawers = document.querySelectorAll('#theme-ajax-cart .ajax-cart--drawer');

    // Find one that is NOT inside a .mobile-header
    let cartDrawer = null;
    allDrawers.forEach(drawer => {
      if (!drawer.closest('.mobile-header')) {
        cartDrawer = drawer;
      }
    });

    if (!cartDrawer) {
      if (attempts < MAX_ATTEMPTS) {
        attempts++;
        return setTimeout(tryInsert, 300);
      } else {
        console.error('[TopSeller] No suitable cart drawer (non-mobile) found.');
        return;
      }
    }

    const miniCartInner = cartDrawer.querySelector('#ajax-cart__content');
    const cartFooter = miniCartInner?.querySelector('.ajax-cart__details-wrapper');

    if (!miniCartInner || !cartFooter) {
      console.warn('[TopSeller] Missing cart content or footer.');
      return;
    }

    if (miniCartInner.querySelector('#top-product-embed')) {
      console.debug('[TopSeller] Already inserted.');
      return;
    }

    const topSellerDiv = createTopSellerElement();

    if (cartFooter && cartFooter.parentNode === miniCartInner) {
      miniCartInner.insertBefore(topSellerDiv, cartFooter);
    } else {
      console.warn('[TopSeller] cartFooter is not a direct child. Appending instead.');
      miniCartInner.appendChild(topSellerDiv);
    }

    // Setup element references
    topProductState.priceElement = document.getElementById('top-product-price');
    topProductState.quantityInput = document.getElementById('top-quantity-input');
    topProductState.minusButton = document.getElementById('top-quantity-minus');
    topProductState.plusButton = document.getElementById('top-quantity-plus');
    topProductState.quantityInputGroup = document.querySelector('#top-product-embed .quantity-input.quantity');
    topProductState.addToCartTopProduct = document.getElementById('add-top-product');
    topProductState.topProductEmbed = document.getElementById('top-product-embed');

    const topsellerTitle = document.getElementById('top-seller-title');
    if (topsellerTitle) {
      topsellerTitle.innerHTML = 'Don\'t miss out on a customer favorite!';
    }

    console.log("[TopSeller] Fetching product info...");
    await fetchTopSeller();

    // Quantity input event
    if (!topProductState.eventListenerFlags.quantityInput && topProductState.quantityInput) {
      topProductState.quantityInput.addEventListener('input', (e) => {
        e.preventDefault();
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

    // Minus
    if (topProductState.minusButton) {
      topProductState.minusButton.addEventListener('click', (e) => {
        e.preventDefault();
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

    // Plus
    if (topProductState.plusButton) {
      topProductState.plusButton.addEventListener('click', (e) => {
        e.preventDefault();
        const config = topProductState.topProductVolumePricing?.volumeConfig || {};
        if (!config) return;

        let currentValue = parseInt(topProductState.quantityInput.value, 10);
        let increment = config.increment || 1;
        let maxQuantity = config.maximum || Number.MAX_SAFE_INTEGER;

        let nextValue = currentValue;
        if (increment > 1) {
          nextValue = Math.ceil((currentValue + 1) / increment) * increment;
        }

        topProductState.quantityInput.value = Math.min(maxQuantity, nextValue).toString();
        updateTopProductPrice();
      });
      topProductState.eventListenerFlags.plusButton = true;
    }

    // Add to Cart
    if (topProductState.addToCartTopProduct) {
      topProductState.addToCartTopProduct.onclick = async (e) => {
        e.preventDefault();
        const variantGid = topProductState.variantId;
        const variantId = topProductExtractVariantIdFromGid(variantGid);
        const quantity = parseInt(topProductState.quantityInput.value, 10);
        try {
          await addTopSellerToCart(variantId, quantity);
          refreshCartDrawerSections();
          setTimeout(() => waitForDrawerAndInsertTopSeller(), 50);
          removeTopSeller();
        } catch (error) {
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
    // console.log('[TopSeller] Adding product via updateProductToCart...');
    await window.updateProductToCart(variantId, quantity, properties);
    // console.log('[TopSeller] Product added and cart drawer refreshed!');
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
  const drawer = document.querySelector('#theme-ajax-cart');
  if (!drawer) {
    // Drawer container not in DOM, remove if exists
    removeTopSeller();
    return;
  }

  // Check if drawer is visible/open — adjust this based on your theme
  const isOpen = drawer.classList.contains('open') || drawer.style.display !== 'none' || drawer.offsetParent !== null;
  // Or you can tweak based on your actual drawer open state detection

  if (!isOpen) {
    removeTopSeller();
    return;
  }

  // Drawer is open, check if top product embed is already inserted
  const topSellerBlock = document.getElementById('top-product-embed');

  // Also check if drawer content is loaded — e.g. .ajax-cart__list exists and has children
  const drawerContent = drawer.querySelector('.ajax-cart__list');

  if (!drawerContent || drawerContent.children.length === 0) {
    // Drawer content not loaded yet, wait and retry
    return;
  }

  if (!topSellerBlock && tpConfig.enableTopProducts === 'true') {
    insertTopSeller();

    const savingsbadge = document.querySelectorAll('.savings-badge');
    if (savingsbadge.length === 0) {
      updateCartItemsUpsell();

      setTimeout(() => {
        updateCartItemsUpsell();
        enableCartButtons();
      }, 100);
    }
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
        // console.log(`https://${tpConfig.appDomain}/api/top-products?shop=${shop}&customer=${customerId}&api_key=${tpConfig.apiKey}&timestamp=${tpConfig.timestamp}&hmac=${tpConfig.hmac}`);
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
        if(data.productVariantId){
          topProductState.variantId = data.productVariantId.split('/').pop();
          topProductState.topProduct = data;
          const pricing = await fetchTopProductVolumePricing();
          const quantityInput = document.getElementById('top-quantity-input');
          updateTopSellerUI(data, pricing);
        }
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
  console.log("state.quantityInput");

  if (!state.quantityInput) {
    console.error('quantityInput element is not available');
    if (state.priceElement) {
      state.priceElement.textContent = 'Quantity input missing';
    }
    return;
  }

  let quantity = parseInt(state.quantityInput.value, 10);
  console.log('topProductVolumePricing:', state.topProductVolumePricing);
  console.log('priceConfig:', state.topProductVolumePricing?.priceConfig);



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
  const cartItemElements = document.querySelectorAll('#theme-ajax-cart .ajax-cart__list .ajax-cart__product');

  topProductState.cartItemsVariants = Array.from(cartItemElements).map(item => {
    const dataCartItem = item.getAttribute('data-cart-item') || '';
    return dataCartItem.split(':')[0] || null;
  }).filter(Boolean);

  topProductState.cartQuantityInputs = [];

  for (let i = 0; i < topProductState.cartItemsVariants.length; i++) {
    const variantId = topProductState.cartItemsVariants[i];
    const itemElement = cartItemElements[i];

    // Select fresh input every iteration (DOM might have changed)
    const input = itemElement.querySelector('input.quantity-input');

    if (!input) {
      console.warn(`[TopSeller] No quantity input found for variant ${variantId}, skipping.`);
      continue;
    }
    if (!variantId || !itemElement) {
      console.warn(`[TopSeller] Missing data for index ${i}, skipping.`);
      continue;
    }

    let volumeConfig;
    try {
      volumeConfig = await window.productPricingService.getVolumePricingByProductVariantId(
        tpConfig.appDomain,
        topProductState.shop,
        tpConfig.apiKey,
        tpConfig.timestamp,
        tpConfig.hmac,
        topProductState.customerId,
        variantId
      );
    } catch (err) {
      console.error(`[TopSeller] Error fetching volume pricing for variant ${variantId}:`, err);
      continue;
    }

    const discountType = volumeConfig.type;

    // Set constraints function
    const setInputConstraints = (inputEl, config) => {
      if (!inputEl || !config.volumeConfig) return;
      inputEl.readOnly = true;
      inputEl.min = config.volumeConfig.minimum;
      inputEl.max = config.volumeConfig.maximum;
      inputEl.step = config.volumeConfig.increment;
    };

    setInputConstraints(input, volumeConfig);

    // Clone input to remove listeners
    const newInput = input.cloneNode(true);
    const parent = input.parentNode;

    if (!parent) {
      console.warn(`[TopSeller] Input for variant ${variantId} has no parent node, skipping replacement.`);
      topProductState.cartQuantityInputs[i] = input; // fallback keep old input
      continue;
    }

    if (!parent.contains(input)) {
      console.warn(`[TopSeller] Parent does not contain input for variant ${variantId}, skipping replacement.`);
      topProductState.cartQuantityInputs[i] = input; // fallback keep old input
      continue;
    }

    // Safe to replace
    try {
      parent.replaceChild(newInput, input);
      topProductState.cartQuantityInputs[i] = newInput;
    } catch (error) {
      console.error(`[TopSeller] Failed to replace input for variant ${variantId}:`, error);
      topProductState.cartQuantityInputs[i] = input; // fallback
      continue;
    }

    newInput.addEventListener('change', async () => {
      disableCartButtons();
      try {
        const updatedData = await window.productPricingService.getVolumePricingByProductVariantId(
          tpConfig.appDomain,
          topProductState.shop,
          tpConfig.apiKey,
          tpConfig.timestamp,
          tpConfig.hmac,
          topProductState.customerId,
          variantId
        );
        setInputConstraints(newInput, updatedData);

        setTimeout(async () => {
          const newCartData = await window.cartService.getCart();
          const cartLineItem = newCartData.items.find(item => item.variant_id == variantId);

          if (cartLineItem?.properties?._isUpsellOrigin) {
            const properties = {
              ...cartLineItem.properties,
              '_upsellQuantity': cartLineItem.quantity
            };
            await addTopSellerToCart(variantId, cartLineItem.quantity, properties);
          }
        }, 300);
      } catch (error) {
        console.error('[TopSeller] Quantity input update error:', error);
      } finally {
        enableCartButtons();
      }
    });

    // Remove old badge safely
    const existingSavings = document.getElementById(`savings-badge-${variantId}`);
    if (existingSavings) {
      existingSavings.remove();
    } else {
      console.warn(`[TopSeller] No element found to remove for variant ${variantId}.`);
    }

    const currentQty = parseInt(newInput.value || '0', 10);
    const nextTier = volumeConfig.priceConfig.find(tier => tier.quantity > currentQty);

    if (!nextTier) continue;

    const diff = nextTier.quantity - currentQty;
    if (diff <= 0) continue;

    const savingsButton = document.createElement('button');
    savingsButton.id = `savings-badge-${variantId}`;
    savingsButton.className = 'savings-badge';
    savingsButton.innerHTML = discountType === 'fixedAmount'
      ? `Add ${diff} more, save ${fixDecimals(nextTier.discountAmount)}`
      : `Add ${diff} more, save ${nextTier.percentage}%`;

    savingsButton.style.cssText = savingsButtonCssText();

    savingsButton.onclick = async (e) => {
      e.preventDefault();
      savingsButton.disabled = true;
      const newVariantId = topProductExtractVariantIdFromGid(variantId);
      const cartData = await window.cartService.getCart();
      const properties = cartData.items[i]?.properties || {};
      await addTopSellerToCart(newVariantId, diff, properties);
      await refreshCartDrawerSections();
      newInput.value = currentQty + diff;
      savingsButton.disabled = false;
    };

    const discountContainer = itemElement.querySelector('.ajax-cart__line-items-discount .line-item-discount__container');
    if (discountContainer) {
      discountContainer.appendChild(savingsButton);
    } else if (itemElement.querySelector('.ajax-cart__product-content')) {
      itemElement.querySelector('.ajax-cart__product-content').appendChild(savingsButton);
    } else {
      itemElement.appendChild(savingsButton);
    }
  }
}



function renderSavingsBadge({ variantId, currentQty, volumeConfig, discountType, input, container }) {
  const nextTier = volumeConfig.priceConfig.find(tier => tier.quantity > currentQty);
  if (!nextTier) return;

  const diff = nextTier.quantity - currentQty;

  const badge = document.createElement('button');
  badge.id = `savings-badge-${variantId}`;
  badge.className = 'savings-badge';
  badge.style.cssText = savingsButtonCssText();

  badge.innerHTML = discountType === 'fixedAmount'
    ? `Add ${diff} more, save ${fixDecimals(nextTier.discountAmount)}`
    : `Add ${diff} more, save ${nextTier.percentage}%`;

  badge.onclick = async (e) => {
    e.preventDefault();
    badge.disabled = true;

    const props = container.dataset.properties || {};
    await addTopSellerToCart(variantId, diff, props);
    input.value = currentQty + diff;
    badge.disabled = false;
  };

  container.appendChild(badge);
}


