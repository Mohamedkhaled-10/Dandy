// src/utils/merchant-feed.ts
// Centralized Google Merchant Center Product Feed Builder
// Generates official RSS 2.0 XML with Google Merchant namespace (http://base.google.com/ns/1.0)
// Source of truth: Dandy Cosmetics live product inventory

import { SITE_URL, type Product } from './products';

export interface MerchantTaxonomy {
  googleProductCategory: string;
  productType: string;
}

/**
 * Safely format text inside CDATA section, escaping any accidental closing CDATA sequence
 */
export function cdata(str: string): string {
  if (!str) return '';
  return `<![CDATA[${String(str).replace(/]]>/g, ']]]]><![CDATA[>')}]]>`;
}

/**
 * Clean and normalize product descriptions for Google Merchant Center:
 * - Strips any accidental HTML tags
 * - Normalizes excessive whitespace
 * - Enforces safe character length within Google's 5000-character limit
 * - Provides a clean fallback if description is empty
 */
export function cleanDescription(desc?: string, fallbackName?: string): string {
  const cleaned = (desc || '')
    .replace(/<[^>]*>/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (cleaned) {
    return cleaned.length > 4990 ? cleaned.substring(0, 4990) : cleaned;
  }
  return `${fallbackName || 'منتج داندي'} - مستحضر طبيعي فاخر للعناية من داندي كوزمتكس مصر.`;
}

/**
 * Maps Dandy catalog categories and product slugs into standard Google Product Taxonomy
 * and hierarchical Arabic breadcrumb product types.
 */
export function getMerchantTaxonomy(product: Product): MerchantTaxonomy {
  const category = (product.category || '').toLowerCase();
  const slug = (product.resolvedSlug || product.slug || product.id || '').toLowerCase();

  // Fragrance & Mist & Solid Perfume & Musk
  if (
    category.includes('perfume') ||
    slug.includes('splash') ||
    slug.includes('mist') ||
    slug.includes('musk') ||
    slug.includes('solid-perfume')
  ) {
    let specificType = 'العناية الشخصية > العطور والمعطرات';
    if (slug.includes('splash')) specificType += ' > بادي سبلاش';
    else if (slug.includes('mist')) specificType += ' > معطر الجسم والشعر';
    else if (slug.includes('musk')) specificType += ' > مسك';
    else if (slug.includes('solid-perfume')) specificType += ' > مخمرية';

    return {
      googleProductCategory: 'Health & Beauty > Personal Care > Cosmetics > Perfumes & Colognes',
      productType: specificType,
    };
  }

  // Hair Care (Shampoo, Mask, Wax, Spray, Oil Mix, Sets)
  if (
    category.includes('hair') ||
    slug.includes('shampoo') ||
    slug.includes('mask') ||
    slug.includes('wax') ||
    slug.includes('hair')
  ) {
    let specificType = 'العناية الشخصية > العناية بالشعر';
    let gCat = 'Health & Beauty > Personal Care > Hair Care';

    if (slug.includes('shampoo')) {
      specificType += ' > شامبو';
      gCat = 'Health & Beauty > Personal Care > Hair Care > Shampoo & Conditioner';
    } else if (slug.includes('mask')) {
      specificType += ' > حمام كريم وماسك';
      gCat = 'Health & Beauty > Personal Care > Hair Care > Hair Masks';
    } else if (slug.includes('wax')) {
      specificType += ' > تصفيف الشعر';
      gCat = 'Health & Beauty > Personal Care > Hair Care > Hair Styling Products';
    } else if (slug.includes('spray')) {
      specificType += ' > سبراي علاجي';
    } else if (slug.includes('oils') || slug.includes('booster')) {
      specificType += ' > زيوت طبيعية';
    } else if (slug.includes('collection')) {
      specificType += ' > مجموعات العناية بالشعر';
    }

    return {
      googleProductCategory: gCat,
      productType: specificType,
    };
  }

  // Body Deodorant
  if (slug.includes('deodorant')) {
    return {
      googleProductCategory: 'Health & Beauty > Personal Care > Cosmetics > Deodorants & Anti-Perspirants',
      productType: 'العناية الشخصية > العناية بالجسم > مزيلات العرق',
    };
  }

  // Eye Mascara
  if (slug.includes('mascara')) {
    return {
      googleProductCategory: 'Health & Beauty > Personal Care > Cosmetics > Makeup > Eye Makeup > Mascara',
      productType: 'العناية الشخصية > مستحضرات التجميل > العيون',
    };
  }

  // Nails
  if (slug.includes('nail')) {
    return {
      googleProductCategory: 'Health & Beauty > Personal Care > Cosmetics > Nail Care',
      productType: 'العناية الشخصية > العناية بالأظافر',
    };
  }

  // Lips & Tint
  if (slug.includes('tint') || slug.includes('lip')) {
    let gCat = 'Health & Beauty > Personal Care > Cosmetics > Makeup > Lip Makeup';
    let pType = 'العناية الشخصية > مستحضرات التجميل > الشفاه';
    if (slug.includes('lip-balm')) {
      gCat = 'Health & Beauty > Personal Care > Cosmetics > Skin Care > Lip Balms & Treatments';
      pType = 'العناية الشخصية > العناية بالبشرة > مرطب الشفاه';
    }
    return {
      googleProductCategory: gCat,
      productType: pType,
    };
  }

  // Facial Cleansers
  if (slug.includes('cleanser')) {
    return {
      googleProductCategory: 'Health & Beauty > Personal Care > Cosmetics > Skin Care > Facial Cleansers',
      productType: 'العناية الشخصية > العناية بالبشرة > غسول الوجه',
    };
  }

  // Serums
  if (slug.includes('serum')) {
    return {
      googleProductCategory: 'Health & Beauty > Personal Care > Cosmetics > Skin Care',
      productType: 'العناية الشخصية > العناية بالبشرة > سيروم',
    };
  }

  // Body Butter, Hand Cream, Foot Peeling, Laser Replacement Cream
  if (
    slug.includes('butter') ||
    slug.includes('hand-cream') ||
    slug.includes('foot-peeling') ||
    slug.includes('laser')
  ) {
    let pType = 'العناية الشخصية > العناية بالجسم والترطيب';
    if (slug.includes('butter')) pType = 'العناية الشخصية > العناية بالجسم > زبدة الجسم';
    else if (slug.includes('hand-cream')) pType = 'العناية الشخصية > العناية باليدين والترطيب';
    else if (slug.includes('foot-peeling')) pType = 'العناية الشخصية > العناية بالقدمين والترطيب';
    else if (slug.includes('laser')) pType = 'العناية الشخصية > العناية بالجسم > بديل الليزر';

    return {
      googleProductCategory: 'Health & Beauty > Personal Care > Cosmetics > Skin Care > Lotion & Moisturizer',
      productType: pType,
    };
  }

  // General Skin Care fallback
  return {
    googleProductCategory: 'Health & Beauty > Personal Care > Cosmetics > Skin Care',
    productType: 'العناية الشخصية > العناية بالبشرة',
  };
}

/**
 * Builds standard Google Merchant XML Feed (RSS 2.0 with g: namespace)
 */
export function buildMerchantFeedXml(products: Product[], siteUrl = SITE_URL): string {
  const eligibleProducts = products.filter(
    p => !p.isHidden && Boolean(p.resolvedSlug) && p.price > 0 && Boolean(p.image)
  );

  const itemsXml = eligibleProducts.map(product => {
    const taxonomy = getMerchantTaxonomy(product);
    const isAvailable = product.inStock !== false && !product.isSoldOut;
    const priceNum = Number(product.price) || 0;
    const origNum = product.originalPrice ? Number(product.originalPrice) : null;

    let priceTags = '';
    if (origNum && origNum > priceNum) {
      priceTags = `      <g:price>${origNum.toFixed(2)} EGP</g:price>\n      <g:sale_price>${priceNum.toFixed(2)} EGP</g:sale_price>`;
    } else {
      priceTags = `      <g:price>${priceNum.toFixed(2)} EGP</g:price>`;
    }

    const productLink = `${siteUrl}/product/${encodeURIComponent(product.resolvedSlug)}`;
    const productTitle = product.name || 'منتج داندي';
    const productDesc = cleanDescription(product.description, productTitle);

    return `    <item>
      <g:id>${product.id}</g:id>
      <g:title>${cdata(productTitle)}</g:title>
      <g:description>${cdata(productDesc)}</g:description>
      <g:link>${productLink}</g:link>
      <g:image_link>${product.image}</g:image_link>
      <g:condition>new</g:condition>
      <g:availability>${isAvailable ? 'in_stock' : 'out_of_stock'}</g:availability>
${priceTags}
      <g:brand>${cdata('Dandy Cosmetics')}</g:brand>
      <g:identifier_exists>no</g:identifier_exists>
      <g:google_product_category>${cdata(taxonomy.googleProductCategory)}</g:google_product_category>
      <g:product_type>${cdata(taxonomy.productType)}</g:product_type>
    </item>`;
  });

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">
  <channel>
    <title>${cdata('Dandy Cosmetics Product Feed')}</title>
    <link>${siteUrl}</link>
    <description>${cdata('خلاصة منتجات داندي كوزمتكس الرسمية لـ Google Merchant Center')}</description>
${itemsXml.join('\n')}
  </channel>
</rss>`.trim();
}
