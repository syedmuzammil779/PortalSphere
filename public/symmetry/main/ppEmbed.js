const currentScript = document.currentScript || (function () {
    const scripts = document.getElementsByTagName('script');
    return scripts[scripts.length - 1];
})();

const url = new URL(currentScript.src);
const params = new URLSearchParams(url.search);
const $ = window.jQuery

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

const impulseCardGrid = 'div.grid__item.grid-product.small--one-half.medium-up--one-quarter.aos-init.aos-animate';
const productPriceSelectors = [
    //Dawn Theme
    'div.price__container',
    '.portalspere__product__price',
    'div.card-information',
    'div.price-wrapper',
    'div.price-rating',
    '.product-item .price',
    'div.product-price',
    // Warehouse Theme,
    // 'div.product-form__info-content',
    "div.product-item__price-list",
    'div.line-item__price-list',//cart price,
    'div.product-thumbnail__info-container',
    'div.modal_price',
    'product-thumbnail__info-container',  //parallax theme
    'product-block.product-block',
    '.grid-product__price',//impulse theme
    '.price__container',
    '.product-price',
    // '.price.price--on-sale', //be yours
    '.product-price--sale',
    '.product-price--regular'
];

const productCardSelectors = [
    '.portalspere__product__card',
    'div.card__information',  // Dawn Theme
    'div.product-card',       // Debut Theme
    'div.product-item',       // Other common themes
    // Warehouse Theme,
    'product-block.product-block',
    'div.grid__item.grid-product.aos-init.aos-animate',
    'div.card__section',
    'div.one-third.column.medium-down--one-half.thumbnail', // parallax theme
    'div.thumbnail',// parallax theme
    impulseCardGrid,
    '.featured-product',
    'div.grid-product__content', //Implulse theme
    'div.product-item__info',
    'tr.line-item.line-item--stack', //cart Card
    'div.product-item product-item--vertical',
    //'.card-wrapper', //flux theme - removed this for now to check the generic
    'div.one-third',  //parallax theme
    '.js-product product-info quickbuy-content spaced-row container',
    '.grid__item',
    '.js-pagination-result'
    // '.product-block',
    // '.product-block.grid__item.one-quarter.small-down--one-half'
];

const productCardHeadingSelectors = [
    '.portalspere__product__card__heading',
    'h3.card__heading',          // Dawn Theme
    '.product-title',            // Debut Theme
    '.product-item__title',       // Warehouse Theme
    'h2.product-grid-item__title',// Some other themes
    "div.container .column",
    "div.grid-product",
    'div.product-thumbnail__title-container' //parallax theme
];

const storeType = config.storeType;
const customerId = config.customerId;
const isB2B = storeType === 'B2B' ? true : false;
const isHybrid = (storeType === 'Hybrid' || !storeType) ? true : false;
const isCustomerLoggedIn = (customerId !== null) ? true : false;

(async function () {
    const style = document.createElement('style');
    style.innerHTML = `
    @keyframes cart-btn-loading-spinner {
    to { transform: rotate(360deg); }
    }
  `;
    document.head.appendChild(style);
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
              document.querySelectorAll('form[method="post"]').forEach(el => { el.remove() })
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
                  window.productPageState.new.productQuantityElement.insertAdjacentElement('afterend', quantityInfo);
                }
            } catch (error) {
                console.log('error in line 168');
                console.log(error.message);
            }

            
        }
        return;
    }
    if ((isB2B || isHybrid) && isCustomerLoggedIn && customerTag) {
        const currentPage = window.location.pathname;
        if (currentPage.includes('/products/')){
            window.productPageService.createProductPageCustomPricing();
            console.log(window.productPageState.new.productPriceElement)
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
                console.log("updating product element");
                updateProductElement(),
                updateProductButtons()
            }
        }
    }
    const target = document.querySelector('cart-drawer');
    const rows = $('div[data-merge-list-item]')

    if (rows.length > 0) {
      addTopupButtons(rows)
    }

    if (target) {
      function debounce(fn, delay) {
        let timeout;
        return function(...args) {
          clearTimeout(timeout);
          timeout = setTimeout(() => fn.apply(this, args), delay);
        };
      }

      const debouncedAddTopupButtons = debounce(() => {
        const rows = $('div[data-merge-list-item]');
        addTopupButtons(rows);
      }, 200);

      const observer = new MutationObserver(function (mutationList) {
        mutationList.forEach((mut) => {
          const hasAll = ['cart-drawer__title', 'h4', 'heading-font']
            .every(cls => mut.target.classList.contains(cls));

          if (hasAll) {
            debouncedAddTopupButtons();
          }
        });
      });

      observer.observe(target, {
        childList: true,
        subtree: true,
        attributes: true,
      });
    }

    // get products cards and pricing
    const productCards = getProductsCards();
    try {
      $('a.quickbuy-toggle').css({"display":"none"});
      $("product-block span.price__current").text("Loading...")
      $("product-block span.price__was").css("display", "none")
      const pricingData = await window.productPricingService.getVolumePricingBulkByHandleArray(
        config.appDomain,
        config.shopDomain,
        config.apiKey,
        config.timestamp,
        config.hmac,
        config.customerId,
        productCards
      )
      pricingData.data.map((item) => {
        const { productVariantHandle: name, returnData } = item
        const { priceConfig } = returnData
        if (priceConfig.length > 1) {
          const { price: highestPrice, currencySymbol, currencyCode } = priceConfig[0];
          const { price: lowestPrice } = priceConfig[priceConfig.length - 1];

          const content = `
              <b>From ${currencySymbol}${lowestPrice} - ${currencySymbol}${highestPrice}</b>
          `
          $(`product-block:has(a[href*='/products/${name}']) span.price__current`).html(content)
        }
        else if (priceConfig.length == 1) {

          const { price, originalPrice, currencySymbol, currencyCode } = priceConfig[0];
          const content = `<b>${currencySymbol}${price}</b> <s style="font-size: 1.2rem">MSRP ${currencySymbol}${originalPrice}</s>`
          $(`product-block:has(a[href*='/products/${name}']) span.price__current`).html(content)
        }
      })
    } catch (error) {
      console.error(error)
    }

})();


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

        if (Shopify.theme.name === "Expression") {
            const productNameElement = cardElement.querySelector('.product-block__title');
            const productName = productNameElement ? productNameElement.textContent.trim() : null;
            const Id = getProductIdFromScript(productName);
            const link = cardElement.querySelector('.product-block__link');
            let productId = null;
            if (link) {
                const url = new URL(link.href, window.location.origin);
                const params = new URLSearchParams(url.search);
                productId = params.get('pr_rec_pid');
            }
            if(Id) {
                return Id
            }
            if(productId) {
                return productId
            }
            return null;
        }

        const productIdInp = cardElement.querySelector('input[name="product-id"]');
        if (productIdInp && productIdInp.value && typeof productIdInp.value === "string") {
            return productIdInp.value;
        }

        const modal = document.querySelector('theme-modal[data-product-url]');
        const productUrl = modal?.getAttribute('data-product-url');
        if (productUrl) {
            const urlParams = new URLSearchParams(productUrl.split('?')[1]);
            const variantId = urlParams.get('variant');
            if (variantId) return variantId;
        }

        for (let selector of productCardHeadingSelectors) {
            heading = cardElement.querySelector(selector);
            if (heading) break;
        }

        if (heading && heading.id && typeof heading.id === "string") {
            const idParts = heading.id.split("-");
            return idParts[idParts.length - 1];
        }

        const productLink = cardElement.querySelector('.product-grid--price a[data-product-id]');
        const productId = productLink?.dataset.productId;
        if (productId)
            return productId;

        const productIdInput = cardElement.querySelector('input[name="product-id"]');
        const variantIdInput = cardElement.querySelector('form[action="/cart/add"] input[name="id"]');
        if (productIdInput?.value && typeof productIdInput.value === "string") {
            return productIdInput.value || productIdInput.dataset?.productId;
        }
        if (variantIdInput?.value) {
            return variantIdInput.value;
        }

        const attrProductId = cardElement.getAttribute('data-product-id');
        if (attrProductId)
            return attrProductId;

        const quickShopElement = cardElement.querySelector('.quick_shop');
        if (quickShopElement) {
            const dataSrc = quickShopElement.getAttribute('data-src');
            if (dataSrc) {
                const productIdFromSrc = dataSrc.match(/fancybox-product-(\d+)/)?.[1];
                if (productIdFromSrc) return productIdFromSrc;
            }
            const dataGallery = quickShopElement.getAttribute('data-gallery');
            if (dataGallery) {
                const productIdFromGallery = dataGallery.match(/product-(\d+)-gallery/)?.[1];
                if (productIdFromGallery) return productIdFromGallery;
            }
        }

        if (cardElement.classList.contains('product-block')) {
            const productId = cardElement.getAttribute('data-product-id');
            if (productId)
                return productId;
        }

        const link = cardElement.querySelector('a.link.text--strong');
        if (link) {
            const variantIdMatch = link.href.match(/variant=(\d+)/);
            if (variantIdMatch) {
                return variantIdMatch[1];
            }
        }
        return null;
    } catch (error) {
        return null;
    }
}

function getProductsCards() {
  let handleArr = []
  const itemLinks = document.querySelectorAll("a.product-link[aria-hidden]")
  itemLinks.forEach((item) => {
    const link = item.getAttribute("href")
    const handleVariant = link.split("/products/")[1]
    const handle = handleVariant.split("?")[0]
    handleArr.push(handle)
  })
  return handleArr
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

async function addTopupButtons(rowData) {
  $("cc-cart-cross-sell").css("display", "none")
  const spinner = createSpinner()
  rowData.map(function () {
    let addButton
    const container = $(this).find('div.cart-item__quantity');
    const foundButton = container.find('button[type="button"].to-next-interval')
    if (foundButton.length < 1) {
      addButton = $('<button type="button" class="to-next-interval"></button>').css({
        "background-color": "black",
        "width": "142px",
        "color": "white",
        "padding": "10px 5px",
        "margin-top": "10px",
        "border": "none",
      }).click(() => {
        $(this).find("a.quantity-up").trigger("click")
      })
      container.after(addButton)
    }
    else {
      addButton = foundButton.first()
    }
    const spinEl = addButton.find("svg")
    if (spinEl.length == 0) {
      addButton.html(spinner)
    }
    addButton.prop("disabled", true)

    const addBtn = $(this).find("a.quantity-up")
    const minusBtn = $(this).find("a.quantity-down")
    addBtn.attr("href", "")
    minusBtn.attr("href", "")

    const variantId = $(this).attr("data-merge-list-item").split(":")[1]
    addBtn.click(async (e) => {
      e.preventDefault()
      e.stopPropagation()
      const quantitySelector = $(this).find("input[type='number']")
      quantitySelector[0].stepUp()
      const quantity = quantitySelector.val()
      $(this).find("div.cart-item__column.cart-item__price").html(createSpinner("black"))
      await window.cartService.updateProductToCart(variantId, quantity)
    })
    minusBtn.click(async (e) => {
      e.preventDefault()
      e.stopPropagation()
      const quantitySelector = $(this).find("input[type='number']")
      quantitySelector[0].stepDown()
      const quantity = quantitySelector.val()
      $(this).find("text-component").html(createSpinner("black"))
      await window.cartService.updateProductToCart(variantId, quantity)
    })
  });

  let volData

  try {
    volData = await getVolumePricingData(rowData)
  }
  catch (error) {
    console.log(error)
    return
  }
  const intervalInfo = calculateIntervalData(volData)

  intervalInfo.map(({ name, amountToAdd, benefit, benefitType, currencySymbol }) => {
    let button = $(`div[data-merge-list-item]:has(a[href^="/products/${name}"]) button.to-next-interval`)
    if (!name || !amountToAdd || !benefit || !benefitType || !currencySymbol) {
      button.remove()
    }
    else {
      let amountOff
      if (benefitType === "percentage") {
        amountOff = `${benefit}%`
      }
      else {
        amountOff = `${currencySymbol}${benefit}`
      }
      button.html(`Add ${amountToAdd}, Get ${amountOff} extra off`)
      button.prop("disabled", false)
    }
  })
}

function createSpinner(color = "white") {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-loader-circle-icon lucide-loader-circle" style="color:${color}; animation: cart-btn-loading-spinner 1s linear infinite; display: inline-block; margin-top: 3px;">
    <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
  </svg>`
}

/** Gets the volume price data for the items in the cart
 *
 * @param {Array<jQuery>} rowData - A list of jQuery wrapped html elements
 *
 * @returns volumeData - volume pricing data for the cart items
 */
async function getVolumePricingData(rowData) {
  const items = getItemsFromRowData(rowData)
  if (items.length == 0) {
    return
  }

  if (window.localStorage) {
    const volumeData = window.localStorage.getItem("volumeData")
    if (volumeData) {
      const jsonData = JSON.parse(volumeData)
      let cacheValid = true
      for (const item of items) {
        const found = jsonData.some(obj => obj.productVariantHandle === item);
        if (!found) {
          cacheValid = false
          break
        }
      }
      if (cacheValid) {
        return jsonData
      }
    }
  }

  let data
  try {
    data = await getProductVolumePricingByHandleArr(items);
  }
  catch (error) {
    console.log(error)
    throw error
  }
  const itemData = data.data
  if (window.localStorage){
    window.localStorage.setItem("volumeData", JSON.stringify(itemData))
  }
  return itemData
}

/** Fetching items from row data
 *
 * @param {Array<jQuery>} rowData - An array of jQuery wrapped html elements
 *
 * @return {Array<string>} - items - An array of items names
 */
function getItemsFromRowData(rowData) {
  const hrefs = rowData.map(function () {
    return $(this).find('a').first().attr('href');
  }).get();
  if (hrefs.length == 0) {
    return
  }

  const items = hrefs.map(item => {
    const segments = item.split('?')[0].split('/');
    return segments.pop()
  })
  return items
}

/** Calculates the amount required to hit the next interval and the
 *  % reduction in price at the next interval
 *
 * @param {Object} volumeData - Volume pricing data for the objects in cart
 *
 * @returns {Array<Object>} priceIntervalInfo - The price intervals for the items in the cart
 */
function calculateIntervalData(volumeData) {
  let priceIntervalInfo = []
  volumeData.map((item) => {
    const { productVariantHandle, returnData } = item
    const { priceConfig, volumeConfig } = returnData
    const row = $(`div[data-merge-list-item]:has(a[href^="/products/${productVariantHandle}"])`).first()
    const quantityInput = row.find('input[type="number"]')
    const quantity = quantityInput.val()
    if (!quantity) {
      return
    }
    quantityInput.attr("max", volumeConfig.maximum)
    quantityInput.attr("step", volumeConfig.increment)
    quantityInput.attr("min", "0")
    quantityInput.prop("disabled", true)


    // INFO: Find the current interval
    const intervals = findIntervalAndNext(quantity, priceConfig)

    const { current, next } = intervals
    if (!current || !next) {
      return priceIntervalInfo.push({
        "name": productVariantHandle,
        "amountToAdd": null,
        "benefit": null,
        "currencySymbol": null,
        "benefitType": null,
      })
    }
    const quantityToAdd = parseInt(next.quantity) - parseInt(quantity)

    let benefit
    if (returnData.type === "fixedAmount"){
      benefit = parseInt(current.percentage) - parseInt(next.percentage)
    }
    else {
      benefit = parseInt(next.percentage) - parseInt(current.percentage)
    }

    priceIntervalInfo.push({
      "name": productVariantHandle,
      "currencySymbol": returnData.priceConfig[0].currencySymbol,
      "amountToAdd": quantityToAdd,
      "benefitType": returnData.type === "fixedAmount" ? "fixedAmount" : "percentage",
      "benefit": benefit
    })
  })
  return priceIntervalInfo
}

/** Finds the current quantity interval and the next interval
 *
 * @param {string} currentQuantity - The current quantity of the item in the cart
 * @param {Array<Object>} intervalData - The data of the price and quantity intervals
 *
 * @returns {Object} intervals - An object with the key current, displaying the current interval
 * and next, displaying the next interval
 */
function findIntervalAndNext(currentQuantity, intervalData) {
  const numX = parseInt(currentQuantity);

  for (let i = 0; i < intervalData.length; i++) {
    const min = parseInt(intervalData[i].quantity);
    const max = parseInt(intervalData[i].maxQuantity);


    if (numX >= min && numX <= max) {
      const current = intervalData[i];
      const next = intervalData[i + 1] || null;
      return { current, next };
    }
  }

  return { current: null, next: null };
}

async function getProductVolumePricingByHandleArr(handleArr) {
  const customerId = config.customerId;
  const shop = config.shopDomain;

  return await window.productPricingService.getVolumePricingBulkByHandleArray(
    config.appDomain,
    shop,
    config.apiKey,
    config.timestamp,
    config.hmac,
    customerId,
    handleArr
  );
}
