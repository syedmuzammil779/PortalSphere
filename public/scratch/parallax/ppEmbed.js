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


let quantitySelector = "div[data-attr='quantity-selector-div'] input[type='number']"
let priceSelector = "p.modal_price span.money"


var Shopify = Shopify || {};
Shopify.theme = Shopify.theme || {};

$(document).ready(async function () {
  // INFO: mod cart
  modCartDrawer()

  const style = document.createElement('style');
  style.innerHTML = `
  #cart ::-webkit-scrollbar {
    width: 6px;
  }
  #cart ::-webkit-scrollbar-thumb {
    background: #fff;
    border-radius: 10px;
  }
  @keyframes cart-btn-loading-spinner {
    to { transform: rotate(360deg); }
    }
  input::-webkit-outer-spin-button,
  input::-webkit-inner-spin-button {
    -webkit-appearance: none;
    margin: 0;
  }
`
  // INFO: Add a spinner style to the dom
  document.head.appendChild(style);

  if (!config.customerId) {
    return
  }

  // INFO: Cart update embed
  const target = document.getElementById('cart');


  let min, max, step
  let priceCfg
  let handleArray

  if (!window.location.pathname.includes('products')) {
    handleArray = fetchItemNames('a.thumbnail__link')
    if (!handleArray) {
      return
    }
    await populateHomePagePrices(handleArray, "collections/all/products")
  }
  else {
    setTimeout(async () => {
      handleArray = fetchItemNames('a.thumbnail__link')
      if (!handleArray) {
        return
      }
      await populateHomePagePrices(handleArray, "products")
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

  // INFO: create a quantity selector
  if($('div.swatch-options').length > 0) {
    $('div.swatch-options').after('<div data-attr="quantity-selector-div" style="display: flex"></div>')
  }
  else {
    $('grailpay-shopify-widget').after('<div data-attr="quantity-selector-div" style="display: flex"></div>')
  }
  $('div[data-attr="quantity-selector-div"]').html(createQuantitySelector({
    borderColor: "black",
    minusColor: "gray",
    plusColor: "black",
    quantityColor: "black"
  }))

  quantitySelectorBtnEvts('div[data-attr="quantity-selector-div"]', "black")
  $(quantitySelector).attr({
    "product-id": config.productId,
    "variant-id": config.productVariantId,
  })


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

  // INFO: prevent changes to input selector (dont think i need this for now)

  // const inputSelector = document.querySelector('div.product__info-wrapper.grid__item.scroll-trigger.animate--slide-in quantity-input input');
  // const observer = new MutationObserver((mutationsList) => {
  //   for (const mutation of mutationsList) {
  //     if (
  //       mutation.type === 'attributes' &&
  //       mutation.attributeName === 'data-cart-quantity'
  //     ) {
  //       setInputAttr(quantity, min, max, step)
  //     }
  //   }
  // });
  //
  // observer.observe(inputSelector, {
  //   attributes: true,
  //   attributeFilter: ['data-cart-quantity']
  // });
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
  $("p.modal_price span.was_price span.money").text("")
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
async function populateHomePagePrices(handleArray, linkPrefix) {
  if (handleArray.length < 1) {
    return;
  }

  console.log('handleArray', handleArray);

  const selector = 'a.thumbnail__link span.thumbnail__price'

  const priceArray = document.querySelectorAll(selector);
  priceArray.forEach((el) => {
    if (el.classList.contains('sale')){
      el.classList.remove('sale')
    }
    if (el.querySelector(".was_price")){
      el.querySelector(".was_price").remove()
    }
    if (el.querySelector("small")){
      el.querySelector("small").remove()
    }
    el.querySelector('.money').innerHTML = 'Loading...'
  })

  // some presets
  $(`${selector} span.money`).css({
    "text-decoration": "none",
    "font-size": "1rem",
    "color": "#000"
  })

  const response = await getProductVolumePricingByHandleArr(handleArray);
  if (response != null && response.hasOwnProperty('count')) {
    if (response.count > 0) {
      for (var i in response.data) {
        const { returnData, productVariantHandle } = response.data[i];
        const { priceConfig } = returnData

        const priceContainer = $(`a[href^="/${linkPrefix}/${productVariantHandle}"]`)
        if (priceConfig.length > 1) {
          const { price: highestPrice, currencySymbol, currencyCode } = priceConfig[0];
          const { price: lowestPrice } = priceConfig[priceConfig.length - 1];

          const content = `
              <b>From ${currencySymbol}${lowestPrice} - ${currencySymbol}${highestPrice} ${currencyCode}</b>
          `
          priceContainer.find('span.money').html(content)
        }
        else if (priceConfig.length == 1) {

          const { price, originalPrice, currencySymbol, currencyCode } = priceConfig[0];
          const content = `<b>${currencySymbol}${price} ${currencyCode}</b> <s style="font-size: 0.8rem">MSRP ${currencySymbol}${originalPrice} ${currencyCode}</s>`
          priceContainer.find('span.thumbnail__price span.money').html(content)
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
    const container = $(this).find('div.cart-item-data');
    const foundButton = container.find('button[type="button"].to-next-interval')
    if (foundButton.length < 1) {
      addButton = $('<button type="button" class="to-next-interval"></button>').css({
        "background-color": "black",
        "border-radius": "7px",
        "width": "142px",
        "font-size": "0.8rem",
        "color": "white",
        "margin-top": "10px",
        "padding": "10px 5px",
        "border": "none"
      }).click((e) => {
        e.preventDefault()
        $(this).find("button[data='quantity-plus']").trigger("click")
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
    let button = $(`div[data-cart-product]:has(a[href^="/products/${name}"]) button.to-next-interval`)
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
    const row = $(`div[data-cart-product]:has(a[href^="/products/${productVariantHandle}"])`).first()
    const quantityInput = row.find('input')
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

/** Generates html for a loading spinner
 *
 *
 */
function createSpinner() {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-loader-circle-icon lucide-loader-circle" style="color:white; animation: cart-btn-loading-spinner 1s linear infinite; display: inline-block; margin-top: 3px;">
    <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
  </svg>`
}

/** Creates a quantity Selector
 *
 */
function createQuantitySelector(style) {
  return `
    <div style="display: flex; justify-items: center; border: 1px solid ${style.borderColor}; width: fit-content;" data-attr="quantity-input">
      <button type="button" style="background-color: transparent; border: none; color: ${style.minusColor};" data="quantity-minus">
        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-minus-icon lucide-minus"><path d="M5 12h14"/></svg>
      </button>

      <input class="product-quantity-input" type="number" value="${1}" min="${1}" step="${1}" max="${Number.MAX_SAFE_INTEGER}" style="border:none; text-align: center; margin:0; width: 30px; padding: 0px; -moz-appearance: textfield; background-color: transparent; color: ${style.quantityColor}">

      <button type="button" style="background-color: transparent; border: none; color: ${style.plusColor};" data="quantity-plus">
        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-plus-icon lucide-plus"><path d="M5 12h14"/><path d="M12 5v14"/></svg>
      </button>
    </div>
  `
}
window.createQuantitySelector = createQuantitySelector


/**  Gives the + and - buttons click evt listeners
 *
 * @param {string} selector - The selector for the parent div of the button
 */
function quantitySelectorBtnEvts(selector, activeColor){
  function decideBtnColor(el) {
    const val = el.val()
    if (val === el.attr("max")) {
      addBtn.css({
        "color": "gray"
      })
    }
    else {
      addBtn.css({
        "color": activeColor
      })
    }
    if (val === el.attr("min")) {
      minusBtn.css({
        "color": "gray"
      })
    }
    else {
      minusBtn.css({
        "color": activeColor
      })
    }
  }
  const el = $(selector).find("input[type='number']")

  const addBtn = $(selector).find("button[data='quantity-plus']")
  const minusBtn = $(selector).find("button[data='quantity-minus']")

  addBtn.click((e) => {
    e.preventDefault()
    el[0].stepUp()
    el.trigger("change")
  })
  minusBtn.click((e) => {
    e.preventDefault()
    el[0].stepDown()
    el.trigger("change")
  })
  decideBtnColor(el)
  el.on("change", () => {
    decideBtnColor(el)
  })
}

/** For a supplied var, conducts various tests to check for null values
 * returns True if null
 *
 * @param {jQuery[]} item - Any variable that is nullable
 * @returns boolean
 */
function isNull(item) {
  if (
    item === null ||
    item === "null" ||
    item === undefined ||
    item === "undefined"
  ) return true

  // in the case that it is defined
  return false
}
window.quantitySelectorBtnEvts = quantitySelectorBtnEvts

async function modCartDrawer() {
  makeCartTemplate()
  let cartData, volumeData
  try {
    cartData = await window.cartService.getCart()
    const cartItems = cartData.items.map(obj => obj.handle)
    volumeData = await window.productPricingService.getVolumePricingBulkByHandleArray(
      config.appDomain,
      config.shopDomain,
      config.apiKey,
      config.timestamp,
      config.hmac,
      config.customerId,
      cartItems
    )
  } catch (error) {
    console.log(error)
  }
  if (cartData.items.length == 0) {
    $("div.custom-cart-drawer").remove()
    const cartDrawer = $("<div class='custom-cart-drawer'></div>").css({
      "height": "100%",
      "display": "flex",
      "justify-items": "center",
      "justify-content": "center",
      "flex-direction": "column",
      "padding": "20px",
    }).html("<h1 style='color: white;'>No items in Cart</h1>")
    $("#cart .mm-panels").append(cartDrawer)
    return
  }
  const cartContainer = $("#cart div.custom-cart-content").html("")
  let total = 0
  $("section.section li.cart span").text(cartData.item_count)
  const addToTotal = (amount) => { total += amount }
  cartData.items.map(el => {
    createCartItem(el, volumeData, cartContainer, addToTotal)
  })
  $("div.subtotal-row-price").html(`<b>${volumeData.data[0].returnData.priceConfig[0].currencySymbol} <span class="subtotal-total-price">${total.toFixed(2)}</span></b>`)

  await addTopupButtons($("div[data-cart-product]"))
  const target = document.querySelector("li.cart a[href='#cart'] span")
  if (target) {
    const observer = new MutationObserver(function (mutationList) {
      mutationList.forEach((mut) => {
        if (mut.addedNodes.length > 0) {
          addTopupButtons($("div[data-cart-product]"))
        }
      })
    });

    observer.observe(target, {
      childList: true,
      subtree: true,
      attributes: true,
    });
  }
}

/** Create cart item
 *
 *
 */
function createCartItem(el, volumeData, cartContainer, addToTotal){
  const elVolumeData = volumeData.data.find(data => data.productVariantHandle === el.handle)
  let cartEl = constructCartElement(el, elVolumeData, addToTotal)
  cartContainer.append($(cartEl))
  const trashBtn = $(`<button style="background-color: transparent; border:none;" type="button" class="cart-item-delete" variant-id="${el.variant_id}">
    ${trashSvg}
    </button>`)
  trashBtn.click((e) => {
    e.preventDefault()
    cartContainer.find(`div[data-cart-product="${el.handle}"] div.quantity-selector-container input`).val("0").trigger("change")
  })
  cartContainer.find(`div[data-cart-product="${el.handle}"] div.quantity-selector-container`).append(createQuantitySelector({
    borderColor: "white",
    minusColor: "gray",
    plusColor: "white",
    quantityColor: "white"
  }), trashBtn)
  cartContainer.find(`div[data-cart-product="${el.handle}"] div.quantity-selector-container input`).attr({
    "min": elVolumeData.returnData.volumeConfig.minimum,
    "max": elVolumeData.returnData.volumeConfig.maximum,
    "step": elVolumeData.returnData.volumeConfig.increment,
    "value": el.quantity,
    "variant-id": el.variant_id,
    "product-id": el.product_id,
    "readonly": "true"
  })
  quantitySelectorBtnEvts(`div[data-cart-product="${el.handle}"] div.quantity-selector-container`, "white")
  cartQuantityChangeListener(
    `div[data-cart-product="${el.handle}"] div.quantity-selector-container input`,
    `div[data-cart-product="${el.handle}"] div.subtotal-price-el`
  )
}

/** Plugs listeners to handle increments/decrements
 *
 *
 *
 */
function cartQuantityChangeListener(inputSelector, priceSelector){
  $(inputSelector).change(() => {
    $(priceSelector).find("span.subtotal-price-with-curr").css("display", "none")
    $(priceSelector).find("span.subtotal-price-loading").css("display", "flex")
    const quantity = $(inputSelector).val()
    const variantId = $(inputSelector).attr("variant-id")
    window.cartService.updateProductToCart(variantId, quantity)
  })
}

/** Create a cart element
 *
 * @returns {string} html - Html for a cart entry
 */
function constructCartElement(el, elVolumeData, addToTotal) {
  const { current: currentVolumeData } = findIntervalAndNext(el.quantity, elVolumeData.returnData.priceConfig)
  const total = ( el.quantity * currentVolumeData.price ).toFixed(2)
  addToTotal(parseFloat(total))
  return `
    <div style="display: flex; gap: 8px;" data-cart-product="${el.handle}">
      <img src="${el.image}" style="width: 100px; height: auto; align-self: flex-start;">
      <div style="flex: 1; display: flex; flex-direction: column; gap: 5px">
        <a href="${el.url}">
          <b>${el.product_title}</b>
        </>
        <div style="display: flex; flex-direction: column" class="cart-item-data">
          <div style="display: flex; gap: 5px; font-size: 0.9rem;">
            <s style="opacity: 0.6">${currentVolumeData.currencySymbol}${currentVolumeData.originalPrice}</s>
            <span>${currentVolumeData.currencySymbol}${currentVolumeData.price}</span>
          </div>
          <span style="font-size: 0.7rem" class="discount-desc">${el.discounts[0].title}</span>
          <div class="quantity-selector-container" style="display: flex"></div>
        </div>
      </div>
      <div class="subtotal-price-el">
        <span class="subtotal-price-with-curr">
          ${currentVolumeData.currencySymbol}
          <span class="subtotal-el-price">${( el.quantity * currentVolumeData.price ).toFixed(2)}</span>
        </span>
        <span style="display: none;" class="subtotal-price-loading">${createSpinner()}</span>
      </div>
    </div>
  `
}

/** Creates a template for the cart
 *
 */
function makeCartTemplate() {
  $("#mm-1").remove()
  $("#cart div.custom-cart-drawer").remove()
  const cartDrawer = $("<div class='custom-cart-drawer'></div>").css({
    "height": "100%",
    "display": "flex",
    "flex-direction": "column",
    "padding": "20px",
  })

  const header = $("<div class='custom-cart-header'></div>").html(closeSvg).css({
    "display": "flex",
    "justify-content":"right",
    "width": "100%",
    "padding": "20px 0px"
  })

  const spinner = $("<div></div>").css({
    "display": "flex",
    "justify-content": "center",
    "justify-items": "center",
  }).html(createSpinner())

  const filler = $("<div></div>").css({
    "flex": "1",
  })

  const cartContent = $("<div class='custom-cart-content'></div>").css({
    "flex": "1",
    "display":"flex",
    "flex-direction":"column",
    "gap":"20px",
    "overflow-y": "scroll",
    "overflow-x": "hidden"
  }).append(filler.clone(), spinner, filler.clone())

  const footer = $("<div></div>").css({
    "display":"flex",
    "flex-direction": "column",
    "margin-bottom": "30px",
    "gap": "10px"
  })

  const tp = $("<div class='cart-tp-container'></div>").css({
  })

  const subTotalContainer = $("<div class='subtotal-container'></div>").css({
    "display":"flex",
    "flex-direction":"column",
    "padding": "20px 10px",
    "gap": "10px",
    "background-color": "#33333380",
  })

  const subtotalRow = $("<div class='subtotal-row'><span style='flex:1; padding: 5px 0px'><b>SUBTOTAL</b></span><div>").css({
    "display": "flex",
  }).append($(`<div class='subtotal-row-price'>${createSpinner()}</div>`))

  const cartBtn = $("<button type='button'>View Cart</button>").css({
    "background-color": "#33333380",
  }).click((e) => {
    e.stopPropagation()
    window.location.replace("/cart");
  })

  const checkoutBtn = $("<button type='submit'>Checkout</button>")

  subTotalContainer.append(subtotalRow)
  subTotalContainer.append($("<span>Taxes and shipping calculated at checkout</span>"))
  footer.append(subTotalContainer)
  footer.append(cartBtn)
  footer.append(checkoutBtn)

  cartDrawer.append(header)
  cartDrawer.append(cartContent)
  cartDrawer.append(tp)
  cartDrawer.append(footer)

  $("#cart div.mm-panels").append(cartDrawer)
}


const closeSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-circle-x-icon lucide-circle-x"><circle cx="12" cy="12" r="10"/><path d="m15 9-6 6"/><path d="m9 9 6 6"/></svg>`

const trashSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-trash-icon lucide-trash"><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>`
