$(document).ready(async function() {
  const [data, volData] = await window.getTopSeller()
  if (!data || !volData) {
    return
  }
  embedTopProduct(data, volData)
})

function embedTopProduct(data, volData) {
  const div = $('<div></div>').css({
    "height": "fit-content",
    "width": "100%",
    "border-top": "1px solid #000",
    "padding": "10px 4px",
    "margin-bottom": "20px"
  })
  div.html(topProductInnerHTML(data, volData))
  const input = div.find("input")
  const { minimum, increment, maximum } = volData.volumeConfig
  div.find("button.js-qty__adjust.js-qty__adjust--minus").click(() => {
    const val = parseInt(input.val())
    if (val - increment >= minimum) {
      input.val(val - increment)
    }
  })
  div.find("button.js-qty__adjust.js-qty__adjust--plus").click(() => {
    const val = parseInt(input.val())
    if (val + volData.volumeConfig.increment <= maximum) {
      input.val(val + increment)
    }
  })

  const variantId = input.first().attr("data-quantity-variant-id")
  const addProductBtn = div.find("button.add-top-product-to-cart")

  const cartItems = $('#CartDrawer div.drawer__footer.appear-animation.appear-delay-4')
  const cartPage = $('div.drawer__inner.gradient.color-scheme-1')
  cartItems.prepend(div)
  cartItems[0].style.paddingTop = 0

  // calling cart.js deletes the element, this func reinserts the el on deletion
  const cleanUp = preventDeletion(cartPage, div)

  addProductBtn.click(async () => {
    const spinner = createSpinner()
    const quantity = input.val()
    try {
      addProductBtn.html(spinner)
      await window.topProductEmbedUtils.addTopSellerToCart(variantId, quantity)
      cartItems[0].style.paddingTop = cartItems[0].style.paddingBottom

      // remove mutation observer so it doesnt reinsert the el
      cleanUp()
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
  const addToCartBtnStyles = "background-color: black; color: white; padding: 10px 15px; width: 100%; border: none; font-size: 1rem; font-weight: 300"
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
    <div class="js-qty__wrapper">
      <button type="button" class="js-qty__adjust js-qty__adjust--minus" aria-label="Reduce item quantity by one">
          <svg aria-hidden="true" focusable="false" role="presentation" class="icon icon-minus" viewBox="0 0 20 20"><path fill="#444" d="M17.543 11.029H2.1A1.032 1.032 0 0 1 1.071 10c0-.566.463-1.029 1.029-1.029h15.443c.566 0 1.029.463 1.029 1.029 0 .566-.463 1.029-1.029 1.029z"></path></svg>
          <span class="icon__fallback-text" aria-hidden="true">−</span>
      </button>
      <input type="text" value="${volumeConfig.minimum}" min="${volumeConfig.minimum}" aria-label="quantity" pattern="[0-9]*" name="quantity" readonly="readonly" max="${volumeConfig.maximum}" step="${volumeConfig.increment}" style="padding-left: 40px" data-quantity-variant-id="${variantId}">
      <button type="button" class="js-qty__adjust js-qty__adjust--plus" aria-label="Increase item quantity by one">
          <svg aria-hidden="true" focusable="false" role="presentation" class="icon icon-plus" viewBox="0 0 20 20"><path fill="#444" d="M17.409 8.929h-6.695V2.258c0-.566-.506-1.029-1.071-1.029s-1.071.463-1.071 1.029v6.671H1.967C1.401 8.929.938 9.435.938 10s.463 1.071 1.029 1.071h6.605V17.7c0 .566.506 1.029 1.071 1.029s1.071-.463 1.071-1.029v-6.629h6.695c.566 0 1.029-.506 1.029-1.071s-.463-1.071-1.029-1.071z"></path></svg>
          <span class="icon__fallback-text" aria-hidden="true">+</span>
      </button>
    </div>
  `
}

/** Reinserts the top product embed when it is deleted by shopify, returns
 * a clean up function to allow for manual deletions
 *
 *
 * @param {jQuery} cartPage - jQuery wrapped HTML element that represents the cart page
 * @param {jQuery} $target - jQuery wrapped HTML element that represents the top product embed
 *
 * @param {function()} cleanup - function that can be called to remove mut observer
 *
 */
function preventDeletion(cartPage, $target) {
  const target = $target.get(0);
  const parent = target?.parentNode;

  if (!target || !parent) return;
  const observer = new MutationObserver((mutations) => {
    if (cartPage.has($target).length == 0) {
      parent.insertBefore(target, parent.children[2]);
    }
  });
  observer.observe(parent, { childList: true });

  // return clean up
  return () => observer.disconnect()
}


