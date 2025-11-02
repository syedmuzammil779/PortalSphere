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

console.log('tpConfig loaded', tpConfig);

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

        setInterval(() => {
            try {
                //hideTopSellerButtonsIfBroken();
            } catch (e) {
                console.error('Top seller button check failed:', e);
            }
        }, 1000);
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
    const cartDrawer = document.querySelector('#CartDrawer');
  
    if (cartDrawer && !cartDrawer.querySelector('#top-product-embed')) {
        const drawerInner = cartDrawer.querySelector('.drawer__inner');
       
        if (drawerInner) {
            const topSellerDiv = createTopSellerElement();
            
            const drawerFooter = drawerInner.querySelector('.drawer__footer');
            if (drawerFooter) {
                drawerInner.insertBefore(topSellerDiv, drawerFooter);
            } else {
                drawerInner.appendChild(topSellerDiv);
            }

            topProductState.priceElement = document.getElementById('top-product-price');
            topProductState.quantityInput = document.getElementById('top-quantity-input');
            topProductState.minusButton = document.getElementById('top-quantity-minus');
            topProductState.plusButton = document.getElementById('top-quantity-plus');
            topProductState.quantityInputGroup = document.querySelector('#top-product-embed quantity-input.quantity');
            topProductState.addToCartTopProduct = document.getElementById('add-top-product');
            topProductState.topProductEmbed = document.getElementById('top-product-embed');
            const topsellerTitle = document.getElementById('top-seller-title');
            
            fetchTopSeller();

            topsellerTitle.innerHTML = 'Don\'t miss out on a customer favorite!';

            // Top Product Quantity Input
            if (!topProductState.eventListenerFlags.quantityInput) {
                // Add event listener for quantity input
                topProductState.quantityInput.addEventListener('input', function() {
                let currentValue = parseInt(topProductState.quantityInput.value, 10);
                let increment = topProductState.topProductVolumePricing.volumeConfig.increment || 1;
                let minQuantity = topProductState.topProductVolumePricing.volumeConfig.minimum || 1; // Default to 1 if not specified
                let maxQuantity = topProductState.topProductVolumePricing.volumeConfig.maximum || Number.MAX_SAFE_INTEGER; // Default to Infinity if not specified

                if (currentValue < minQuantity) {
                    topProductState.quantityInput.value = minQuantity;
                }
                else if (currentValue > maxQuantity) {
                    topProductState.quantityInput.value = maxQuantity;
                }

                // Ensure quantity is within min and max limits
                let updatedValue = Math.max(minQuantity, Math.min(maxQuantity, parseInt(topProductState.quantityInput.value, 10)));
                topProductState.quantityInput.value = updatedValue.toString();
                    updateTopProductPrice();
                });
                topProductState.eventListenerFlags.quantityInput = true;
            }
            // Add event listeners for minus and plus buttons
            topProductState.minusButton.addEventListener('click', function(event) {
                event.preventDefault();
                console.log('Minus button clicked');
                let quantityInput = document.getElementById('top-quantity-input');
                if (!quantityInput) {
                    console.warn('Quantity input not found');
                    return;
                }
                let increment = topProductState.topProductVolumePricing.volumeConfig.increment || 1;
                let minQuantity = topProductState.topProductVolumePricing.volumeConfig.minimum || 1;
                let currentValue = parseInt(quantityInput.value, 10) - increment;
                if (currentValue < minQuantity) currentValue = minQuantity;
                quantityInput.value = currentValue;
                console.log('Quantity after minus:', quantityInput.value);
                updateTopProductPrice();
            });
            topProductState.eventListenerFlags.minusButton = true;
            
            topProductState.plusButton.addEventListener('click', function(event) {
                event.preventDefault();
                console.log('Plus button clicked');
                let quantityInput = document.getElementById('top-quantity-input');
                if (!quantityInput) {
                    console.warn('Quantity input not found');
                    return;
                }
                let increment = topProductState.topProductVolumePricing.volumeConfig.increment || 1;
                let maxQuantity = topProductState.topProductVolumePricing.volumeConfig.maximum || Number.MAX_SAFE_INTEGER; // Default to Infinity if not specified
                let currentValue = parseInt(quantityInput.value, 10) + increment;
                if (currentValue > maxQuantity) currentValue = maxQuantity;
                quantityInput.value = currentValue;
                console.log('Quantity after plus:', quantityInput.value);
                updateTopProductPrice();
         
            });
            topProductState.eventListenerFlags.plusButton = true;
            
            topProductState.addToCartTopProduct.onclick = async (event) => {
                if (event) event.preventDefault();
                const variantGid = topProductState.variantId;
                const variantId = topProductExtractVariantIdFromGid(variantGid);
                const quantity = parseInt(topProductState.quantityInput.value, 10);
                console.log('[Top Products] Add to cart clicked. Variant GID:', variantGid, 'Extracted Variant ID:', variantId, 'Quantity:', quantity);
                console.log('[Top Products] Top product state variant ID:', topProductState.variantId);
                console.log('[Top Products] Top product data:', topProductState.topProduct);
                await addTopSellerToCart(variantId, quantity);
                setTimeout(async () => {
                    if (window.theme && typeof window.theme.CartDrawer === 'function') {
                   
                        new window.theme.CartDrawer();
                        
                        // Replace default quantity controls with custom ones
                        setTimeout(() => {
                            const defaultQuantityControls = document.querySelectorAll('.js-qty__wrapper');
                            console.log('[Cart Quantity Controls] Found default quantity controls:', defaultQuantityControls.length);
                            
                                                             // Check if cart drawer was recreated
                                 const existingCustomControls = document.querySelectorAll('.quantity-control');
                                 if (existingCustomControls.length > 0) {
                                     console.log('[Cart Quantity Controls] Found existing custom controls, removing them first');
                                     existingCustomControls.forEach(control => control.remove());
                                 }
                                 
                                 // Reset binding flag when creating new controls
                                 window.bindingInProgress = false;
                            
                                                         defaultQuantityControls.forEach((wrapper, index) => {
                                 // Hide the default control
                                 wrapper.style.display = 'none';
                                 
                                 // Check if we're inside a form and log it
                                 const parentForm = wrapper.closest('form');
                                 if (parentForm) {
                                     console.log('[Cart Quantity Controls] Found parent form:', parentForm);
                                 }
                                 
                                 // Get the current quantity value
                                 const input = wrapper.querySelector('.js-qty__num');
                                 const currentQuantity = input ? input.value : '1';
                                 const itemKey = input ? input.dataset.id : `item-${index}`;
                                 
                                 // Extract variant ID from multiple sources
                                 let variantId = null;
                                 
                                 // Method 1: Try to get from input dataset
                                 if (input && input.dataset.variantId) {
                                   variantId = input.dataset.variantId;
                                 }
                                 
                                 // Method 2: Extract from item key (format: "variantId:key")
                                 if (!variantId && itemKey && itemKey.includes(':')) {
                                   variantId = itemKey.split(':')[0];
                                   console.log('[Cart Quantity Controls] Extracted variant ID from item key:', variantId);
                                 }
                                 
                                 // Method 3: Try to get from cart item data attributes
                                 if (!variantId) {
                                   const cartItem = wrapper.closest('.cart__item');
                                   if (cartItem) {
                                     variantId = cartItem.getAttribute('data-variant-id');
                                     if (variantId) {
                                       console.log('[Cart Quantity Controls] Found variant ID from cart item:', variantId);
                                     }
                                   }
                                 }
                                 
                                 // Method 4: Try to get from any child element with data-variant-id
                                 if (!variantId) {
                                   const variantElement = wrapper.querySelector('[data-variant-id]');
                                   if (variantElement) {
                                     variantId = variantElement.getAttribute('data-variant-id');
                                     console.log('[Cart Quantity Controls] Found variant ID from child element:', variantId);
                                   }
                                 }
                                 
                                 // Method 5: Try to get from the original input's data-id attribute
                                 if (!variantId && input && input.dataset.id) {
                                   const dataId = input.dataset.id;
                                   console.log('[Cart Quantity Controls] Input data-id:', dataId);
                                   // Extract variant ID from data-id if it contains variant information
                                   if (dataId.includes(':')) {
                                     variantId = dataId.split(':')[0];
                                     console.log('[Cart Quantity Controls] Extracted variant ID from input data-id:', variantId);
                                   }
                                 }
                                 
                                 // Method 6: Try to get from the cart item's key attribute
                                 if (!variantId) {
                                   const cartItem = wrapper.closest('.cart__item');
                                   if (cartItem) {
                                     const itemKey = cartItem.getAttribute('data-item-key');
                                     console.log('[Cart Quantity Controls] Cart item key:', itemKey);
                                     if (itemKey && itemKey.includes(':')) {
                                       variantId = itemKey.split(':')[0];
                                       console.log('[Cart Quantity Controls] Extracted variant ID from cart item key:', variantId);
                                     }
                                   }
                                 }
                                 
                                 // Method 7: Try to get from the cart item's data-variant-id attribute
                                 if (!variantId) {
                                   const cartItem = wrapper.closest('.cart__item');
                                   if (cartItem) {
                                     const cartItemVariantId = cartItem.getAttribute('data-variant-id');
                                     console.log('[Cart Quantity Controls] Cart item data-variant-id:', cartItemVariantId);
                                     if (cartItemVariantId) {
                                       variantId = cartItemVariantId;
                                       console.log('[Cart Quantity Controls] Using cart item data-variant-id:', variantId);
                                     }
                                   }
                                 }
                                 
                                 // Method 8: Try to get from the cart item's key attribute and extract variant ID
                                 if (!variantId) {
                                   const cartItem = wrapper.closest('.cart__item');
                                   if (cartItem) {
                                     const cartItemKey = cartItem.getAttribute('data-item-key');
                                     console.log('[Cart Quantity Controls] Cart item key:', cartItemKey);
                                     if (cartItemKey && cartItemKey.includes(':')) {
                                       const extractedVariantId = cartItemKey.split(':')[0];
                                       console.log('[Cart Quantity Controls] Extracted variant ID from cart item key:', extractedVariantId);
                                       variantId = extractedVariantId;
                                     }
                                   }
                                 }
                                 
                                 // Method 9: Try to get from the original input's name attribute
                                 if (!variantId && input && input.name) {
                                   const inputName = input.name;
                                   console.log('[Cart Quantity Controls] Input name:', inputName);
                                   // Extract variant ID from input name if it contains variant information
                                   if (inputName.includes('[') && inputName.includes(']')) {
                                     const match = inputName.match(/\[(\d+)\]/);
                                     if (match) {
                                       variantId = match[1];
                                       console.log('[Cart Quantity Controls] Extracted variant ID from input name:', variantId);
                                     }
                                   }
                                 }
                                 
                                 console.log('[Cart Quantity Controls] Final variant ID for item', itemKey, ':', variantId);
                                 
                                 // Debug: Log the cart item structure
                                 const cartItem = wrapper.closest('.cart__item');
                                 if (cartItem) {
                                   console.log('[Cart Quantity Controls] Cart item attributes:', {
                                     'data-variant-id': cartItem.getAttribute('data-variant-id'),
                                     'data-item-key': cartItem.getAttribute('data-item-key'),
                                     'id': cartItem.getAttribute('id'),
                                     'class': cartItem.getAttribute('class')
                                   });
                                   console.log('[Cart Quantity Controls] Cart item HTML:', cartItem.outerHTML.substring(0, 500) + '...');
                                 }
                                 
                                 // Skip creating control if no valid variant ID
                                 if (!variantId || variantId === 'null' || variantId === 'undefined') {
                                     console.warn('[Cart Quantity Controls] Skipping control creation for invalid variant ID:', variantId);
                                     return;
                                 }
                                
                                                                 // Create custom quantity control HTML
                                 const customControlHtml = `
                                     <div class="quantity-control" data-item-key="${itemKey}" data-variant-id="${variantId}">
                                         <div class="quantity-wrapper" style="display: flex; align-items: center; border: 1px solid #ccc; border-radius: 4px; width: fit-content;">
                                             <button type="button" class="quantity-minus" style="width: 32px; height: 32px; background: none; border: none; border-right: 1px solid #ccc; font-size: 14px; cursor: pointer; display: flex; align-items: center; justify-content: center;">−</button>
                                             <input type="text" class="quantity-input" value="${currentQuantity}" readonly style="width: 40px; height: 32px; border: none; font-size: 14px; text-align: center;">
                                             <button type="button" class="quantity-plus" style="width: 32px; height: 32px; background: none; border: none; border-left: 1px solid #ccc; font-size: 14px; cursor: pointer; display: flex; align-items: center; justify-content: center;">+</button>
                                         </div>
                                         <div class="volume-pricing-info" style="font-size: 12px; color: #666; margin-top: 4px; text-align: center;"></div>
                                     </div>
                                 `;
                                
                                // Insert the custom control after the wrapper
                                wrapper.insertAdjacentHTML('afterend', customControlHtml);
                                
                                // Get references to the new custom controls
                                const customControl = wrapper.nextElementSibling;
                                const customInput = customControl.querySelector('.quantity-input');
                                const customMinus = customControl.querySelector('.quantity-minus');
                                const customPlus = customControl.querySelector('.quantity-plus');
                                
                                // Add event listeners
                                customMinus.addEventListener('click', () => {
                                    const currentValue = parseInt(customInput.value) || 1;
                                    if (currentValue > 1) {
                                        customInput.value = currentValue - 1;
                                        // Trigger change event on the original input
                                        if (input) {
                                            input.value = customInput.value;
                                            input.dispatchEvent(new Event('change', { bubbles: true }));
                                        }
                                    }
                                });
                                
                                customPlus.addEventListener('click', () => {
                                    const currentValue = parseInt(customInput.value) || 1;
                                    customInput.value = currentValue + 1;
                                    // Trigger change event on the original input
                                    if (input) {
                                        input.value = customInput.value;
                                        input.dispatchEvent(new Event('change', { bubbles: true }));
                                    }
                                });
                                
                                                             console.log('[Cart Quantity Controls] Custom control created for item:', itemKey);
                         });
                         console.log('[Cart Quantity Controls] Calling bindCartDrawerQuantityButtons...');
                         window.bindCartDrawerQuantityButtons();
                         
                         // Set up MutationObserver to detect cart drawer changes
                         const cartDrawer = document.querySelector('#CartDrawer');
                         if (cartDrawer && !window.cartDrawerObserver) {
                             console.log('[Cart Quantity Controls] Setting up MutationObserver for cart drawer');
                             window.cartDrawerObserver = new MutationObserver((mutations) => {
                                 // Prevent infinite loops by checking if we're already processing
                                 if (window.cartDrawerProcessing) return;
                                 
                                 let shouldReinitialize = false;
                                 
                                 mutations.forEach((mutation) => {
                                     if (mutation.type === 'childList') {
                                         // Check if any added nodes are cart items (not our custom controls)
                                         const hasCartItems = Array.from(mutation.addedNodes).some(node => 
                                             node.nodeType === Node.ELEMENT_NODE && 
                                             (node.classList.contains('cart__item') || 
                                              node.querySelector('.cart__item'))
                                         );
                                         
                                         // Check if any added nodes are our custom controls
                                         const hasCustomControls = Array.from(mutation.addedNodes).some(node => 
                                             node.nodeType === Node.ELEMENT_NODE && 
                                             (node.classList.contains('quantity-control') || 
                                              node.querySelector('.quantity-control'))
                                         );
                                         
                                         // Only reinitialize if cart items were added but not our custom controls
                                         if (hasCartItems && !hasCustomControls) {
                                             shouldReinitialize = true;
                                         }
                                     }
                                 });
                                 
                                 if (shouldReinitialize) {
                                     console.log('[Cart Quantity Controls] Cart drawer content changed, reinitializing controls');
                                     window.cartDrawerProcessing = true;
                                     setTimeout(() => {
                                         window.bindCartDrawerQuantityButtons();
                                         window.cartDrawerProcessing = false;
                                     }, 200);
                                 }
                             });
                             
                             window.cartDrawerObserver.observe(cartDrawer, {
                                 childList: true,
                                 subtree: true
                             });
                         }
                     }, 800);
                        
                    }
                    if (window.fetchTopSeller) {
                        await window.fetchTopSeller();
                    }
                }, 100);
            };
            topProductState.eventListenerFlags.addToCart = true;
        
            topProductState.eventListenerFlags.learnMore = true;

            // Add close button event listener
            const closeButton = document.getElementById('close-top-seller');
            if (closeButton) {
                closeButton.addEventListener('click', removeTopSeller);
            }
        }
    }
}

    function removeTopSeller() {
      const topSellerElement = document.querySelector('#top-product-embed');
      if (topSellerElement) {
        topSellerElement.remove();
      }
    }

    function enableCartButtons() {
      const quantityButtons = document.querySelectorAll('.js-qty__adjust');
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
      const quantityButtons = document.querySelectorAll('.js-qty__adjust');
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
      const cartDrawer = document.querySelector('#CartDrawer');
  
      if (cartDrawer && cartDrawer.classList.contains('drawer--is-open')) {
          if (document.querySelectorAll('.quantity-control').length ==0) {
            setTimeout(() => {
                            const defaultQuantityControls = document.querySelectorAll('.js-qty__wrapper');
                            console.log('[Cart Quantity Controls] Found default quantity controls:', defaultQuantityControls.length);
                            
                                                             // Check if cart drawer was recreated
                                 const existingCustomControls = document.querySelectorAll('.quantity-control');
                                 if (existingCustomControls.length > 0) {
                                     console.log('[Cart Quantity Controls] Found existing custom controls, removing them first');
                                     existingCustomControls.forEach(control => control.remove());
                                 }
                                 
                                 // Reset binding flag when creating new controls
                                 window.bindingInProgress = false;
                            
                                                         defaultQuantityControls.forEach((wrapper, index) => {
                                 // Hide the default control
                                 wrapper.style.display = 'none';
                                 
                                 // Check if we're inside a form and log it
                                 const parentForm = wrapper.closest('form');
                                 if (parentForm) {
                                     console.log('[Cart Quantity Controls] Found parent form:', parentForm);
                                 }
                                 
                                 // Get the current quantity value
                                 const input = wrapper.querySelector('.js-qty__num');
                                 const currentQuantity = input ? input.value : '1';
                                 const itemKey = input ? input.dataset.id : `item-${index}`;
                                 
                                 // Extract variant ID from multiple sources
                                 let variantId = null;
                                 
                                 // Method 1: Try to get from input dataset
                                 if (input && input.dataset.variantId) {
                                   variantId = input.dataset.variantId;
                                 }
                                 
                                 // Method 2: Extract from item key (format: "variantId:key")
                                 if (!variantId && itemKey && itemKey.includes(':')) {
                                   variantId = itemKey.split(':')[0];
                                   console.log('[Cart Quantity Controls] Extracted variant ID from item key:', variantId);
                                 }
                                 
                                 // Method 3: Try to get from cart item data attributes
                                 if (!variantId) {
                                   const cartItem = wrapper.closest('.cart__item');
                                   if (cartItem) {
                                     variantId = cartItem.getAttribute('data-variant-id');
                                     if (variantId) {
                                       console.log('[Cart Quantity Controls] Found variant ID from cart item:', variantId);
                                     }
                                   }
                                 }
                                 
                                 // Method 4: Try to get from any child element with data-variant-id
                                 if (!variantId) {
                                   const variantElement = wrapper.querySelector('[data-variant-id]');
                                   if (variantElement) {
                                     variantId = variantElement.getAttribute('data-variant-id');
                                     console.log('[Cart Quantity Controls] Found variant ID from child element:', variantId);
                                   }
                                 }
                                 
                                 // Method 5: Try to get from the original input's data-id attribute
                                 if (!variantId && input && input.dataset.id) {
                                   const dataId = input.dataset.id;
                                   console.log('[Cart Quantity Controls] Input data-id:', dataId);
                                   // Extract variant ID from data-id if it contains variant information
                                   if (dataId.includes(':')) {
                                     variantId = dataId.split(':')[0];
                                     console.log('[Cart Quantity Controls] Extracted variant ID from input data-id:', variantId);
                                   }
                                 }
                                 
                                 // Method 6: Try to get from the cart item's key attribute
                                 if (!variantId) {
                                   const cartItem = wrapper.closest('.cart__item');
                                   if (cartItem) {
                                     const itemKey = cartItem.getAttribute('data-item-key');
                                     console.log('[Cart Quantity Controls] Cart item key:', itemKey);
                                     if (itemKey && itemKey.includes(':')) {
                                       variantId = itemKey.split(':')[0];
                                       console.log('[Cart Quantity Controls] Extracted variant ID from cart item key:', variantId);
                                     }
                                   }
                                 }
                                 
                                 // Method 7: Try to get from the cart item's data-variant-id attribute
                                 if (!variantId) {
                                   const cartItem = wrapper.closest('.cart__item');
                                   if (cartItem) {
                                     const cartItemVariantId = cartItem.getAttribute('data-variant-id');
                                     console.log('[Cart Quantity Controls] Cart item data-variant-id:', cartItemVariantId);
                                     if (cartItemVariantId) {
                                       variantId = cartItemVariantId;
                                       console.log('[Cart Quantity Controls] Using cart item data-variant-id:', variantId);
                                     }
                                   }
                                 }
                                 
                                 // Method 8: Try to get from the cart item's key attribute and extract variant ID
                                 if (!variantId) {
                                   const cartItem = wrapper.closest('.cart__item');
                                   if (cartItem) {
                                     const cartItemKey = cartItem.getAttribute('data-item-key');
                                     console.log('[Cart Quantity Controls] Cart item key:', cartItemKey);
                                     if (cartItemKey && cartItemKey.includes(':')) {
                                       const extractedVariantId = cartItemKey.split(':')[0];
                                       console.log('[Cart Quantity Controls] Extracted variant ID from cart item key:', extractedVariantId);
                                       variantId = extractedVariantId;
                                     }
                                   }
                                 }
                                 
                                 // Method 9: Try to get from the original input's name attribute
                                 if (!variantId && input && input.name) {
                                   const inputName = input.name;
                                   console.log('[Cart Quantity Controls] Input name:', inputName);
                                   // Extract variant ID from input name if it contains variant information
                                   if (inputName.includes('[') && inputName.includes(']')) {
                                     const match = inputName.match(/\[(\d+)\]/);
                                     if (match) {
                                       variantId = match[1];
                                       console.log('[Cart Quantity Controls] Extracted variant ID from input name:', variantId);
                                     }
                                   }
                                 }
                                 
                                 console.log('[Cart Quantity Controls] Final variant ID for item', itemKey, ':', variantId);
                                 
                                 // Debug: Log the cart item structure
                                 const cartItem = wrapper.closest('.cart__item');
                                 if (cartItem) {
                                   console.log('[Cart Quantity Controls] Cart item attributes:', {
                                     'data-variant-id': cartItem.getAttribute('data-variant-id'),
                                     'data-item-key': cartItem.getAttribute('data-item-key'),
                                     'id': cartItem.getAttribute('id'),
                                     'class': cartItem.getAttribute('class')
                                   });
                                   console.log('[Cart Quantity Controls] Cart item HTML:', cartItem.outerHTML.substring(0, 500) + '...');
                                 }
                                 
                                 // Skip creating control if no valid variant ID
                                 if (!variantId || variantId === 'null' || variantId === 'undefined') {
                                     console.warn('[Cart Quantity Controls] Skipping control creation for invalid variant ID:', variantId);
                                     return;
                                 }
                                
                                                                 // Create custom quantity control HTML
                                 const customControlHtml = `
                                     <div class="quantity-control" data-item-key="${itemKey}" data-variant-id="${variantId}">
                                         <div class="quantity-wrapper" style="display: flex; align-items: center; border: 1px solid #ccc; border-radius: 4px; width: fit-content;">
                                             <button type="button" class="quantity-minus" style="width: 32px; height: 32px; background: none; border: none; border-right: 1px solid #ccc; font-size: 14px; cursor: pointer; display: flex; align-items: center; justify-content: center;">−</button>
                                             <input type="text" class="quantity-input" value="${currentQuantity}" readonly style="width: 40px; height: 32px; border: none; font-size: 14px; text-align: center;">
                                             <button type="button" class="quantity-plus" style="width: 32px; height: 32px; background: none; border: none; border-left: 1px solid #ccc; font-size: 14px; cursor: pointer; display: flex; align-items: center; justify-content: center;">+</button>
                                         </div>
                                         <style>
                                         #CartDrawer #volume-pricing-quantity-info {
                                          display: none;
                                         }
                                         </style>
                                         <div class="volume-pricing-info" style="font-size: 12px; color: #666; margin-top: 4px; text-align: center;"></div>
                                     </div>
                                 `;
                                
                                // Insert the custom control after the wrapper
                                wrapper.insertAdjacentHTML('afterend', customControlHtml);
                                
                                // Get references to the new custom controls
                                const customControl = wrapper.nextElementSibling;
                                const customInput = customControl.querySelector('.quantity-input');
                                const customMinus = customControl.querySelector('.quantity-minus');
                                const customPlus = customControl.querySelector('.quantity-plus');
                                
                                // Add event listeners
                                customMinus.addEventListener('click', () => {
                                    const currentValue = parseInt(customInput.value) || 1;
                                    if (currentValue > 1) {
                                        customInput.value = currentValue - 1;
                                        // Trigger change event on the original input
                                        if (input) {
                                            input.value = customInput.value;
                                            input.dispatchEvent(new Event('change', { bubbles: true }));
                                        }
                                    }
                                });
                                
                                customPlus.addEventListener('click', () => {
                                    const currentValue = parseInt(customInput.value) || 1;
                                    customInput.value = currentValue + 1;
                                    // Trigger change event on the original input
                                    if (input) {
                                        input.value = customInput.value;
                                        input.dispatchEvent(new Event('change', { bubbles: true }));
                                    }
                                });
                                
                                                             console.log('[Cart Quantity Controls] Custom control created for item:', itemKey);
                         });
                         console.log('[Cart Quantity Controls] Calling bindCartDrawerQuantityButtons...');
                         window.bindCartDrawerQuantityButtons();
                         
                         // Set up MutationObserver to detect cart drawer changes
                         const cartDrawer = document.querySelector('#CartDrawer');
                         if (cartDrawer && !window.cartDrawerObserver) {
                             console.log('[Cart Quantity Controls] Setting up MutationObserver for cart drawer');
                             window.cartDrawerObserver = new MutationObserver((mutations) => {
                                 // Prevent infinite loops by checking if we're already processing
                                 if (window.cartDrawerProcessing) return;
                                 
                                 let shouldReinitialize = false;
                                 
                                 mutations.forEach((mutation) => {
                                     if (mutation.type === 'childList') {
                                         // Check if any added nodes are cart items (not our custom controls)
                                         const hasCartItems = Array.from(mutation.addedNodes).some(node => 
                                             node.nodeType === Node.ELEMENT_NODE && 
                                             (node.classList.contains('cart__item') || 
                                              node.querySelector('.cart__item'))
                                         );
                                         
                                         // Check if any added nodes are our custom controls
                                         const hasCustomControls = Array.from(mutation.addedNodes).some(node => 
                                             node.nodeType === Node.ELEMENT_NODE && 
                                             (node.classList.contains('quantity-control') || 
                                              node.querySelector('.quantity-control'))
                                         );
                                         
                                         // Only reinitialize if cart items were added but not our custom controls
                                         if (hasCartItems && !hasCustomControls) {
                                             shouldReinitialize = true;
                                         }
                                     }
                                 });
                                 
                                 if (shouldReinitialize) {
                                     console.log('[Cart Quantity Controls] Cart drawer content changed, reinitializing controls');
                                     window.cartDrawerProcessing = true;
                                     setTimeout(() => {
                                         window.bindCartDrawerQuantityButtons();
                                         window.cartDrawerProcessing = false;
                                     }, 200);
                                 }
                             });
                             
                             window.cartDrawerObserver.observe(cartDrawer, {
                                 childList: true,
                                 subtree: true
                             });
                         }
                     }, 800);
          }
   
     //   const topSellerBlock = document.getElementById('top-product-embed');
        if (tpConfig.enableTopProducts === 'true') {
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
        console.log('[Top Products] tpConfig.productVariantId:', tpConfig.productVariantId);
        const response = await fetch(`https://${tpConfig.appDomain}/api/top-products?shop=${shop}&customer=${customerId}&api_key=${tpConfig.apiKey}&timestamp=${tpConfig.timestamp}&hmac=${tpConfig.hmac}&productVariantId=${tpConfig.productVariantId}`, {
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
        
        // Create custom quantity controls after data is loaded
        console.log('[Top Products] Creating custom quantity controls after data loaded');
        setTimeout(async () => {
            try {
                await createCustomQuantityControlsForTopProduct();
            } catch (error) {
                console.error('[Top Products] Error creating custom quantity controls:', error);
            }
        }, 1000);
      } catch (error) {
        console.error('Error:', error);
      }
    }

    function updateTopProductPrice() {
      let quantity = parseInt(topProductState.quantityInput.value, 10);

      const priceInfo = topProductState.topProductVolumePricing.priceConfig.find(p => quantity >= p.quantity && quantity <= p.maxQuantity);
      if (priceInfo) {
        // Assuming priceInfo.originalPrice is available and contains the original price
        topProductState.priceElement.innerHTML = window.generateTopProductPriceElement(priceInfo);
      } else {
        topProductState.priceElement.textContent = 'Price not available';
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
      console.log('[Top Products] addTopSellerToCart called with variantId:', variantId, 'quantity:', quantity);
      
      // Log to file
      const logMessage = `\n[${new Date().toISOString()}] ADD TO CART DEBUG
Requested variantId: ${variantId}
Quantity: ${quantity}
`;
      // Note: We can't use fs here since this is client-side JavaScript
      // We'll use console.log and you can copy from browser console
      
      try {
        // Fetch current cart
        const cart = await window.cartService.getCart();
        console.log('[Top Products] Current cart items:', cart.items.map(item => ({ variant_id: item.variant_id, key: item.key, title: item.title })));
        
        // Log cart state to console for easy copying
        console.log('📋 CART STATE BEFORE ADD:', JSON.stringify(cart.items.map(item => ({
          variant_id: item.variant_id,
          product_id: item.product_id,
          title: item.title,
          quantity: item.quantity,
          key: item.key
        })), null, 2));
        
        // Check if item already exists in cart
        const existingItem = cart.items.find(item => item.variant_id === parseInt(variantId));
        console.log('[Top Products] Existing item found:', existingItem);
        
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
          console.log('🛒 ADDING NEW ITEM TO CART:', { variantId, quantity });
          await window.cartService.addProductToCart(variantId, quantity, {
            "_isUpsellOrigin": true,
            "_upsellQuantity": quantity
          });
        }
        
        // Fetch cart again after the operation
        const updatedCart = await window.cartService.getCart();
        console.log('📋 CART STATE AFTER ADD:', JSON.stringify(updatedCart.items.map(item => ({
          variant_id: item.variant_id,
          product_id: item.product_id,
          title: item.title,
          quantity: item.quantity,
          key: item.key
        })), null, 2));
        
        // Log what was actually added
        const addedItem = updatedCart.items.find(item => item.variant_id === parseInt(variantId));
        console.log('✅ ACTUALLY ADDED TO CART:', addedItem ? {
          variant_id: addedItem.variant_id,
          product_id: addedItem.product_id,
          title: addedItem.title,
          quantity: addedItem.quantity
        } : 'Item not found in updated cart');
        
      } catch (error) {
        console.error('Error adding/updating complementary product in cart:', error);
        showComplementaryToast('Failed to add complementary product to cart. Please try again.', 'error');
      }
    }

async function updateCartItemsUpsell() {
    const cartItemsTable = document.querySelectorAll('.cart-items[role="table"]');
    if (!cartItemsTable || !cartItemsTable.length) {
        console.warn('No cart items table found in updateCartItemsUpsell');
        return;
    }
    const rows = cartItemsTable[0].querySelectorAll('tbody > tr')
    topProductState.cartItemsVariants = Array.from(rows).map(row => {
        const href = row.querySelector('td:first-child a')?.href;
        if (!href) return null;
        return href.split('variant=')[1];
    }).filter(id => id);

    // get quantity controls
    const quantityInputs = document.querySelectorAll('quantity-input');
    topProductState.cartQuantityInputs = Array.from(quantityInputs).map(container => {
        return container.querySelector('input[name="updates[]"]');
    }).filter(input => input);

    const cartData = await window.cartService.getCart();

    for (let i = 0; i < topProductState.cartItemsVariants.length; i++) {
        const input = topProductState.cartQuantityInputs[i];
        const variantId = topProductState.cartItemsVariants[i];
        console.log('calling 5555');
        const data = await window.productPricingService.getVolumePricingByProductVariantId(tpConfig.appDomain, topProductState.shop, tpConfig.apiKey, tpConfig.timestamp, tpConfig.hmac, topProductState.customerId, variantId);          
        let volumeConfig = data;
        const discountType = data.type;
        
        // Function to set input constraints
        const setInputConstraints = (input, config) => {
            input.readOnly = true;
            input.min = config.volumeConfig.minimum;
            input.max = config.volumeConfig.maximum;
            input.step = config.volumeConfig.increment;
        };

        // Set initial constraints
        setInputConstraints(input, volumeConfig);

        // Add input event listener
        input.addEventListener('change', async () => {
        // Get and disable all quantity buttons and savings badges
        disableCartButtons();

        try {
            // Get the corresponding line item
            console.log('calling 666');
            const data2 = await window.productPricingService.getVolumePricingByProductVariantId(tpConfig.appDomain, topProductState.shop, tpConfig.apiKey, tpConfig.timestamp, tpConfig.hmac, topProductState.customerId, variantId);
            const updatedConfig = data2;
            setInputConstraints(input, updatedConfig);

            const oldcartLineItem = cartData.items[i];

            // Wait for 3 seconds before checking the cart
            setTimeout( async () => {
            const newcartData = await window.cartService.getCart();
            const cartLineItem = newcartData.items[i];  
            console.debug('Cart line item for variant', variantId, ':', cartLineItem);

            if (cartLineItem.properties._isUpsellOrigin) {
                const properties = {
                    ...cartLineItem.properties,
                    '_upsellQuantity': cartLineItem.quantity
                };
                
                // Update the cart line item with new properties
                await addTopSellerToCart(variantId, cartLineItem.quantity, properties);
            }
            }, 2000);
        } catch (error) {
            console.error('Error processing cart update:', error);
        } finally {
            enableCartButtons();
        }            
        });

        // Replace the empty appendChild() with button creation
        const existingSavings = document.getElementById(`savings-badge-${variantId}`);
        if (existingSavings) {
        existingSavings.remove();
        }
        const savingsButton = document.createElement('button');
        savingsButton.id = `savings-badge-${variantId}`;
        savingsButton.className = 'savings-badge';
        const currentQty = parseInt(input.value) || 0;
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
        const properties = cartData.items[i].properties || {};
        await addTopSellerToCart(newVariantId, diff, properties);
        savingsButton.disabled = false;
        savingsButton.style.cursor = 'pointer';
        };
        const container = input.parentElement.parentElement.parentElement.parentElement;
        container.appendChild(savingsButton);
    }
}

// Get volume pricing config for a variant
async function getVolumePricingConfig(variantId) {
  try {
    console.log('[Cart Quantity Controls] Getting volume config for variant:', variantId);
    
    // Check if productPricingService is available
    if (!window.productPricingService) {
      console.warn('[Cart Quantity Controls] productPricingService not available, using fallback config');
      return {
        minimum: 1,
        maximum: null,
        increment: 1
      };
    }

    // Check if required config is available
    if (!tpConfig || !tpConfig.appDomain || !topProductState || !topProductState.shop) {
      console.warn('[Cart Quantity Controls] Missing required config, using fallback');
      return {
        minimum: 1,
        maximum: null,
        increment: 1
      };
    }

    const data = await window.productPricingService.getVolumePricingByProductVariantId(
      tpConfig.appDomain,
      topProductState.shop,
      tpConfig.apiKey,
      tpConfig.timestamp,
      tpConfig.hmac,
      topProductState.customerId,
      variantId
    );

    console.log('[Cart Quantity Controls] Raw API response for variant', variantId, ':', data);
    
    // Handle different response structures
    let volumeConfig = data;
    if (data && data.volumeConfig) {
      volumeConfig = data.volumeConfig;
    }
    
    console.log('[Cart Quantity Controls] Processed volume config for variant', variantId, ':', volumeConfig);
    
    // Debug: Log the specific values being used
    if (volumeConfig) {
      console.log('[Cart Quantity Controls] Volume config details for variant', variantId, ':');
      console.log('  - minimum:', volumeConfig.minimum);
      console.log('  - maximum:', volumeConfig.maximum);
      console.log('  - increment:', volumeConfig.increment);
      console.log('  - increments:', volumeConfig.increments);
    }
    
    return volumeConfig;
  } catch (error) {
    console.error('[Cart Quantity Controls] Failed to fetch volume pricing for variant', variantId, ':', error);
    // Return fallback config on error
    return {
      minimum: 1,
      maximum: null,
      increment: 1
    };
  }
}

// Update product quantity in cart
async function updateProductToCart(variantId, quantity) {
  console.log('[Cart Quantity Controls] updateProductToCart called with variantId:', variantId, 'quantity:', quantity);
  if (quantity < 0) quantity = 0;

  // Try to get the line item key from the cart item
  const cartItem = document.querySelector(`[data-variant-id="${variantId}"]`) || 
                   document.querySelector(`[data-item-key*="${variantId}:"]`);
  
  let lineItemKey = null;
  if (cartItem) {
    lineItemKey = cartItem.getAttribute('data-item-key');
    console.log('[Cart Quantity Controls] Found line item key:', lineItemKey);
  }

  const requestBody = lineItemKey ? 
    { id: lineItemKey, quantity: quantity } : 
    { id: variantId, quantity: quantity };
    
  console.log('[Cart Quantity Controls] Request body:', requestBody);

    const response = await fetch('/cart/change.js', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify(requestBody)
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.description || 'Failed to update cart');
  }

  const cart = await response.json();
  console.log('[Cart Quantity Controls] Cart updated successfully:', cart);
  return cart;
}

window.bindCartDrawerQuantityButtons = function () {
  // Prevent multiple simultaneous calls
  if (window.bindingInProgress) {
    console.log('[Cart Quantity Controls] Binding already in progress, skipping');
    return;
  }
  
  window.bindingInProgress = true;
  console.log('[Cart Quantity Controls] bindCartDrawerQuantityButtons called');
  
  // Find all custom quantity controls
  const customControls = document.querySelectorAll('.quantity-control');
  console.log('[Cart Quantity Controls] Found custom controls:', customControls.length);
  
  // Remove existing event listeners first to prevent duplicates
  customControls.forEach((control) => {
    const minusBtn = control.querySelector('.quantity-minus');
    const plusBtn = control.querySelector('.quantity-plus');
    const input = control.querySelector('.quantity-input');
    
    console.log('[Cart Quantity Controls] Cleaning up event listeners for control:', control);
    console.log('[Cart Quantity Controls] Found elements - minus:', !!minusBtn, 'plus:', !!plusBtn, 'input:', !!input);
    
    if (minusBtn) {
      minusBtn.replaceWith(minusBtn.cloneNode(true));
    }
    if (plusBtn) {
      plusBtn.replaceWith(plusBtn.cloneNode(true));
    }
    if (input) {
      input.replaceWith(input.cloneNode(true));
    }
  });
  
  if (customControls.length === 0) {
    console.warn('[Cart Quantity Controls] No custom controls found. Checking for default controls...');
    const defaultControls = document.querySelectorAll('.js-qty__wrapper');
    console.log('[Cart Quantity Controls] Default controls found:', defaultControls.length);
    return;
  }
  
  customControls.forEach((control) => {
    const minusBtn = control.querySelector('.quantity-minus');
    const plusBtn = control.querySelector('.quantity-plus');
    const input = control.querySelector('.quantity-input');
         const variantId = control.getAttribute('data-variant-id');
     const itemKey = control.getAttribute('data-item-key');
     
     if (!minusBtn || !plusBtn || !input) {
       console.warn('[Cart Quantity Controls] Missing elements in control:', control);
       return;
     }
     
     if (!variantId || variantId === 'null' || variantId === 'undefined') {
       console.warn('[Cart Quantity Controls] Invalid variant ID:', variantId);
       return;
     }
     

    
           // Get volume pricing config for this variant
       console.log('[Cart Quantity Controls] Getting volume config for variant:', variantId);
       
                // Check if we have stored values from previous binding
         const storedStep = control.getAttribute('data-step-value');
         const storedMin = control.getAttribute('data-min-value');
         const storedMax = control.getAttribute('data-max-value');
         
         if (storedStep && storedMin) {
           console.log('[Cart Quantity Controls] Using stored values:', { step: storedStep, min: storedMin, max: storedMax });
           
           // Use stored values for immediate display
           const min = Number(storedMin);
           const inc = Number(storedStep);
           const max = storedMax ? Number(storedMax) : null;
           
           // Update volume pricing info display with stored values
           const volumeInfoDiv = control.querySelector('.volume-pricing-info');
           console.log('[Cart Quantity Controls] Volume info div found:', !!volumeInfoDiv);
           if (volumeInfoDiv) {
             const maxDisplay = max === Number.MAX_SAFE_INTEGER ? '∞' : max;
             
             if (!max || max == Number.MAX_SAFE_INTEGER) {
               volumeInfoDiv.innerHTML = `Min. ${min} &#x2022; Increments of ${inc}`;
             } else {
               volumeInfoDiv.innerHTML = `Min. ${min} &#x2022; Max ${maxDisplay} &#x2022; Increments of ${inc}`;
             }
             volumeInfoDiv.style.color = '#666';
             console.log('[Cart Quantity Controls] Stored volume info displayed');
           }
         } else {
           // Use default fallback config
           const fallbackConfig = {
             minimum: 1,
             maximum: null,
             increment: 1
           };
           
           console.log('[Cart Quantity Controls] Using fallback config:', fallbackConfig);
           
           // Update volume pricing info display with fallback config
           const volumeInfoDiv = control.querySelector('.volume-pricing-info');
           console.log('[Cart Quantity Controls] Volume info div found:', !!volumeInfoDiv);
           if (volumeInfoDiv) {
             const min = fallbackConfig.minimum;
             const inc = fallbackConfig.increment;
             const max = fallbackConfig.maximum === Number.MAX_SAFE_INTEGER ? '∞' : fallbackConfig.maximum;
             
             if (!fallbackConfig.maximum || fallbackConfig.maximum == Number.MAX_SAFE_INTEGER) {
               volumeInfoDiv.innerHTML = `Min. ${min} &#x2022; Increments of ${inc}`;
             } else {
               volumeInfoDiv.innerHTML = `Min. ${min} &#x2022; Max ${max} &#x2022; Increments of ${inc}`;
             }
             volumeInfoDiv.style.color = '#666';
             console.log('[Cart Quantity Controls] Fallback volume info displayed');
           }
         }
       
       // Now try to get real volume config
       getVolumePricingConfig(variantId).then(volumeConfig => {
         console.log('[Cart Quantity Controls] Raw volume config for variant', variantId, ':', volumeConfig);
         
         if (!volumeConfig) {
           console.warn('[Cart Quantity Controls] No volume config for variant:', variantId);
           return;
         }
         
         // Handle different possible data structures
         let volumeConfigData = volumeConfig;
         if (volumeConfig.volumeConfig) {
           volumeConfigData = volumeConfig.volumeConfig;
         }
         
         console.log('[Cart Quantity Controls] Processed volume config data:', volumeConfigData);
         
         if (!volumeConfigData || !volumeConfigData.minimum) {
           console.warn('[Cart Quantity Controls] Invalid volume config structure for variant:', variantId);
           return;
         }
         
         const { minimum, maximum, increment } = volumeConfigData;
         const minNum = Number(minimum) || 1;
         const maxNum = Number(maximum) || null;
         const stepNum = Number(increment) || 1;
         
         console.log('[Cart Quantity Controls] Volume config for variant', variantId, ':', { minNum, maxNum, stepNum });
         
                // Store the step value in the control element for persistence
       control.setAttribute('data-step-value', stepNum);
       control.setAttribute('data-min-value', minNum);
       if (maxNum) control.setAttribute('data-max-value', maxNum);
       
       console.log('[Cart Quantity Controls] Stored values for variant', variantId, ':', {
         step: stepNum,
         min: minNum,
         max: maxNum
       });
         
         // Update input attributes
         input.setAttribute('min', minNum);
         input.setAttribute('step', stepNum);
         if (maxNum) input.setAttribute('max', maxNum);
         
         // Update volume pricing info display
         const volumeInfoDiv = control.querySelector('.volume-pricing-info');
         if (volumeInfoDiv) {
           const min = minNum;
           const inc = stepNum;
           const max = maxNum === Number.MAX_SAFE_INTEGER ? '∞' : maxNum;
           
           if (!maxNum || maxNum == Number.MAX_SAFE_INTEGER) {
             volumeInfoDiv.innerHTML = `Min. ${min} &#x2022; Increments of ${inc}`;
           } else {
             volumeInfoDiv.innerHTML = `Min. ${min} &#x2022; Max ${max} &#x2022; Increments of ${inc}`;
           }
           volumeInfoDiv.style.color = '#666';
         }
      
      let updateInProgress = false;
      
      async function updateQuantity(newQty) {
        if (updateInProgress) return Promise.resolve();
        updateInProgress = true;
        
        try {
          // Get control-specific values
          const controlStepValue = control.getAttribute('data-step-value');
          const controlMinValue = control.getAttribute('data-min-value');
          const controlMaxValue = control.getAttribute('data-max-value');
          const actualStepNum = controlStepValue ? Number(controlStepValue) : 1;
          const actualMinNum = controlMinValue ? Number(controlMinValue) : 1;
          const actualMaxNum = controlMaxValue ? Number(controlMaxValue) : null;
          
          // Validate quantity based on volume pricing rules
          let validationMessage = '';
          
          if (newQty < actualMinNum) {
            newQty = actualMinNum;
            validationMessage = `Minimum quantity is ${actualMinNum}`;
            console.log('[Cart Quantity Controls] Quantity below minimum, set to:', actualMinNum);
          }
          if (actualMaxNum && newQty > actualMaxNum) {
            newQty = actualMaxNum;
            validationMessage = `Maximum quantity is ${actualMaxNum}`;
            console.log('[Cart Quantity Controls] Quantity above maximum, set to:', actualMaxNum);
          }
          
          // Check if quantity follows increment rules
          const remainder = (newQty - actualMinNum) % actualStepNum;
          if (remainder !== 0) {
            const adjustedQty = newQty - remainder;
            validationMessage = `Quantity must be in increments of ${actualStepNum}`;
            console.log('[Cart Quantity Controls] Quantity', newQty, 'does not follow increment rule. Adjusted to:', adjustedQty);
            newQty = adjustedQty;
          }
          
          // Show validation message if any
          if (validationMessage) {
            const volumeInfoDiv = control.querySelector('.volume-pricing-info');
            if (volumeInfoDiv) {
              volumeInfoDiv.textContent = validationMessage;
              volumeInfoDiv.style.color = '#d82c0d';
              // Clear message after 3 seconds
              setTimeout(() => {
                const min = actualMinNum;
                const inc = actualStepNum;
                const max = actualMaxNum === Number.MAX_SAFE_INTEGER ? '∞' : actualMaxNum;
                
                if (!actualMaxNum || actualMaxNum == Number.MAX_SAFE_INTEGER) {
                  volumeInfoDiv.innerHTML = `Min. ${min} &#x2022; Increments of ${inc}`;
                } else {
                  volumeInfoDiv.innerHTML = `Min. ${min} &#x2022; Max ${max} &#x2022; Increments of ${inc}`;
                }
                volumeInfoDiv.style.color = '#666';
              }, 3000);
            }
          }
          
          input.value = newQty;
          
          // Use the local updateProductToCart function
          await updateProductToCart(variantId, newQty);
          console.log('[Cart Quantity Controls] Successfully updated quantity to:', newQty);
          
          return Promise.resolve();
        } catch (err) {
          console.error('[Cart Quantity Controls] Cart quantity update failed:', err);
          return Promise.reject(err);
        } finally {
          updateInProgress = false;
        }
      }
      
             // Add event listeners
       // Add click event listener to minus button
       const minusClickHandler = (event) => {
         console.log('[Cart Quantity Controls] Minus button clicked, preventing default behavior');
         console.log('[Cart Quantity Controls] Event target:', event.target);
         console.log('[Cart Quantity Controls] Control element:', control);
         console.log('[Cart Quantity Controls] Control data-variant-id:', control.getAttribute('data-variant-id'));
         console.log('[Cart Quantity Controls] Control data-item-key:', control.getAttribute('data-item-key'));
         
         const cartItem = control.closest('.cart__item');
         if (cartItem) {
           console.log('[Cart Quantity Controls] Cart item data-variant-id:', cartItem.getAttribute('data-variant-id'));
           console.log('[Cart Quantity Controls] Cart item data-item-key:', cartItem.getAttribute('data-item-key'));
         }
         
         event.preventDefault();
         event.stopPropagation();
         event.stopImmediatePropagation();
         event.returnValue = false;
         
         // Check if control is already being updated
         if (control.style.opacity === '0.5') {
           console.log('[Cart Quantity Controls] Control already updating, ignoring click');
           return false;
         }
         
         // Reduce opacity of the entire control during update
         control.style.opacity = '0.5';
         control.style.pointerEvents = 'none';
         
         // Get the correct step value for this specific control
         const controlStepValue = control.getAttribute('data-step-value');
         const controlMinValue = control.getAttribute('data-min-value');
         const actualStepNum = controlStepValue ? Number(controlStepValue) : 1;
         const actualMinNum = controlMinValue ? Number(controlMinValue) : 1;
         
         console.log('[Cart Quantity Controls] Control step value:', controlStepValue, 'Parsed step:', actualStepNum);
         console.log('[Cart Quantity Controls] Control min value:', controlMinValue, 'Parsed min:', actualMinNum);
         
         let currentQty = parseInt(input.value, 10) || actualMinNum;
         console.log('[Cart Quantity Controls] Current quantity:', currentQty, 'Step:', actualStepNum, 'New quantity:', currentQty - actualStepNum);
         
         updateQuantity(currentQty - actualStepNum).then(async () => {
           // Restore opacity after update
           control.style.opacity = '1';
           control.style.pointerEvents = 'auto';
           
           // Refetch volume pricing and update data attributes
           try {
             console.log('[Cart Quantity Controls] Refetching volume pricing for variant:', variantId);
             const volumeConfig = await getVolumePricingConfig(variantId);
             
             if (volumeConfig && volumeConfig.volumeConfig) {
               const { minimum, maximum, increments } = volumeConfig.volumeConfig;
               
               // Update data attributes
               control.setAttribute('data-min-value', minimum || 1);
               control.setAttribute('data-max-value', maximum || Number.MAX_SAFE_INTEGER);
               control.setAttribute('data-step-value', increments || 1);
               
               // Update volume info text
               const volumeInfoDiv = control.querySelector('.volume-pricing-info');
               if (volumeInfoDiv) {
                 const min = minimum || 1;
                 const inc = increments || 1;
                 const max = maximum === Number.MAX_SAFE_INTEGER ? '∞' : (maximum || '∞');
                 
                 if (!maximum || maximum == Number.MAX_SAFE_INTEGER) {
                   volumeInfoDiv.innerHTML = `Min. ${min} &#x2022; Increments of ${inc}`;
                 } else {
                   volumeInfoDiv.innerHTML = `Min. ${min} &#x2022; Max ${max} &#x2022; Increments of ${inc}`;
                 }
                 volumeInfoDiv.style.color = '#666';
               }
               
               console.log('[Cart Quantity Controls] Updated volume config:', { minimum, maximum, increments });
             }
           } catch (error) {
             console.error('[Cart Quantity Controls] Error refetching volume pricing:', error);
           }
         }).catch((error) => {
           console.error('[Cart Quantity Controls] Error in minus button update:', error);
           // Restore opacity on error
           control.style.opacity = '1';
           control.style.pointerEvents = 'auto';
         });
         
         return false;
       };
       
       minusBtn.addEventListener('click', minusClickHandler);
       console.log('[Cart Quantity Controls] Added minus click handler for variant:', variantId);
       
       // Add click event listener to plus button
       const plusClickHandler = (event) => {
         console.log('[Cart Quantity Controls] Plus button clicked, preventing default behavior');
         console.log('[Cart Quantity Controls] Event target:', event.target);
         console.log('[Cart Quantity Controls] Control element:', control);
         console.log('[Cart Quantity Controls] Control data-variant-id:', control.getAttribute('data-variant-id'));
         console.log('[Cart Quantity Controls] Control data-item-key:', control.getAttribute('data-item-key'));
         
         const cartItem = control.closest('.cart__item');
         if (cartItem) {
           console.log('[Cart Quantity Controls] Cart item data-variant-id:', cartItem.getAttribute('data-variant-id'));
           console.log('[Cart Quantity Controls] Cart item data-item-key:', cartItem.getAttribute('data-item-key'));
         }
         
         event.preventDefault();
         event.stopPropagation();
         event.stopImmediatePropagation();
         event.returnValue = false;
         
         // Check if control is already being updated
         if (control.style.opacity === '0.5') {
           console.log('[Cart Quantity Controls] Control already updating, ignoring click');
           return false;
         }
         

         
         // Reduce opacity of the entire control during update
         control.style.opacity = '0.5';
         control.style.pointerEvents = 'none';
         
         // Get the correct step value for this specific control
         const controlStepValue = control.getAttribute('data-step-value');
         const controlMinValue = control.getAttribute('data-min-value');
         const actualStepNum = controlStepValue ? Number(controlStepValue) : 1;
         const actualMinNum = controlMinValue ? Number(controlMinValue) : 1;
         
         console.log('[Cart Quantity Controls] Control step value:', controlStepValue, 'Parsed step:', actualStepNum);
         console.log('[Cart Quantity Controls] Control min value:', controlMinValue, 'Parsed min:', actualMinNum);
         
         let currentQty = parseInt(input.value, 10) || actualMinNum;
         console.log('[Cart Quantity Controls] Current quantity:', currentQty, 'Step:', actualStepNum, 'New quantity:', currentQty + actualStepNum);
         
         updateQuantity(currentQty + actualStepNum).then(async () => {
           // Restore opacity after update
           control.style.opacity = '1';
           control.style.pointerEvents = 'auto';
           
           // Refetch volume pricing and update data attributes
           try {
             console.log('[Cart Quantity Controls] Refetching volume pricing for variant:', variantId);
             const volumeConfig = await getVolumePricingConfig(variantId);
             
             if (volumeConfig && volumeConfig.volumeConfig) {
               const { minimum, maximum, increments } = volumeConfig.volumeConfig;
               
               // Update data attributes
               control.setAttribute('data-min-value', minimum || 1);
               control.setAttribute('data-max-value', maximum || Number.MAX_SAFE_INTEGER);
               control.setAttribute('data-step-value', increments || 1);
               
               // Update volume info text
               const volumeInfoDiv = control.querySelector('.volume-pricing-info');
               if (volumeInfoDiv) {
                 const min = minimum || 1;
                 const inc = increments || 1;
                 const max = maximum === Number.MAX_SAFE_INTEGER ? '∞' : (maximum || '∞');
                 
                 if (!maximum || maximum == Number.MAX_SAFE_INTEGER) {
                   volumeInfoDiv.innerHTML = `Min. ${min} &#x2022; Increments of ${inc}`;
                 } else {
                   volumeInfoDiv.innerHTML = `Min. ${min} &#x2022; Max ${max} &#x2022; Increments of ${inc}`;
                 }
                 volumeInfoDiv.style.color = '#666';
               }
               
               console.log('[Cart Quantity Controls] Updated volume config:', { minimum, maximum, increments });
             }
           } catch (error) {
             console.error('[Cart Quantity Controls] Error refetching volume pricing:', error);
           }
         }).catch((error) => {
           console.error('[Cart Quantity Controls] Error in plus button update:', error);
           // Restore opacity on error
           control.style.opacity = '1';
           control.style.pointerEvents = 'auto';
         });
         
         return false;
       };
       
       plusBtn.addEventListener('click', plusClickHandler);
       console.log('[Cart Quantity Controls] Added plus click handler for variant:', variantId);
       
       input.addEventListener('change', (event) => {
         event.preventDefault();
         event.stopPropagation();
         event.stopImmediatePropagation();
         event.returnValue = false;
         
         // Reduce opacity of the entire control during update
         control.style.opacity = '0.5';
         control.style.pointerEvents = 'none';
         
         let val = parseInt(input.value, 10);
         if (isNaN(val)) val = minNum;
         updateQuantity(val).then(async () => {
           // Restore opacity after update
           control.style.opacity = '1';
           control.style.pointerEvents = 'auto';
           
           // Refetch volume pricing and update data attributes
           try {
             console.log('[Cart Quantity Controls] Refetching volume pricing for variant:', variantId);
             const volumeConfig = await getVolumePricingConfig(variantId);
             
             if (volumeConfig && volumeConfig.volumeConfig) {
               const { minimum, maximum, increments } = volumeConfig.volumeConfig;
               
               // Update data attributes
               control.setAttribute('data-min-value', minimum || 1);
               control.setAttribute('data-max-value', maximum || Number.MAX_SAFE_INTEGER);
               control.setAttribute('data-step-value', increments || 1);
               
               // Update volume info text
               const volumeInfoDiv = control.querySelector('.volume-pricing-info');
               if (volumeInfoDiv) {
                 const min = minimum || 1;
                 const inc = increments || 1;
                 const max = maximum === Number.MAX_SAFE_INTEGER ? '∞' : (maximum || '∞');
                 
                 if (!maximum || maximum == Number.MAX_SAFE_INTEGER) {
                   volumeInfoDiv.innerHTML = `Min. ${min} &#x2022; Increments of ${inc}`;
                 } else {
                   volumeInfoDiv.innerHTML = `Min. ${min} &#x2022; Max ${max} &#x2022; Increments of ${inc}`;
                 }
                 volumeInfoDiv.style.color = '#666';
               }
               
               console.log('[Cart Quantity Controls] Updated volume config:', { minimum, maximum, increments });
             }
           } catch (error) {
             console.error('[Cart Quantity Controls] Error refetching volume pricing:', error);
           }
         }).catch((error) => {
           console.error('[Cart Quantity Controls] Error in input change update:', error);
           // Restore opacity on error
           control.style.opacity = '1';
           control.style.pointerEvents = 'auto';
         });
         
         return false;
       });
      
      console.log('[Cart Quantity Controls] Event listeners added for variant:', variantId);
      
           }).catch(error => {
       console.error('[Cart Quantity Controls] Error getting volume config for variant:', variantId, error);
     });
  });
  
  // Reset the binding flag
  window.bindingInProgress = false;
  console.log('[Cart Quantity Controls] Binding completed');
};

// Create custom quantity controls for top product embed
async function createCustomQuantityControlsForTopProduct() {
    console.log('[Top Products] Creating custom quantity controls for top product embed');
    
    try {
        // Get the top product embed element
        const topProductEmbed = document.getElementById('top-product-embed');
        if (!topProductEmbed) {
            console.warn('[Top Products] Top product embed not found');
            return;
        }
        
        console.log('[Top Products] Found top product embed:', topProductEmbed);
        
        // Find the default quantity input group
        const defaultQuantityGroup = topProductEmbed.querySelector('quantity-input.quantity');
        if (!defaultQuantityGroup) {
            console.warn('[Top Products] Default quantity input group not found');
            return;
        }
        
        console.log('[Top Products] Found default quantity group:', defaultQuantityGroup);
        
        // Hide the default quantity group
        defaultQuantityGroup.style.display = 'none';
        
        // Get volume pricing config for the top product
        const variantId = topProductExtractVariantIdFromGid(topProductState.variantId);
        console.log('[Top Products] Getting volume config for variant:', variantId);
        
        const volumeConfig = await getVolumePricingConfig(variantId);
       
        
        // Extract volume pricing values
        let volumeConfigData = volumeConfig;
        if (volumeConfig && volumeConfig.volumeConfig) {
            volumeConfigData = volumeConfig.volumeConfig;
        }
        
        const minQuantity = volumeConfigData?.minimum || 1;
        const maxQuantity = volumeConfigData?.maximum || Number.MAX_SAFE_INTEGER;
        const increment = volumeConfigData?.increment || volumeConfigData?.increments || 1;
        
        // Get current quantity
        const originalInput = defaultQuantityGroup.querySelector('input[name="updates[]"]');
        const currentQuantity = originalInput ? parseInt(originalInput.value, 10) : 1;
        
        // Create custom control HTML
        const customControlHtml = `
            <div class="quantity-control" 
                 data-variant-id="${variantId}" 
                 data-min-value="${minQuantity}"
                 data-max-value="${maxQuantity}"
                 data-step-value="${increment}"
                 style="display: flex; align-items: center; gap: 8px; margin: 8px 0;">
                <button type="button" class="quantity-minus" style="width: 32px; height: 32px; border: 1px solid #ddd; background: #fff; cursor: pointer; display: flex; align-items: center; justify-content: center; font-size: 16px;">-</button>
                <input type="number" class="quantity-input" value="${currentQuantity}" min="${minQuantity}" max="${maxQuantity}" step="${increment}" style="width: 60px; height: 32px; border: 1px solid #ddd; text-align: center; font-size: 14px;">
                <button type="button" class="quantity-plus" style="width: 32px; height: 32px; border: 1px solid #ddd; background: #fff; cursor: pointer; display: flex; align-items: center; justify-content: center; font-size: 16px;">+</button>
                <div class="volume-pricing-info" style="font-size: 12px; color: #666; margin-left: 8px;"></div>
            </div>
        `;
        
        // Insert the custom control after the default quantity group
        defaultQuantityGroup.insertAdjacentHTML('afterend', customControlHtml);
        
        // Get references to the new custom controls
        const customControl = defaultQuantityGroup.nextElementSibling;
        const customInput = customControl.querySelector('.quantity-input');
        const customMinus = customControl.querySelector('.quantity-minus');
        const customPlus = customControl.querySelector('.quantity-plus');
        const volumeInfoDiv = customControl.querySelector('.volume-pricing-info');
        
        // Update volume info display
        if (volumeInfoDiv) {
            const maxDisplay = maxQuantity === Number.MAX_SAFE_INTEGER ? '∞' : maxQuantity;
            if (!maxQuantity || maxQuantity == Number.MAX_SAFE_INTEGER) {
                volumeInfoDiv.innerHTML = `Min. ${minQuantity} &#x2022; Increments of ${increment}`;
            } else {
                volumeInfoDiv.innerHTML = `Min. ${minQuantity} &#x2022; Max ${maxDisplay} &#x2022; Increments of ${increment}`;
            }
            volumeInfoDiv.style.color = '#666';
        }
        
        // Add event listeners
        customMinus.addEventListener('click', async (event) => {
            event.preventDefault();
            event.stopPropagation();
            
            if (customControl.style.opacity === '0.5') return;
            
            customControl.style.opacity = '0.5';
            customControl.style.pointerEvents = 'none';
            
            let currentQty = parseInt(customInput.value, 10) || minQuantity;
            const newQty = Math.max(minQuantity, currentQty - increment);
            
            try {
                customInput.value = newQty;
                // Update the original input as well
                if (originalInput) {
                    originalInput.value = newQty;
                }
              
                updateTopProductPrice();
            } catch (error) {
                console.error('[Top Products] Error updating quantity:', error);
            } finally {
                customControl.style.opacity = '1';
                customControl.style.pointerEvents = 'auto';
            }
        });
        
        customPlus.addEventListener('click', async (event) => {
            event.preventDefault();
            event.stopPropagation();
            
            if (customControl.style.opacity === '0.5') return;
            
            customControl.style.opacity = '0.5';
            customControl.style.pointerEvents = 'none';
            
            let currentQty = parseInt(customInput.value, 10) || minQuantity;
            const newQty = Math.min(maxQuantity, currentQty + increment);
            
            try {
                customInput.value = newQty;
                // Update the original input as well
                if (originalInput) {
                    originalInput.value = newQty;
                }
                console.log('[Top Products] Quantity updated to:', newQty);
                updateTopProductPrice();
            } catch (error) {
                console.error('[Top Products] Error updating quantity:', error);
            } finally {
                customControl.style.opacity = '1';
                customControl.style.pointerEvents = 'auto';
            }
        });
        
        customInput.addEventListener('change', async (event) => {
            event.preventDefault();
            event.stopPropagation();
            
            if (customControl.style.opacity === '0.5') return;
            
            customControl.style.opacity = '0.5';
            customControl.style.pointerEvents = 'none';
            
            let val = parseInt(customInput.value, 10);
            if (isNaN(val)) val = minQuantity;
            val = Math.max(minQuantity, Math.min(maxQuantity, val));
            
            try {
                customInput.value = val;
                // Update the original input as well
                if (originalInput) {
                    originalInput.value = val;
                }
                console.log('[Top Products] Quantity updated to:', val);
                updateTopProductPrice();
            } catch (error) {
                console.error('[Top Products] Error updating quantity:', error);
            } finally {
                customControl.style.opacity = '1';
                customControl.style.pointerEvents = 'auto';
            }
        });
        
        console.log('[Top Products] Custom quantity controls created for top product embed');
        
    } catch (error) {
        console.error('[Top Products] Error creating custom quantity controls:', error);
    }
}