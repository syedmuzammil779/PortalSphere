const currentScript = document.currentScript || (function () {
  const scripts = document.getElementsByTagName('script');
  return scripts[scripts.length - 1];
})();

const $ = window.jQuery
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
  hmac: params.get("hmac"),
  productVariantId: params.get("productVariantId"),
  productId: params.get("productId"),
  enableTopProducts: params.get("enableTopProducts")
};


let quantitySelector = "div.price-per-item__container input[class='quantity__input']"
let priceSelector = ".price-item.price-item--regular"


var Shopify = Shopify || {};
Shopify.theme = Shopify.theme || {};

$(document).ready(async function () {

  if (!config.customerId) {
    return
  }

  // INFO: Cart update embed
  const target = document.getElementById('CartDrawer');

  // INFO: Add a spinner style to the dom
  const style = document.createElement('style');
  style.innerHTML = `
@keyframes cart-btn-loading-spinner {
  to { transform: rotate(360deg); }
  }
`;
  document.head.appendChild(style);

  const rows = $('tbody[role="rowgroup"] tr')

  if (rows.length > 0) {
    addTopupButtons(rows)
  }

  if (target) {
    const observer = new MutationObserver(function (mutationList) {
      mutationList.forEach((mut) => {
        const hasAll = ['drawer__inner', 'gradient', 'color-scheme-1'].every(cls => mut.target.classList.contains(cls))
        if (hasAll) {
          // INFO: Update here
          const rows = $('tbody[role="rowgroup"] tr')
          if (rows.length > 0) {
            addTopupButtons(rows)
          }
        }
      })
    });

    observer.observe(target, {
      childList: true,
      subtree: true,
      attributes: true,
    });
  }

  let min, max, step
  let priceCfg
  let handleArray

  if (!window.location.pathname.includes('products')) {
    handleArray = fetchItemNames('a.full-unstyled-link')
    if (!handleArray) {
      return
    }
    await populateHomePagePrices(handleArray)
  }
  else {
    setTimeout(async () => {
      handleArray = fetchItemNames('h3.card__heading.h5 a.full-unstyled-link')
      if (!handleArray) {
        return
      }
      await populateHomePagePrices(handleArray)
    }, 500)


  }

  try {
    const productPricing = await getProductPricing()
    const { volumeConfig, priceConfig } = productPricing;
    priceCfg = priceConfig
    window.productPageState.productVolumePricing = {
      volumeConfig: volumeConfig
    }

    // if we didnt get a volume config
    if (volumeConfig === undefined || volumeConfig === null) {
      min = 1, max = Number.MAX_SAFE_INTEGER, step = 1
    }
    else {
      const { minimum, maximum, increment } = volumeConfig;
      min = isNull(minimum) ? 1 : minimum
      max = isNull(maximum) ? Number.MAX_SAFE_INTEGER : maximum
      step = isNull(increment) ? 1 : increment
    }
  }
  catch (error) {
    // INFO: if we get an error at this point we need to return
    console.error(error)
    return
  }

  // INFO: element definitions
  const quantity = $(quantitySelector).first()
  const priceEl = $(priceSelector).first()

  // INFO: pricing code
  $(quantitySelector).change(() => updatePrice(priceCfg, priceEl, quantity.val()))

  //  INFO: Disable edit and set increments
  setInputAttr(quantity, min, max, step)
  updatePrice(priceCfg, priceEl, quantity.val())

  const priceInput = $(".price-per-item__container")
  priceInput.css({
    "flex-direction": "column",
    "align-items": "flex-start"
  })
  const minInc = $("<span style='font-size: 1.2rem'></span>").text(`Min. ${min} • Increments of ${step}`)
  priceInput.append(minInc)

  // INFO: prevent changes to input selector
  const inputSelector = document.querySelector('div.product__info-wrapper.grid__item.scroll-trigger.animate--slide-in quantity-input input');
  const observer = new MutationObserver((mutationsList) => {
    for (const mutation of mutationsList) {
      if (
        mutation.type === 'attributes' &&
        mutation.attributeName === 'data-cart-quantity'
      ) {
        setInputAttr(quantity, min, max, step)
      }
    }
  });

  observer.observe(inputSelector, {
    attributes: true,
    attributeFilter: ['data-cart-quantity']
  });
})

/** Sets the attributes for an input
 *
 *
 */
function setInputAttr(quantity, min, max, step) {
  quantity.attr("min", `${min}`)
  quantity.attr("readonly", "")
  quantity.val(`${min}`)
  quantity.attr("max", `${max}`)
  quantity.attr("step", `${step}`)
}

/** Fetches the name of the items that match the selector
 *
 * @param {string} selector - CSS selector for the items
 */
function fetchItemNames(selector) {
  let handleArray = []
  const cardElements = document.querySelectorAll(selector)
  if (!cardElements) {
    return;
  }
  cardElements.forEach(el => {
    if (el.href.includes('/products/')) {
      var href = el.href.split('/products/')[1];
      if (!handleArray.includes(href)) {
        const itemName = href.split("?")[0]
        handleArray.push(itemName);
      }
    }
  });
  return handleArray
}


/** Fetched product pricing by ID
 *
 * @param {string} productId - The id of the product
 *
 * @returns {Object} productData - Product pricing data from API
 */
const getProductPricing = async () => {
  try {
    const response = await fetch(`https://${config.appDomain}/api/volume-pricing?shop=${config.shopDomain}&api_key=${config.apiKey}&timestamp=${config.timestamp}&hmac=${config.hmac}&customer=${config.customerId}&productId=${config.productId}&productVariantId=${config.productVariantId}`);
    return await response.json();
  }
  catch (error) {
    throw error
  }
}

/** Change price state
 *
 * @param {string} priceCfg - The pricing config
 * @param {jQuery} target - jQuery wrapped HTMLElement that is the taget for the changes
 * @param {number} currentQuantity - Current quantity selected
 *
 */
const updatePrice = (priceCfg, target, currentQuantity) => {
  const currentPriceSlab = priceCfg.find(cfg => {
    const min = parseFloat(cfg.quantity);
    const max = parseFloat(cfg.maxQuantity);
    return currentQuantity >= min && currentQuantity <= max;
  })
  const { currencySymbol, price, currencyCode, originalPrice } = currentPriceSlab
  const msrp = `<span style="font-size: 1.2rem"><s>MSRP ${currencySymbol}${originalPrice} ${currencyCode}</s></span>`
  target.html(`<b>${currencySymbol}${price} ${currencyCode}</b> ${msrp}`)
}


/** Gets volume pricing data for the defined array of elements
 *
 * @param {Array<string>} handleArr - the names of all the elements that need volume pricing fetched
 *
 * @returns {Object} volumePricingData
 */
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

/** Populates prices on the home page adhering to volume pricing
 *
 */
async function populateHomePagePrices(handleArray, containerSelector) {
  if (handleArray.length < 1) {
    return;
  }

  console.log('handleArray', handleArray);

  const priceArray = document.querySelectorAll('div.price__container .price__regular .price-item, div.price__container .price__sale .price-item');
  priceArray.forEach((el) => {
    el.innerHTML = 'Loading...'
  })

  // some presets
  $('div.price--on-sale .price__sale').first().css("display", "none")
  $('div.price--on-sale .price__regular').first().css("display", "block")
  $('div.price--on-sale .price-item.price-item--regular').css({
    "text-decoration": "none",
    "font-size": "1.6rem",
    "color": "#000"
  })

  const response = await getProductVolumePricingByHandleArr(handleArray);
  if (response != null && response.hasOwnProperty('count')) {
    if (response.count > 0) {
      for (var i in response.data) {
        const { returnData, productVariantHandle } = response.data[i];
        const { priceConfig } = returnData

        const priceContainer = $(`div.card.card--standard:has(a[href^="/products/${productVariantHandle}"])`)
        if (priceConfig.length > 1) {
          const { price: highestPrice, currencySymbol, currencyCode } = priceConfig[0];
          const { price: lowestPrice } = priceConfig[priceConfig.length - 1];

          const content = `
              <b>From ${currencySymbol}${lowestPrice} - ${currencySymbol}${highestPrice} ${currencyCode}</b>
          `
          priceContainer.find('.price__regular .price-item').html(content)
        }
        else if (priceConfig.length == 1) {

          const { price, originalPrice, currencySymbol, currencyCode } = priceConfig[0];
          const content = `<b>${currencySymbol}${price} ${currencyCode}</b> <s style="font-size: 1.2rem">MSRP ${currencySymbol}${originalPrice} ${currencyCode}</s>`
          priceContainer.find('.price__regular .price-item').html(content)
        }
      }
    }
  }
}

/** This function is responsible for adding buttons that encourage
 * the user to add more to their cart
 *
 * @param {Array<jQuery>} rowData - An array of jQuery wrapped html elements
 */
async function addTopupButtons(rowData) {
  const spinner = createSpinner()
  rowData.map(function () {
    let addButton
    const container = $(this).find('quantity-popover');
    const foundButton = container.find('button[type="button"].to-next-interval')
    if (foundButton.length < 1) {
      addButton = $('<button type="button" class="to-next-interval"></button>').css({
        "background-color": "black",
        "border-radius": "7px",
        "width": "142px",
        "color": "white",
        "padding": "10px 5px",
        "border": "none"
      }).click(() => {
        $(this).find("button.quantity__button[name='plus']").trigger("click")
      })
      container.append(addButton)
    }
    else {
      addButton = foundButton.first()
    }
    const spinEl = addButton.find("svg")
    if (spinEl.length == 0) {
      addButton.html(spinner)
    }
    addButton.prop("disabled", true)
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
    let button = $(`div.drawer__cart-items-wrapper tr.cart-item:has(a[href^="/products/${name}"]) button.to-next-interval`)
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
    const row = $(`tr.cart-item:has(a[href^="/products/${productVariantHandle}"])`).first()
    const quantityInput = row.find('input.quantity__input')
    const quantity = quantityInput.val()
    if (!quantity) {
      return
    }

    quantityInput.attr("max", volumeConfig.maximum)
    quantityInput.attr("step", volumeConfig.increment)
    quantityInput.attr("min", volumeConfig.minimum)
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
    if (returnData.type === "percentage"){
      benefit = parseInt(next.percentage) - parseInt(current.percentage)
    }
    else {
      benefit = parseInt(current.percentage) - parseInt(next.percentage)
    }

    priceIntervalInfo.push({
      "name": productVariantHandle,
      "currencySymbol": returnData.priceConfig[0].currencySymbol,
      "amountToAdd": quantityToAdd,
      "benefitType": returnData.type,
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

/** Generates html for a loading spinner
 *
 *
 */
function createSpinner() {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-loader-circle-icon lucide-loader-circle" style="color:white; animation: cart-btn-loading-spinner 1s linear infinite; display: inline-block; margin-top: 3px;">
    <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
  </svg>`
}
