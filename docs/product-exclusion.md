# Editing Product Listings in Shopify Themes

This guide explains how to modify how products are displayed in your Shopify store's collection pages.

## Accessing Theme Files

1. Log in to your Shopify admin panel
2. Go to **Online Store** → **Themes**
3. Find your current theme and click **Actions** → **Edit code**

## Locating Product Grid/List Files

The main files that control product listings are typically found in:

- `sections/collection-template.liquid` (or similar name)
- `sections/featured-collection.liquid`
- `snippets/product-grid-item.liquid` (or `product-card.liquid`)

## Product Filtering Configuration

The theme uses shop metafields to store product exclusion tags:
- `wholesaleExclusionTags`: Tags for wholesale-excluded products
- `retailExclusionTags`: Tags for retail-excluded products

## Common Customization Areas

### Product Filtering Setup
Add this code before your product loop to initialize the filtering:

```liquid
{% assign wholesale_exclusion_tags = shop.metafields.b2bplus.wholesaleExclusionTags | split: ',' %}
{% assign retail_exclusion_tags = shop.metafields.b2bplus.retailExclusionTags | split: ',' %}
{% assign filtered_products = nil | concat: nil %}
{% assign store_type = shop.metafields.b2bplus.storeType %}
{% assign is_b2b_customer = false %}

{% if store_type == "Hybrid" %}
  {% comment %} Check if any customer tag contains "PortalSphere_B2B" {% endcomment %}
  <script>
    console.log('tags:', {{ customer.tags | json }})
  </script>
  {% for tag in customer.tags %}
    {% if tag contains "PortalSphere_B2B" %}
      {% assign is_b2b_customer = true %}
      <script>
        console.log('is_b2b_customer:', {{ is_b2b_customer | json }})
      </script>
      {% break %}
    {% endif %}
  {% endfor %}
  <script>
    console.log('exclusion tags:', {{ wholesale_exclusion_tags | json }}, {{ retail_exclusion_tags | json }})
  </script>
  {% for product in collection.products %}
    {% assign filterprod = false %}
    <script>
        console.log('product:', {{ product | json }})
    </script>
    {% if is_b2b_customer %}
      {% comment %} Apply wholesale exclusion for B2B customers {% endcomment %}
      {% for tag in wholesale_exclusion_tags %}
        {% for ptag in product.tags %}
          {% if ptag == tag %}
            {% assign filterprod = true %}
            {% break %}
          {% endif %}
        {% endfor %}
        {% if filterprod %}
          {% break %}
        {% endif %}
      {% endfor %}
    {% else %}
      {% comment %} Apply retail exclusion for non-B2B customers {% endcomment %}
      {% for tag in retail_exclusion_tags %}
        {% for ptag in product.tags %}
          {% if ptag == tag %}
            {% assign filterprod = true %}
            {% break %}
          {% endif %}
        {% endfor %}
        {% if filterprod %}
          {% break %}
        {% endif %}
      {% endfor %}
    {% endif %}
    
    {% if filterprod %}
      {% assign product.isVisible = false %}
      {% assign prod = product | sort %}
      {% assign filtered_products = filtered_products | concat: prod %}
    {% endif %}
  {% endfor %}
{% endif %}
    <script>
        console.log('Filter Products:', {{ filtered_products | json }})
    </script>
```

### Product Grid Layout
Modify your product loop to include the filtering condition:

```liquid
<div class="grid grid--uniform">
  {% for product in collection.products %}
    {% unless filtered_products contains product %}
      <div class="grid__item medium-up--one-third">
        {% render 'product-card', product: product %}
      </div>
    {% endunless %}
  {% endfor %}
</div>
```

### Product Card Structure
The product card snippet typically includes:
- Product image
- Title
- Price
- Variant selector
- Add to cart button

## Best Practices

1. Always make a backup of your theme before editing
2. Use the theme editor's built-in version control
3. Test changes on multiple screen sizes

## Testing Changes

1. Preview changes using different collection sizes
2. Test on mobile and desktop views
3. Check loading performance
4. Verify all product information displays correctly

Remember to save your changes and test thoroughly before publishing updates to your live theme.
