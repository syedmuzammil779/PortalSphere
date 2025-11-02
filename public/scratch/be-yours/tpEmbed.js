function embedTopProduct(data, volData) {
  const div = $('<div></div>').css({
    "height": "fit-content",
    "width": "100%",
    "border-top": "1px solid #000",
    "padding": "10px 4px",
    "margin-bottom": "20px"
  }).attr("data-el-type", "top-product-embed")
  div.html(topProductInnerHTML(data, volData))

  const input = div.find("input")
  const variantId = input.first().attr("data-quantity-variant-id")
  const addProductBtn = div.find("button.add-top-product-to-cart")

  const cartFooter = $('div.mini-cart__footer').css({
    "padding-top": "0",

  })
  if (cartFooter.find("div[data-el-type='top-product-embed']").length !== 0) {
    return
  }
  cartFooter.prepend(div)

  // calling cart.js deletes the element, this func reinserts the el on deletion

  addProductBtn.click(async () => {
    const spinner = createSpinner()
    const quantity = input.val()
    try {
      addProductBtn.html(spinner)
      await window.topProductEmbedUtils.addTopSellerToCart(variantId, quantity)

      // remove mutation observer so it doesnt reinsert the el
      div.remove()

      // recall this func for the next top seller
      const [data, volData] = await getTopSeller();
      if (!data || !volData) {
        return
      }

      embedTopProduct(data, volData)

    }
    catch(error){
      console.error(error)
    }
  })
}

function topProductInnerHTML(data, volData){
  const { productInfo } = data
  const { priceConfig } = volData
  const priceCfg = priceConfig[0]
  const quantityAdder = generateQuantitySelector(data, volData)
  const addToCartBtnStyles = "background-color: black; color: white; padding: 16px 15px; width: 100%; border: none; font-size: 1.4rem; font-weight: 300"
  return  `
    <div style="display: flex; flex-direction: column; gap: 10px">
      <h3><b>Dont miss out on this a customer favorite!</b></h3>
      <div style="display: flex; flex-direction: row; gap: 10px">
      <img src="${productInfo.image}" style="height: 150px">
      <div style="display: flex; flex-direction: column; gap: 4px">
        <span style="line-height: 1.2; letter-spacing: 1px;"><b>${productInfo.title}</b></span>
        <span>${priceCfg.currencySymbol}${priceCfg.price} ${priceCfg.currencyCode}</span>
        <div style="display: flex; flex-direction: column; gap: 12px">
          ${quantityAdder}
          <button class="add-top-product-to-cart" type="button" style="${addToCartBtnStyles}">Add to cart</button>
        </div>
      </div>
      </div>
    </div>
  `
}

function generateQuantitySelector(data, volData) {
  const { productInfo, productVariantId } = data
  const { volumeConfig } = volData
  variantSplitArr = productVariantId.split("/")
  const variantId = variantSplitArr[variantSplitArr.length - 1]
  return `
    <quantity-input class="quantity cart-quantity">
      <button class="quantity__button" name="minus" type="button">
        <span class="visually-hidden">Decrease quantity for ${productInfo.title}</span>
        <span class="svg-wrapper"><svg xmlns="http://www.w3.org/2000/svg" fill="none" class="icon icon-minus" viewBox="0 0 10 2"><path fill="currentColor" fill-rule="evenodd" d="M.5 1C.5.7.7.5 1 .5h8a.5.5 0 1 1 0 1H1A.5.5 0 0 1 .5 1" clip-rule="evenodd"></path></svg>
</span>
      </button>
      <input class="quantity__input" type="number" data-quantity-variant-id="${variantId}" name="updates[]" value="${volumeConfig.minimum}" data-cart-quantity="${volumeConfig.minimum}" min="${volumeConfig.minimum}" data-min="${volumeConfig.minimum}" step="${volumeConfig.increment}" aria-label="Quantity for ${productInfo.title}" max="${volumeConfig.maximum}" readonly>
      <button class="quantity__button" name="plus" type="button">
        <span class="visually-hidden">Increase quantity for ${productInfo.title}</span>
        <span class="svg-wrapper"><svg xmlns="http://www.w3.org/2000/svg" fill="none" class="icon icon-plus" viewBox="0 0 10 10"><path fill="currentColor" fill-rule="evenodd" d="M1 4.51a.5.5 0 0 0 0 1h3.5l.01 3.5a.5.5 0 0 0 1-.01V5.5l3.5-.01a.5.5 0 0 0-.01-1H5.5L5.49.99a.5.5 0 0 0-1 .01v3.5l-3.5.01z" clip-rule="evenodd"></path></svg>
</span>
      </button>
    </quantity-input>
  `
}

