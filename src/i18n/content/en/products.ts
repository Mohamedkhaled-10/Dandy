/**
 * ============================================================================
 * DANDY COSMETICS — COMPLETE ENGLISH PRODUCT LOCALIZATION REGISTRY (PHASE 11)
 *
 * Covers all 32 active (!isHidden) catalog products strictly keyed by stable
 * Firebase RTDB `product.id`, plus `variantLabels` keyed by stable `variant.id`.
 * Zero mutations to `price`, `originalPrice`, `discount`, `stockQuantity`,
 * `variants[].id`, `category`, `resolvedSlug`, or `image`.
 * ============================================================================
 */

import { EXISTING_PRODUCT_SLUG_MAP } from '../../../utils/products';
import type { ProductLocalizedContent } from '../../types';

export const NEW_DISCOVERED_PRODUCT_IDS: readonly string[] = Object.freeze([
  '-P5hKLdYUiIFHPxjSNUm',
]);

export const CANONICAL_PRODUCT_IDS: readonly string[] = Object.freeze([
  ...Object.keys(EXISTING_PRODUCT_SLUG_MAP),
  ...NEW_DISCOVERED_PRODUCT_IDS,
]);

export const EN_PRODUCT_CONTENT: Readonly<Record<string, ProductLocalizedContent>> = Object.freeze({
  '-OW9U9Af024A9LrbOU4f': {
    productId: '-OW9U9Af024A9LrbOU4f',
    name: 'Laser Replacement Cream – 60 g',
    shortDescription:
      'Targeted botanical post-hair-removal cream formulated to soothe redness and help gradually minimize hair regrowth appearance.',
    description:
      'Formulated with Cyperus rotundus (Saad) oil, Lupin oil, Rose oil, Panthenol, and soothing extracts of Chamomile, Aloe Vera, and Cucumber, Dandy Laser Replacement Cream calms freshly epilated skin, softens texture, and supports a gradual reduction in hair regrowth appearance with consistent use.',
    highlights: [
      'Helps gradually reduce hair regrowth appearance after hair removal',
      'Deeply hydrates and leaves skin with a smooth, silky feel',
      'Calms irritation and redness after sugaring, waxing, or shaving',
      'Antibacterial botanical properties help reduce follicle inflammation and bumps',
      'Helps promote a more even-looking skin tone and natural radiance',
      'Gentle and soothing for sensitive skin',
    ],
    usageInstructions: [
      'Apply twice daily for 10 days immediately following sugaring or waxing.',
      'Repeat consistently across 3 consecutive hair-removal cycles for optimal results.',
    ],
    ingredientsNote:
      'Cyperus rotundus (Saad) Oil, Lupin Oil, Rose Oil, Panthenol, Chamomile Extract, Aloe Vera Extract, and Cucumber Extract.',
    structuredSections: [
      {
        id: 'overview',
        title: 'Product Overview',
        paragraphs: [
          'Say goodbye to post-removal discomfort with an advanced botanical blend designed to care for skin and gradually slow unwanted hair regrowth appearance after traditional removal.',
        ],
        bullets: [],
      },
      {
        id: 'ingredients',
        title: 'Ingredients & Key Actives',
        paragraphs: [
          'Contains Cyperus rotundus (Saad) oil, Lupin oil, Rose oil, Panthenol, and botanical extracts of Chamomile, Aloe Vera, and Cucumber to nourish and comfort the skin with every application.',
        ],
        bullets: [],
      },
      {
        id: 'features',
        title: 'Key Benefits',
        paragraphs: [],
        bullets: [
          'Helps gradually minimize hair regrowth appearance after epilation.',
          'Deeply moisturizes skin and restores a soft, silky texture.',
          'Soothes post-sugaring and post-shaving redness and irritation.',
          'Helps reduce follicle bumps and discomfort thanks to antibacterial properties.',
          'Supports a visibly brighter, more even-toned look over time.',
          'Suitable for sensitive skin with a calming, refreshing finish.',
        ],
      },
      {
        id: 'usage',
        title: 'How to Use',
        paragraphs: [],
        bullets: [
          'Apply twice daily after hair removal (sugaring/waxing) for 10 consecutive days.',
          'Repeat this 10-day cycle across 3 consecutive sessions for best results.',
        ],
      },
      {
        id: 'results',
        title: 'Expected Results',
        paragraphs: [
          'Results begin appearing from the first cycle as intervals between regrowth lengthen gradually; with continued adherence, visible hair regrowth may decrease by 70% to 90% depending on individual skin and hair response.',
        ],
        bullets: [],
      },
    ],
    seoTitle: 'Laser Replacement Cream 60 g | Dandy Cosmetics',
    seoDescription:
      'Soothe freshly epilated skin and help gradually minimize hair regrowth appearance with Dandy Laser Replacement Cream enriched with Saad oil, Lupin oil, and Aloe.',
  },

  '-OW9WB1GTP1GaDoqcd2R': {
    productId: '-OW9WB1GTP1GaDoqcd2R',
    name: 'Treatment Lash Mascara',
    shortDescription:
      '100% oil-free water-based conditioning lash treatment designed to nourish lashes and reduce breakage.',
    description:
      'Give your lashes everyday definition and gentle care in one step. Dandy Treatment Mascara features an oil-free, water-based conditioning formula that helps strengthen lashes, reduce breakage, and support a fuller, healthier appearance without clumping.',
    highlights: [
      'Helps strengthen lashes and minimize breakage',
      'Enhances fuller and longer-looking lashes naturally',
      'Nourishes lashes while preserving natural flexibility',
      'Lightweight, clump-free texture',
      'Easy to apply and rinse off cleanly',
      '100% water-based formula free from heavy oils around the eyes',
    ],
    usageInstructions: [
      'Brush cleanly through dry, makeup-free lashes from root to tip.',
      'Apply twice daily for optimal lash conditioning results.',
    ],
    ingredientsNote:
      '100% water-based nourishing complex completely free from oils that may irritate the eye area over long-term use.',
    structuredSections: [
      {
        id: 'overview',
        title: 'Product Overview',
        paragraphs: [
          'Combines effortless lash definition with daily strengthening care so lashes look naturally fuller and healthier with continued use.',
        ],
        bullets: [],
      },
      {
        id: 'ingredients',
        title: 'Ingredients & Care Notes',
        paragraphs: [
          'Formulated with water-based hydrating and fortifying ingredients to condition lashes and minimize snapping without heavy residue or clumping.',
        ],
        bullets: [],
      },
      {
        id: 'features',
        title: 'Key Benefits',
        paragraphs: [],
        bullets: [
          'Helps fortify lashes and reduce breakage.',
          'Creates a fuller, more defined lash appearance.',
          'Nourishes lashes and maintains natural suppleness.',
          'Featherlight texture that never clumps.',
          'Effortless daily application and gentle removal.',
          '100% oil-free aqueous formula gentle around sensitive eyes.',
        ],
      },
      {
        id: 'usage',
        title: 'How to Use',
        paragraphs: [],
        bullets: [
          'Apply directly onto clean lashes using the wand from roots to tips.',
          'Use twice daily for best results.',
        ],
      },
      {
        id: 'results',
        title: 'Expected Results',
        paragraphs: [
          'Lashes appear neatly defined from first application; with regular use, they feel stronger, look healthier, and show noticeably less breakage.',
        ],
        bullets: [],
      },
    ],
    seoTitle: 'Treatment Lash Mascara | Dandy Cosmetics',
    seoDescription:
      'Water-based, oil-free Dandy Treatment Mascara to nourish, strengthen, and visibly define lashes every day.',
  },

  '-OW9YLJvzoW2u9P4ISmA': {
    productId: '-OW9YLJvzoW2u9P4ISmA',
    name: 'Foot Peeling & Heel Softening Cream – 60 g',
    shortDescription:
      'Exfoliating and deeply moisturizing heel cream formulated to soften rough, cracked skin and loosen dead skin buildup.',
    description:
      'Restore soft, comfortable feet with Dandy Foot Peeling Cream. Combining gentle exfoliating and hydrating actives, it targets rough patches, dry calluses, and cracked heels to leave feet smoother with regular care.',
    highlights: [
      'Helps soften rough skin and loosen dead skin buildup',
      'Deeply moisturizes dry heels for noticeable softness',
      'Helps visibly reduce heel cracks and roughness',
      'Supports smoother skin renewal on the feet',
      'Fast-absorbing, convenient cream texture',
      'Suitable for regular care across all skin types',
    ],
    usageInstructions: [
      'Apply to clean, thoroughly dried heels and feet, massaging gently until absorbed.',
      'Use daily, preferably before bedtime; wearing cotton socks or plastic wrap enhances absorption.',
      'Allow time to soften skin, then gently buff away dead skin with a pumice stone or foot file.',
    ],
    structuredSections: [
      {
        id: 'overview',
        title: 'Product Overview',
        paragraphs: [
          'Complete daily foot care designed to smooth stubborn roughness and bring comfort back to dry heels.',
        ],
        bullets: [],
      },
      {
        id: 'ingredients',
        title: 'Formulation Benefits',
        paragraphs: [
          'Blends hydrating emollients and gentle keratolytics to help lift dead skin cells while keeping the heel barrier cushioned and soft.',
        ],
        bullets: [],
      },
      {
        id: 'features',
        title: 'Key Benefits',
        paragraphs: [],
        bullets: [
          'Helps remove rough, dead skin buildup on heels.',
          'Delivers targeted moisture for smoother, softer feet.',
          'Improves the appearance of dry, cracked heels.',
          'Encourages smoother skin texture with consistent application.',
          'Absorbs cleanly for easy bedtime application.',
        ],
      },
      {
        id: 'usage',
        title: 'How to Use',
        paragraphs: [],
        bullets: [
          'Massage into clean, dry heels until fully absorbed, ideally at night.',
          'Slip on cotton socks (or protective wrap) to boost absorption.',
          'After softening, gently exfoliate loosened dead skin using a foot stone or file.',
        ],
      },
      {
        id: 'results',
        title: 'Expected Results',
        paragraphs: [
          'With consistent daily use, feet feel noticeably smoother and better hydrated as rough calluses and cracks diminish over time.',
        ],
        bullets: [],
      },
    ],
    seoTitle: 'Foot Peeling Cream 60 g | Dandy Cosmetics',
    seoDescription:
      'Soften rough, cracked heels with Dandy Foot Peeling Cream 60 g for smoother, hydrated feet.',
  },

  '-OWF2juQihSL1HV8PwTT': {
    productId: '-OWF2juQihSL1HV8PwTT',
    name: 'Nourishing Nail & Cuticle Serum',
    shortDescription:
      'Fast-absorbing botanical nail serum to strengthen brittle nails, reduce peeling, and soften dry cuticles.',
    description:
      'Give nails and cuticles the daily nourishment they deserve. Dandy Nail Serum delivers fortifying and hydrating actives to help reduce splitting and breakage while restoring soft, tidy cuticles and natural shine.',
    highlights: [
      'Helps fortify weak nails and reduce splitting or breakage',
      'Deeply hydrates and softens surrounding cuticles',
      'Promotes a healthy, glossy natural nail appearance',
      'Lightweight and fast-absorbing without sticky residue',
      'Suitable for all nail types',
    ],
    usageInstructions: [
      'Apply a drop over clean nails and cuticles.',
      'Massage gently until completely absorbed.',
      'Use daily for strongest results.',
    ],
    structuredSections: [
      {
        id: 'overview',
        title: 'Product Overview',
        paragraphs: [
          'Targeted botanical care formulated to condition fragile nails and dry cuticle skin in one lightweight daily drop.',
        ],
        bullets: [],
      },
      {
        id: 'features',
        title: 'Key Benefits',
        paragraphs: [],
        bullets: [
          'Strengthens nails and minimizes splitting and chipping.',
          'Conditions cuticles to help prevent dryness and hangnails.',
          'Adds a healthy natural luster to bare nails.',
          'Absorbs quickly for effortless everyday care.',
        ],
      },
      {
        id: 'usage',
        title: 'How to Use',
        paragraphs: [],
        bullets: [
          'Apply onto clean bare nails and cuticle edges.',
          'Massage gently until absorbed; repeat daily.',
        ],
      },
      {
        id: 'results',
        title: 'Expected Results',
        paragraphs: [
          'With regular use, nails appear stronger and smoother with less breakage, while cuticles remain noticeably soft and hydrated.',
        ],
        bullets: [],
      },
    ],
    seoTitle: 'Nourishing Nail Serum | Dandy Cosmetics',
    seoDescription:
      'Fortify brittle nails and soften dry cuticles with Dandy Cosmetics fast-absorbing Nail Serum.',
  },

  '-OWF4DCXsfQGlA7OOy11': {
    productId: '-OWF4DCXsfQGlA7OOy11',
    name: 'Gentle Botanical Deodorant',
    shortDescription:
      'Skin-friendly, quick-drying deodorant formulated to neutralize odor and keep underarms fresh without stickiness.',
    description:
      'Stay confidently fresh throughout the day with Dandy Gentle Deodorant. Crafted to neutralize odor without harshness or sticky residue, it dries quickly while caring for delicate underarm skin. Available in White Musk and Fresh Flowers.',
    highlights: [
      'Helps neutralize odor throughout the day',
      'Delivers long-lasting cleanliness and freshness',
      'Gentle, quick-drying formula suitable for sensitive skin',
      'Zero sticky feel or visible residue on clothing',
      'Suitable for daily use across all skin types',
    ],
    usageInstructions: [
      'Apply to clean, dry underarm skin.',
      'Allow to dry briefly before dressing.',
      'Use daily or whenever needed.',
    ],
    structuredSections: [
      {
        id: 'overview',
        title: 'Product Overview',
        paragraphs: [
          'Balanced daily odor protection formulated with gentle skin-caring ingredients so underarms stay comfortable and fresh.',
        ],
        bullets: [],
      },
      {
        id: 'features',
        title: 'Key Benefits',
        paragraphs: [],
        bullets: [
          'Controls body odor reliably through busy days.',
          'Keeps underarms feeling fresh and clean for hours.',
          'Quick-drying texture with zero sticky residue.',
          'Gentle enough for everyday application.',
        ],
      },
      {
        id: 'usage',
        title: 'How to Use',
        paragraphs: [],
        bullets: [
          'Apply evenly to clean, dry underarms.',
          'Let dry before putting on clothes.',
        ],
      },
      {
        id: 'results',
        title: 'Expected Results',
        paragraphs: [
          'Instant freshness and comfort from the first wear, with soft, irritation-free underarm skin over daily use.',
        ],
        bullets: [],
      },
    ],
    seoTitle: 'Gentle Botanical Deodorant | Dandy Cosmetics',
    seoDescription:
      'Long-lasting daily freshness without stickiness with Dandy Botanical Deodorant in White Musk and Fresh Flowers.',
  },

  '-OWF5L62TkM4Y0odMy-l': {
    productId: '-OWF5L62TkM4Y0odMy-l',
    name: 'Botanical Hair Styling Wax – 80 g',
    shortDescription:
      'Nourishing curl-defining and anti-frizz hair wax enriched with Shea Butter, Cocoa Butter, Coconut Butter, natural oils, and Vitamin E.',
    description:
      'Dandy Hair Wax (80 g) is crafted with rich Shea, Cocoa, and Coconut butters alongside nourishing natural plant oils and Vitamin E to deliver deep moisture, tame frizz and flyaways, and define natural curls and waves without stiffness.',
    highlights: [
      'Deeply moisturizes and nourishes hair from root to tip',
      'Helps visibly reduce frizz and split ends appearance',
      'Adds natural softness, elasticity, and healthy shine',
      'Defines curly and wavy hair patterns while taming flyaways',
      'Enriched with natural plant butters, botanical oils, and Vitamin E',
    ],
    usageInstructions: [
      'Warm a small amount between palms and smooth evenly through damp or dry hair, focusing on mid-lengths and ends.',
      'Use to define curls, tame flyaways, or add a sleek finishing touch.',
    ],
    ingredientsNote: 'Shea Butter, Cocoa Butter, Coconut Butter, Natural Plant Oils, and Vitamin E.',
    structuredSections: [
      {
        id: 'overview',
        title: 'Product Overview',
        paragraphs: [
          'Ideal for dry, curly, and wavy hair textures seeking soft styling control paired with deep botanical nourishment.',
        ],
        bullets: [],
      },
      {
        id: 'features',
        title: 'Key Benefits',
        paragraphs: [],
        bullets: [
          'Nourishes strands deeply from roots to ends.',
          'Controls frizz and reduces the look of split ends.',
          'Improves hair manageability, bounce, and natural shine.',
          'Defines curls cleanly without greasy buildup.',
        ],
      },
      {
        id: 'usage',
        title: 'How to Use',
        paragraphs: [],
        bullets: [
          'Rub a pea-to-dime-sized amount between your palms until warmed.',
          'Work through damp or dry hair focusing on mid-lengths and ends to sculpt curls or smooth flyaways.',
        ],
      },
      {
        id: 'results',
        title: 'Expected Results',
        paragraphs: [
          'With regular use, hair feels noticeably softer, more hydrated, and easier to style with reduced frizz and natural gloss.',
        ],
        bullets: [],
      },
    ],
    seoTitle: 'Botanical Hair Wax 80 g | Dandy Cosmetics',
    seoDescription:
      'Tame frizz and define curls naturally with Dandy Botanical Hair Wax 80 g powered by Shea, Cocoa & Coconut butters and Vitamin E.',
  },

  '-OWF6uqnhnu3TCvoqLSD': {
    productId: '-OWF6uqnhnu3TCvoqLSD',
    name: 'Body & Hair Fragrance Mist',
    shortDescription:
      'Featherlight hydrating body and hair mist in 4 signature scents for effortless all-day freshness.',
    description:
      'Dandy Body & Hair Mist wraps skin and hair in a light, hydrating veil of fragrance without weighing strands down. Portable, chic, and gentle on skin, it delivers refreshing scent notes in four irresistible blends.',
    highlights: [
      'Lightweight, hydrating formula gentle on both skin and hair',
      'Long-lasting freshness for everyday wear',
      'Sleek travel-ready bottle for effortless touch-ups on the go',
      'Available in 4 signature scents: Sweet Sugar, Purple Flowers, Candy Fruits, and Cherry’s Love',
    ],
    usageInstructions: [
      'Mist lightly onto clean skin and through hair lengths from a comfortable distance.',
      'Reapply whenever a fresh fragrance boost is desired throughout the day.',
    ],
    variantLabels: {
      'sweet-sugar': 'Sweet Sugar',
      'purple-flowers': 'Purple Flowers',
      'candy-fruits': 'Candy Fruits',
      'cherrys-love': 'Cherry’s Love',
    },
    structuredSections: [
      {
        id: 'overview',
        title: 'Product Overview',
        paragraphs: [
          'Designed to lightly scent and refresh both skin and hair without heaviness, making it your everyday fragrance staple.',
        ],
        bullets: [],
      },
      {
        id: 'features',
        title: 'Available Scents',
        paragraphs: [],
        bullets: [
          'Sweet Sugar: Soft spun-sugar warmth with playful feminine charm.',
          'Purple Flowers: Calm, refined floral notes of soft purple blooms.',
          'Candy Fruits: Vibrant, energizing burst of sweet orchard fruits.',
          'Cherry’s Love: Romantic sweet cherry accord with gentle warmth.',
        ],
      },
      {
        id: 'usage',
        title: 'How to Use',
        paragraphs: [],
        bullets: [
          'Spritz over pulse points, body, or hair ends after showering or anytime on the go.',
        ],
      },
    ],
    seoTitle: 'Body & Hair Fragrance Mist | Dandy Cosmetics',
    seoDescription:
      'Hydrating, lightweight Dandy Body & Hair Mist in Sweet Sugar, Purple Flowers, Candy Fruits, and Cherry’s Love.',
  },

  '-OWF8NVhw0HgIaJRVOYL': {
    productId: '-OWF8NVhw0HgIaJRVOYL',
    name: 'Creamy Solid Perfume (Mekhmaria) – 30 g',
    shortDescription:
      'Velvety cream-based solid perfume designed for pulse points and hair tips with lasting scent and zero stickiness.',
    description:
      'Indulge skin and hair with Dandy Creamy Solid Perfume (Mekhmaria). Its smooth, non-sticky balm melts cleanly onto pulse points and hair ends for soft, lingering warmth across three signature fragrances.',
    highlights: [
      'Smooth creamy texture with zero greasy or sticky feel',
      'Gentle and safe for both skin pulse points and hair tips',
      'Compact 30 g jar ideal for handbags and fragrance layering',
      'Available in Sweet Sugar, Purple Flowers, and Candy Fruits',
    ],
    usageInstructions: [
      'Dab a small amount onto pulse points (wrists, neck, behind ears) or smooth lightly onto hair ends.',
    ],
    variantLabels: {
      'sweet-sugar': 'Sweet Sugar',
      'purple-flowers': 'Purple Flowers',
      'candy-fruits': 'Candy Fruits',
    },
    structuredSections: [
      {
        id: 'overview',
        title: 'Product Overview',
        paragraphs: [
          'A traditional Egyptian beauty ritual reimagined in a velvety, weightless cream perfume that layers seamlessly with body mist and splash.',
        ],
        bullets: [],
      },
      {
        id: 'features',
        title: 'Scent Collection',
        paragraphs: [],
        bullets: [
          'Sweet Sugar: Warm, comforting sweetness for everyday elegance.',
          'Purple Flowers: Soft, graceful floral bouquet.',
          'Candy Fruits: Cheerful, uplifting sweet berry and fruit blend.',
        ],
      },
      {
        id: 'usage',
        title: 'How to Use',
        paragraphs: [],
        bullets: [
          'Apply gently to wrists, behind the ears, neck, or hair ends after bathing.',
        ],
      },
    ],
    seoTitle: 'Creamy Solid Perfume (Mekhmaria) 30 g | Dandy Cosmetics',
    seoDescription:
      'Velvety non-sticky Solid Perfume (Mekhmaria) 30 g by Dandy Cosmetics for skin pulse points and hair tips.',
  },

  '-OWF9Deint3XcB6iNdCE': {
    productId: '-OWF9Deint3XcB6iNdCE',
    name: 'Natural Cheek & Lip Tint',
    shortDescription:
      'Weightless, buildable cheek and lip tint delivering a natural, long-wearing healthy flush.',
    description:
      'Add instant, radiant warmth to your look with Dandy Natural Tint. Its featherlight, easily blendable formula glides smoothly onto cheeks and lips without greasiness or stickiness for a fresh everyday glow.',
    highlights: [
      'Natural-looking flush for both lips and cheeks',
      'Weightless, seamless texture easy to blend with fingertips',
      'Non-greasy and non-sticky feel for comfortable all-day wear',
      'Buildable pigment for subtle or deeper color payoff',
    ],
    usageInstructions: [
      'Dot a small amount onto cheeks or bare lips.',
      'Blend quickly using clean fingertips or a makeup sponge, and layer for richer color.',
    ],
    structuredSections: [
      {
        id: 'overview',
        title: 'Product Overview',
        paragraphs: [
          'Dual-use cheek and lip color crafted for effortless everyday radiance with a comfortable, second-skin finish.',
        ],
        bullets: [],
      },
      {
        id: 'features',
        title: 'Key Benefits',
        paragraphs: [],
        bullets: [
          'Delivers long-wearing natural color across lips and cheeks.',
          'Blends smoothly without patchiness or heavy texture.',
          'Zero greasy or tacky sensation.',
          'Suitable for natural daily wear.',
        ],
      },
      {
        id: 'usage',
        title: 'How to Use',
        paragraphs: [],
        bullets: [
          'Apply 1–2 small dots to cheeks or lips and blend immediately with fingertips.',
          'Reapply a light second layer if a deeper flush is preferred.',
        ],
      },
      {
        id: 'results',
        title: 'Expected Results',
        paragraphs: [
          'Instant healthy-looking color and fresh radiance that lasts comfortably for hours.',
        ],
        bullets: [],
      },
    ],
    seoTitle: 'Natural Cheek & Lip Tint | Dandy Cosmetics',
    seoDescription:
      'Lightweight, blendable Cheek & Lip Tint by Dandy Cosmetics for a natural long-wearing healthy flush.',
  },

  '-OWFAaqOFptMA4YEPL7p': {
    productId: '-OWFAaqOFptMA4YEPL7p',
    name: 'Nourishing Hand Cream – 60 g',
    shortDescription:
      'Fast-absorbing daily hand cream formulated to deeply moisturize dry hands and restore silky softness without greasiness.',
    description:
      'Keep hands soft, smooth, and protected every day with Dandy Hand Cream (60 g). Richly hydrating ingredients help replenish dry skin and shield against everyday moisture loss while absorbing cleanly with zero greasy residue.',
    highlights: [
      'Deeply hydrates hands and helps prevent dryness',
      'Softens rough patches and dry skin around fingers',
      'Silky, non-greasy finish absorbs quickly',
      'Suitable for frequent daily use and all skin types',
    ],
    usageInstructions: [
      'Apply an appropriate amount to clean hands.',
      'Massage gently until fully absorbed, especially after handwashing.',
    ],
    structuredSections: [
      {
        id: 'overview',
        title: 'Product Overview',
        paragraphs: [
          'Everyday pocket-sized comfort designed to keep hands supple and shielded from environmental dryness.',
        ],
        bullets: [],
      },
      {
        id: 'features',
        title: 'Key Benefits',
        paragraphs: [],
        bullets: [
          'Delivers deep hydration to dry, hardworking hands.',
          'Smooths rough skin texture for a silky-soft feel.',
          'Fast absorption with zero sticky or oily after-feel.',
          'Ideal for all skin types.',
        ],
      },
      {
        id: 'usage',
        title: 'How to Use',
        paragraphs: [],
        bullets: [
          'Massage into clean hands multiple times a day or right after washing.',
        ],
      },
      {
        id: 'results',
        title: 'Expected Results',
        paragraphs: [
          'Immediate comfort and hydration from first use, with visibly smoother, healthier-looking hands over regular care.',
        ],
        bullets: [],
      },
    ],
    seoTitle: 'Nourishing Hand Cream 60 g | Dandy Cosmetics',
    seoDescription:
      'Soften and protect dry hands without greasy residue with Dandy Nourishing Hand Cream 60 g.',
  },

  '-O_4D5IO_nPZf1fKcVlJ': {
    productId: '-O_4D5IO_nPZf1fKcVlJ',
    name: 'Sulfate-Free Nourishing Shampoo – 500 ml',
    shortDescription:
      'Gentle sulfate-free 500 ml cleanser designed for dry, sensitive, color-treated, and protein/keratin-treated hair.',
    description:
      'Cleanse scalp and hair gently without stripping essential natural oils. Dandy Sulfate-Free Shampoo (500 ml) reduces frizz and dryness while maintaining natural shine, making it ideal for color-treated, keratin- or protein-treated, and dry hair.',
    highlights: [
      '100% sulfate-free gentle cleansing for scalp and hair',
      'Preserves hair’s natural oils and moisture balance',
      'Safe for color-treated, keratin-treated, and protein-treated hair',
      'Reduces frizz and boosts softness and natural gloss',
      'Generous 500 ml family size ideal for dry and sensitive hair',
    ],
    usageInstructions: [
      'Apply to thoroughly wet hair and scalp, massaging gently into a soft lather.',
      'Rinse well with water and repeat if needed.',
    ],
    structuredSections: [
      {
        id: 'overview',
        title: 'Product Overview',
        paragraphs: [
          'Balanced daily cleansing formulated to lift buildup without stripping vital lipids from strands or scalp.',
        ],
        bullets: [],
      },
      {
        id: 'features',
        title: 'Key Benefits',
        paragraphs: [],
        bullets: [
          'Gently cleanses hair and scalp without dryness.',
          'Free from harsh sulfates, safe for frequent washing.',
          'Preserves natural oils for softer, calmer hair.',
          'Tailored compatibility for dyed, keratin- and protein-treated hair.',
        ],
      },
      {
        id: 'usage',
        title: 'How to Use',
        paragraphs: [],
        bullets: [
          'Massage evenly onto wet hair and scalp until a mild lather forms.',
          'Rinse thoroughly and follow with conditioner or repair mask on lengths.',
        ],
      },
      {
        id: 'results',
        title: 'Expected Results',
        paragraphs: [
          'Leaves hair feeling clean yet soft from the first wash; with continued care, hair becomes easier to detangle, calmer, and better hydrated.',
        ],
        bullets: [],
      },
    ],
    seoTitle: 'Sulfate-Free Shampoo 500 ml | Dandy Cosmetics',
    seoDescription:
      'Gentle 500 ml Sulfate-Free Shampoo by Dandy Cosmetics for dry, sensitive, color-treated, and keratin-treated hair.',
  },

  '-ObKDCc_il_Dz2_Mih-a': {
    productId: '-ObKDCc_il_Dz2_Mih-a',
    name: 'Botanical Hair Styling Wax – 50 g',
    shortDescription:
      'Compact 50 g curl-defining and frizz-control wax enriched with Shea, Cocoa & Coconut butters, 6 natural oils, and Vitamin E.',
    description:
      'Dandy Hair Wax (50 g) blends Shea Butter, Cocoa Butter, Coconut Butter, and 6 nourishing botanical oils with Vitamin E in a travel-friendly jar to deeply moisturize, define curls, smooth frizz, and enhance shine.',
    highlights: [
      'Enriched with Shea, Cocoa & Coconut butters plus 6 botanical oils and Vitamin E',
      'Defines natural curls and smooths frizzy flyaways cleanly',
      'Deeply moisturizes dry mid-lengths and ends',
      'Compact 50 g jar ideal for handbags and touch-ups',
    ],
    usageInstructions: [
      'Warm a small amount between palms and smooth onto damp or dry hair from mid-length to ends.',
    ],
    ingredientsNote: 'Shea Butter, Cocoa Butter, Coconut Butter, 6 Natural Botanical Oils, and Vitamin E.',
    structuredSections: [
      {
        id: 'overview',
        title: 'Product Overview',
        paragraphs: [
          'Travel-friendly nourishing hair wax designed to tame frizz and sculpt smooth, glossy curls anywhere.',
        ],
        bullets: [],
      },
      {
        id: 'features',
        title: 'Key Benefits',
        paragraphs: [],
        bullets: [
          'Deeply hydrates hair from root to tip.',
          'Helps reduce frizz and dry split-end appearance.',
          'Improves curl definition and strand softness.',
          'Rich natural butter and Vitamin E nourishment.',
        ],
      },
      {
        id: 'usage',
        title: 'How to Use',
        paragraphs: [],
        bullets: [
          'Emulsify a small amount between hands and smooth over damp or dry hair, focusing on mid-lengths and tips.',
        ],
      },
      {
        id: 'results',
        title: 'Expected Results',
        paragraphs: [
          'Hair looks sleeker, softer, and noticeably better moisturized with easier curl styling and less flyaway frizz.',
        ],
        bullets: [],
      },
    ],
    seoTitle: 'Botanical Hair Wax 50 g | Dandy Cosmetics',
    seoDescription:
      'Nourish dry curls and tame frizz on the go with Dandy Botanical Hair Wax 50 g.',
  },

  '-OvPo-cuVeLHWSU8KQ22': {
    productId: '-OvPo-cuVeLHWSU8KQ22',
    name: '3-in-1 Facial Brightening Serum – 30 ml',
    shortDescription:
      'Evening serum combining Niacinamide, Hyaluronic Acid, and Alpha Arbutin for hydration, balanced tone, and post-blemish care.',
    description:
      'Formulated with Niacinamide, Hyaluronic Acid, and Alpha Arbutin, Dandy 3-in-1 Facial Serum (30 ml) hydrates deeply, helps balance excess sebum and refine pore appearance, and visibly improves uneven skin tone and post-blemish marks.',
    highlights: [
      'Triple-active formula with Niacinamide, Hyaluronic Acid & Alpha Arbutin',
      'Helps visibly brighten uneven tone and post-blemish marks',
      'Deep weightless hydration with Hyaluronic Acid',
      'Helps balance surface oiliness and refine pore appearance',
      'Includes step-by-step gradual Week-1 introduction guidance',
    ],
    usageInstructions: [
      'Patch test on a small skin area before full facial use to confirm personal skin tolerance.',
      'Week 1 Gradual Introduction: First evening use: apply for 30 minutes, then rinse. Skip one day. Next use: apply for 1 hour, then rinse. Repeat every other day during Week 1, gradually extending wear time as tolerated.',
      'Once skin adjusts comfortably, apply 2–3 drops at night to clean, dry skin, follow with moisturizer, and apply sunscreen every morning.',
    ],
    ingredientsNote: 'Niacinamide, Hyaluronic Acid, and Alpha Arbutin.',
    structuredSections: [
      {
        id: 'overview',
        title: 'Product Overview',
        paragraphs: [
          'Targeted evening facial serum combining three skincare staples to promote hydration, clarity, and a smoother, more radiant complexion.',
        ],
        bullets: [],
      },
      {
        id: 'features',
        title: 'Key Benefits',
        paragraphs: [],
        bullets: [
          'Helps unify skin tone and diminish the appearance of dark spots.',
          'Softens the look of post-acne marks with regular evening use.',
          'Hydrates skin deeply without heaviness via Hyaluronic Acid.',
          'Helps regulate surface sebum and refine visible pores.',
          'Suitable for oily, combination, and most skin types.',
        ],
      },
      {
        id: 'usage',
        title: 'How to Use & Week-1 Introduction',
        paragraphs: [
          'We recommend introducing the serum gradually during your first week after completing a small patch test:',
        ],
        bullets: [
          'First application: Apply onto clean, dry skin in the evening for 30 minutes, then rinse.',
          'Rest day: Skip one evening, then apply again for 1 hour and rinse.',
          'Week 1 cadence: Continue every other day, gradually increasing duration based on skin comfort.',
          'Ongoing routine: Apply 2–3 drops nightly onto clean, dry skin, lock in with a suitable moisturizer, and always wear daily broad-spectrum sunscreen.',
        ],
      },
      {
        id: 'results',
        title: 'Expected Results',
        paragraphs: [
          'With consistent evening use, skin appears calmer, deeply hydrated, and more even-toned with softened post-blemish marks.',
        ],
        bullets: [],
      },
    ],
    seoTitle: '3-in-1 Facial Serum 30 ml | Dandy Cosmetics',
    seoDescription:
      'Niacinamide, Hyaluronic Acid, and Alpha Arbutin 3-in-1 Facial Serum 30 ml by Dandy Cosmetics for hydrated, radiant skin.',
  },

  '-OvPpP6udx6LlLOL9O34': {
    productId: '-OvPpP6udx6LlLOL9O34',
    name: 'Oily & Combination Skin Facial Cleanser – 150 ml',
    shortDescription:
      'Refreshing daily facial cleanser engineered for oily and combination skin to lift excess sebum and impurities without tightness.',
    description:
      'Purify pores without stripping essential comfort. Dandy Facial Cleanser (150 ml) is specially formulated for oily and combination skin to dissolve impurities, control excess shine, and leave skin refreshed and balanced.',
    highlights: [
      'Deeply cleanses pores and removes daily excess sebum',
      'Reduces unwanted shine without over-drying skin',
      'Helps keep pores clear and refreshed',
      'Balanced morning and evening daily formula for oily & combination skin',
    ],
    usageInstructions: [
      'Wet face with lukewarm water and massage an appropriate amount in gentle circular motions for 1 minute.',
      'Rinse thoroughly with water; use morning and evening.',
    ],
    structuredSections: [
      {
        id: 'overview',
        title: 'Product Overview',
        paragraphs: [
          'Designed specifically for oily and combination skin types seeking crisp freshness and oil control without harsh tightness.',
        ],
        bullets: [],
      },
      {
        id: 'features',
        title: 'Key Benefits',
        paragraphs: [],
        bullets: [
          'Lifts impurities, sunscreen residue, and excess oils effectively.',
          'Helps minimize mid-day shine in the T-zone.',
          'Supports clear pores and smoother skin appearance.',
          'Leaves skin clean and balanced rather than tight.',
        ],
      },
      {
        id: 'usage',
        title: 'How to Use',
        paragraphs: [],
        bullets: [
          'Dampen skin with lukewarm water and gently massage in circular motions for ~60 seconds.',
          'Rinse thoroughly and follow with serum or lightweight moisturizer morning and night.',
        ],
      },
      {
        id: 'results',
        title: 'Expected Results',
        paragraphs: [
          'Skin looks visibly cleaner and fresher immediately; regular morning and night cleansing helps control oiliness and clarify texture.',
        ],
        bullets: [],
      },
    ],
    seoTitle: 'Oily & Combination Facial Cleanser 150 ml | Dandy Cosmetics',
    seoDescription:
      'Gentle oil-balancing Facial Cleanser 150 ml by Dandy Cosmetics for oily and combination skin.',
  },

  '-OvPpguWTAtcaWirD9Um': {
    productId: '-OvPpguWTAtcaWirD9Um',
    name: 'Nourishing Lip Balm with Vitamin E',
    shortDescription:
      'Botanical butter and oil lip balm enriched with Vitamin E and sun protection in Strawberry, Watermelon, and Coconut.',
    description:
      'Dandy Lip Balm combines natural plant butters, nourishing oils, and Vitamin E to deliver intensive moisture, protect against sun and wind dryness, and restore plump-looking, crack-free softness in three fruity flavors.',
    highlights: [
      'Deeply moisturizes dry, chapped lips',
      'Enriched with natural plant butters, oils, and Vitamin E',
      'Helps shield lips from sun and cold weather dryness',
      'Available in Strawberry, Watermelon, and Coconut flavors',
    ],
    usageInstructions: [
      'Glide evenly onto clean, dry lips throughout the day, especially prior to sun exposure or dry weather.',
    ],
    ingredientsNote: 'Natural Plant Butters, Botanical Nourishing Oils, and Vitamin E.',
    variantLabels: {
      s: 'Strawberry',
      w: 'Watermelon',
      c: 'Coconut',
    },
    structuredSections: [
      {
        id: 'overview',
        title: 'Product Overview',
        paragraphs: [
          'Everyday lip comfort enriched with natural oils, creamy butters, and Vitamin E to guard against dryness and chapping.',
        ],
        bullets: [],
      },
      {
        id: 'features',
        title: 'Key Benefits',
        paragraphs: [],
        bullets: [
          'Softens chapped lips and seals in moisture.',
          'Nourishes with plant butters, oils, and Vitamin E.',
          'Provides daily lip protection in sunny, cold, or windy climates.',
          'Suitable for everyday family use.',
        ],
      },
      {
        id: 'usage',
        title: 'How to Use',
        paragraphs: [],
        bullets: [
          'Apply onto clean lips and reapply as needed throughout the day.',
        ],
      },
      {
        id: 'results',
        title: 'Expected Results',
        paragraphs: [
          'Lips look naturally healthier, smoother, and well-hydrated with noticeably fewer dry flakes.',
        ],
        bullets: [],
      },
    ],
    seoTitle: 'Nourishing Lip Balm | Dandy Cosmetics',
    seoDescription:
      'Hydrate and protect lips with Vitamin E and natural plant butters in Dandy Lip Balm (Strawberry, Watermelon, Coconut).',
  },

  '-OvPq4qdTQ-LqYbxr6Yv': {
    productId: '-OvPq4qdTQ-LqYbxr6Yv',
    name: 'Body Splash – 250 ml',
    shortDescription:
      'Full-size 250 ml everyday body splash for hours of crisp refreshment in four captivating signature scents.',
    description:
      'Enjoy a long-lasting veil of refreshing fragrance after every shower. Dandy Body Splash (250 ml) keeps your skin lightly perfumed all day across four mood-boosting scents crafted for every occasion.',
    highlights: [
      'Generous 250 ml full-size bottle ideal for post-shower daily rituals',
      'Refreshing, breathable fragrance mist that wears effortlessly all day',
      'Available in Vanilla Wave, Rosy Velvet, Freezy Crystal, and Golden Breeze',
    ],
    usageInstructions: [
      'Spray evenly over clean, lightly moisturized skin after showering from a comfortable distance.',
    ],
    variantLabels: {
      'vanilla-wave': 'Vanilla Wave',
      'rosy-velvet': 'Rosy Velvet',
      'freezy-crystal': 'Freezy Crystal',
      'golden-breeze': 'Golden Breeze',
    },
    structuredSections: [
      {
        id: 'overview',
        title: 'Fragrance Notes',
        paragraphs: [
          'Choose from four distinct Dandy fragrance blends tailored to your daily mood:',
        ],
        bullets: [
          'Vanilla Wave: Rich, creamy blend of vanilla bean, warm milk, and sweet caramel.',
          'Rosy Velvet: Feminine bouquet of soft roses, pomegranate musk, berries, and sweet cherry.',
          'Freezy Crystal: Crisp, cool, fresh-out-of-the-shower cleanliness with bright feminine sparkle.',
          'Golden Breeze: Radiant, uplifting fruity sweetness with gentle golden warmth.',
        ],
      },
      {
        id: 'usage',
        title: 'How to Use',
        paragraphs: [],
        bullets: [
          'Apply directly after bathing over wrists, neck, and shoulders; layer over Body Butter or Lotion for extended trail.',
        ],
      },
    ],
    seoTitle: 'Body Splash 250 ml | Dandy Cosmetics',
    seoDescription:
      'Full-size Dandy Body Splash 250 ml in Vanilla Wave, Rosy Velvet, Freezy Crystal, and Golden Breeze.',
  },

  '-OvPqarOBOnNgQ_-kpTl': {
    productId: '-OvPqarOBOnNgQ_-kpTl',
    name: 'Whipped Body Butter – 150 g',
    shortDescription:
      'Fast-absorbing whipped butter cream enriched with botanical butters and oils for long-lasting hydration without heaviness.',
    description:
      'Dandy Body Butter (150 g) delivers deep, lasting moisture with rich botanical butters and nourishing oils that melt smoothly into skin, leaving elbows, knees, and dry patches velvety-soft with hours of alluring fragrance.',
    highlights: [
      'Deep, lasting moisture tailored for dry and rough areas',
      'Enriched with natural plant butters and conditioning oils',
      'Rich creamy texture absorbs fast with zero greasy feel',
      'Leaves skin scented in Vanilla Wave, Rosy Velvet, or Freezy Crystal',
    ],
    usageInstructions: [
      'Smooth over clean, dry skin after showering using gentle circular massage until absorbed, focusing on elbows, knees, and heels.',
    ],
    variantLabels: {
      'vanilla-wave': 'Vanilla Wave',
      'rosy-velvet': 'Rosy Velvet',
      'freezy-crystal': 'Freezy Crystal',
    },
    structuredSections: [
      {
        id: 'overview',
        title: 'Product Overview',
        paragraphs: [
          'Intensive daily body hydration paired with signature fragrance notes for velvety-soft, conditioned skin.',
        ],
        bullets: [],
      },
      {
        id: 'features',
        title: 'Key Benefits & Scents',
        paragraphs: [],
        bullets: [
          'Provides deep nourishment and helps smooth dry, rough patches.',
          'Absorbs cleanly without leaving an oily film on clothes.',
          'Vanilla Wave: Cozy creaminess of vanilla, milk, and caramel.',
          'Rosy Velvet: Sweet floral berry blend of rose, pomegranate musk, and cherry.',
          'Freezy Crystal: Clean, airy, fresh scent.',
        ],
      },
      {
        id: 'usage',
        title: 'How to Use',
        paragraphs: [],
        bullets: [
          'Apply generously after bathing or whenever skin craves extra moisture, focusing on dry zones.',
        ],
      },
      {
        id: 'results',
        title: 'Expected Results',
        paragraphs: [
          'Leaves skin feeling velvety-soft, supple, and lightly scented throughout the day.',
        ],
        bullets: [],
      },
    ],
    seoTitle: 'Whipped Body Butter 150 g | Dandy Cosmetics',
    seoDescription:
      'Rich yet fast-absorbing Dandy Body Butter 150 g in Vanilla Wave, Rosy Velvet, and Freezy Crystal.',
  },

  '-OvPqzneo_vqpucc-ef8': {
    productId: '-OvPqzneo_vqpucc-ef8',
    name: 'Body Splash Travel Size – 25 ml',
    shortDescription:
      'Pocket- and purse-friendly 25 ml refreshing body splash available in all four signature Dandy scents.',
    description:
      'Carry effortless freshness wherever the day takes you. Dandy Body Splash 25 ml fits neatly into any handbag or travel pouch for instant anytime scent touch-ups in Vanilla Wave, Rosy Velvet, Freezy Crystal, or Golden Breeze.',
    highlights: [
      'Ultra-compact 25 ml size built for travel and everyday handbags',
      'Four iconic Dandy scent profiles',
      'Lightweight, refreshing everyday formula',
    ],
    usageInstructions: [
      'Spritz lightly onto pulse points or clothing anytime during the day for instant freshness.',
    ],
    variantLabels: {
      'vanilla-wave': 'Vanilla Wave',
      'rosy-velvet': 'Rosy Velvet',
      'freezy-crystal': 'Freezy Crystal',
      'golden-breeze': 'Golden Breeze',
    },
    structuredSections: [
      {
        id: 'overview',
        title: 'Product Overview',
        paragraphs: [
          'Your purse-sized signature Dandy scent mist for refreshing touch-ups on the go.',
        ],
        bullets: [],
      },
      {
        id: 'features',
        title: 'Fragrance Notes',
        paragraphs: [],
        bullets: [
          'Vanilla Wave: Warm creamy blend of vanilla, milk, and caramel.',
          'Rosy Velvet: Playful feminine mix of rose, pomegranate musk, berries, and cherry.',
          'Freezy Crystal: Cool, crisp, just-showered cleanliness.',
          'Golden Breeze: Bright, uplifting sweet fruity warmth.',
        ],
      },
    ],
    seoTitle: 'Body Splash 25 ml Travel Size | Dandy Cosmetics',
    seoDescription:
      'Compact 25 ml Dandy Body Splash for effortless travel freshness in four signature scents.',
  },

  '-OvPrFcWZtH_7tuSs7HJ': {
    productId: '-OvPrFcWZtH_7tuSs7HJ',
    name: 'Body Splash – 100 ml',
    shortDescription:
      'Balanced everyday 100 ml body splash delivering breathable, radiant freshness in four signature Dandy scents.',
    description:
      'Ideal for daily morning routines and gym bags alike, Dandy Body Splash 100 ml surrounds the body in lightweight, vibrant fragrance across four crowd-pleasing blends.',
    highlights: [
      'Handy 100 ml daily size for home, office, or gym bags',
      'Instant refreshing mist feel without heaviness',
      'Available in Vanilla Wave, Rosy Velvet, Freezy Crystal, and Golden Breeze',
    ],
    usageInstructions: [
      'Mist evenly over clean skin after showering or throughout the day as desired.',
    ],
    variantLabels: {
      'vanilla-wave': 'Vanilla Wave',
      'rosy-velvet': 'Rosy Velvet',
      'freezy-crystal': 'Freezy Crystal',
      'golden-breeze': 'Golden Breeze',
    },
    structuredSections: [
      {
        id: 'overview',
        title: 'Product Overview',
        paragraphs: [
          'A balanced 100 ml daily fragrance mist crafted for fresh comfort from morning to night.',
        ],
        bullets: [],
      },
      {
        id: 'features',
        title: 'Fragrance Notes',
        paragraphs: [],
        bullets: [
          'Vanilla Wave: Warm vanilla, creamy milk, and sweet caramel.',
          'Rosy Velvet: Soft roses blended with pomegranate musk, berries, and cherry.',
          'Freezy Crystal: Crisp, cool freshness with clean bright notes.',
          'Golden Breeze: Joyful sweet fruit notes with soft warmth.',
        ],
      },
    ],
    seoTitle: 'Body Splash 100 ml | Dandy Cosmetics',
    seoDescription:
      'Everyday 100 ml Dandy Body Splash in Vanilla Wave, Rosy Velvet, Freezy Crystal, and Golden Breeze.',
  },

  '-Ow3pLIN18dRNJ4SdJsq': {
    productId: '-Ow3pLIN18dRNJ4SdJsq',
    name: 'Hair Booster – 18 Natural Oils Blend',
    shortDescription:
      'Concentrated 18-oil botanical hair and scalp treatment to nourish follicles, strengthen roots, and support fuller growth.',
    description:
      'Powered by 18 natural botanical oils including Rosemary, Garlic, Chili Pepper, Watercress, Castor, Black Seed, Horsetail, Ginger, Mustard, Jojoba, Sweet Almond, Grape Seed, Sesame, Pumpkin Seed, Squash Seed, Wheat Germ, Flaxseed, and Sunflower, Dandy Hair Booster nourishes the scalp and supports stronger, fuller-looking hair.',
    highlights: [
      'Concentrated blend of 18 nourishing cold-pressed natural oils',
      'Helps strengthen hair roots and nourish follicles',
      'Helps reduce shedding linked to weak hair roots',
      'Supports fuller-looking length, strength, and natural luster',
      'Suitable for all hair types',
    ],
    usageInstructions: [
      'Use as a warm oil treatment twice weekly on dry scalp and hair.',
      'Massage gently into the scalp for 3–5 minutes and comb through ends.',
      'Leave on for at least 2 hours or overnight, then wash thoroughly with shampoo.',
    ],
    ingredientsNote:
      '18 Natural Oils: Rosemary, Garlic, Chili Pepper, Watercress, Castor, Black Seed, Horsetail, Ginger, Mustard, Jojoba, Sweet Almond, Grape Seed, Sesame, Pumpkin Seed, Squash Seed, Wheat Germ, Flaxseed, and Sunflower Oil.',
    structuredSections: [
      {
        id: 'overview',
        title: 'Product Overview',
        paragraphs: [
          'Give your scalp and lengths concentrated botanical nutrition crafted from 18 time-honored natural oils to fortify roots and restore healthy sheen.',
        ],
        bullets: [],
      },
      {
        id: 'ingredients',
        title: '18 Botanical Oils',
        paragraphs: [
          'Rosemary Oil, Garlic Oil, Chili Pepper Oil, Watercress Oil, Castor Oil, Black Seed Oil, Horsetail Oil, Ginger Oil, Mustard Oil, Jojoba Oil, Sweet Almond Oil, Grape Seed Oil, Sesame Oil, Pumpkin Oil, Squash Seed Oil, Wheat Germ Oil, Flaxseed Oil, and Sunflower Oil.',
        ],
        bullets: [],
      },
      {
        id: 'features',
        title: 'Key Benefits',
        paragraphs: [],
        bullets: [
          'Supports healthier scalp environment and root strength.',
          'Helps reduce hair shedding caused by weak follicles.',
          'Enhances visible thickness, bounce, and healthy natural shine.',
          'Suitable for all hair textures.',
        ],
      },
      {
        id: 'usage',
        title: 'How to Use',
        paragraphs: [],
        bullets: [
          'Apply twice weekly onto dry scalp and hair.',
          'Massage gently with fingertips for 3–5 minutes, coat mid-lengths and ends, and leave for 2 hours minimum (or overnight) before shampooing out.',
        ],
      },
      {
        id: 'results',
        title: 'Expected Results',
        paragraphs: [
          'With regular twice-weekly oil baths over several weeks, hair gradually looks stronger, denser, and less prone to shedding.',
        ],
        bullets: [],
      },
    ],
    seoTitle: 'Hair Booster 18 Natural Oils Mix | Dandy Cosmetics',
    seoDescription:
      'Nourish follicles and strengthen hair roots with Dandy Hair Booster, an 18-oil natural blend featuring Rosemary, Castor, and Jojoba oils.',
  },

  '-Ow3pm4awZPtvEZgewr7': {
    productId: '-Ow3pm4awZPtvEZgewr7',
    name: 'Anti-Hair Loss Scalp Spray',
    shortDescription:
      'Lightweight, non-greasy twice-daily leave-in scalp spray designed to fortify follicles and minimize hair shedding.',
    description:
      'Support stronger roots effortlessly every day. Dandy Anti-Hair Loss Spray absorbs quickly without greasy buildup, nourishing the scalp to strengthen follicles and help visibly reduce shedding over time for both women and men.',
    highlights: [
      'Helps reduce excessive shedding and strengthen hair roots',
      'Nourishes the scalp to support fuller-looking hair',
      'Featherlight leave-in spray with zero oily residue',
      'Suitable for both women and men',
    ],
    usageInstructions: [
      'Mist directly onto a clean scalp and massage gently until absorbed.',
      'Use twice daily; pair with Dandy Anti-Hair Loss Shampoo for best results.',
    ],
    structuredSections: [
      {
        id: 'overview',
        title: 'Product Overview',
        paragraphs: [
          'Daily leave-in scalp mist formulated to support follicle strength without leaving roots heavy or greasy.',
        ],
        bullets: [],
      },
      {
        id: 'features',
        title: 'Key Benefits',
        paragraphs: [],
        bullets: [
          'Supports root vitality and helps minimize hair shedding.',
          'Delivers targeted scalp nourishment in a fast-absorbing liquid.',
          'Zero greasy buildup — safe for daily styling routines.',
          'Designed for both women and men.',
        ],
      },
      {
        id: 'usage',
        title: 'How to Use',
        paragraphs: [],
        bullets: [
          'Spray onto clean scalp twice daily and massage gently with fingertips.',
          'For complementary care, pair with Dandy Anti-Hair Loss Shampoo.',
        ],
      },
      {
        id: 'results',
        title: 'Expected Results',
        paragraphs: [
          'With consistent daily use, hair gradually feels stronger and shedding reduces over time.',
        ],
        bullets: [],
      },
    ],
    seoTitle: 'Anti-Hair Loss Scalp Spray | Dandy Cosmetics',
    seoDescription:
      'Lightweight non-greasy Anti-Hair Loss Spray by Dandy Cosmetics to support follicle strength and reduce shedding.',
  },

  '-Ow3qRPqc7hbleYuJOkI': {
    productId: '-Ow3qRPqc7hbleYuJOkI',
    name: 'Anti-Dandruff Shampoo – 250 ml',
    shortDescription:
      'Gentle scalp-clarifying 250 ml shampoo formulated to reduce visible flakes and relieve itching without drying hair.',
    description:
      'Calm and clarify flaky scalps gently. Dandy Anti-Dandruff Shampoo (250 ml) removes visible flakes and excess buildup while soothing itchiness and preserving soft, hydrated lengths.',
    highlights: [
      'Helps reduce visible dandruff flakes and prevent buildup recurrence',
      'Deeply cleanses the scalp without stripping hair softness',
      'Soothes scalp itchiness and tightness',
      'Suitable for regular care across all hair types',
    ],
    usageInstructions: [
      'Apply to wet hair and massage gently onto scalp into a rich lather.',
      'Leave on for 2 minutes, then rinse thoroughly with water.',
      'Use 2–3 times weekly; pair with Dandy Anti-Dandruff Spray for fastest results.',
    ],
    structuredSections: [
      {
        id: 'overview',
        title: 'Product Overview',
        paragraphs: [
          'Clarifying scalp care designed to wash away flakes cleanly while leaving hair supple and manageable.',
        ],
        bullets: [],
      },
      {
        id: 'features',
        title: 'Key Benefits',
        paragraphs: [],
        bullets: [
          'Targets visible flakes and reduces recurrence with consistent care.',
          'Cleanses roots effectively without over-drying hair shafts.',
          'Calms scalp discomfort and itching.',
          'Suitable for all hair types.',
        ],
      },
      {
        id: 'usage',
        title: 'How to Use',
        paragraphs: [],
        bullets: [
          'Lather gently onto wet scalp and leave on for 2 minutes before rinsing thoroughly.',
          'Use 2–3 times per week, ideally alongside Dandy Anti-Dandruff Spray.',
        ],
      },
      {
        id: 'results',
        title: 'Expected Results',
        paragraphs: [
          'Leaves scalp refreshed from the first wash, with reduced visible flakes and calmer scalp comfort over regular sessions.',
        ],
        bullets: [],
      },
    ],
    seoTitle: 'Anti-Dandruff Shampoo 250 ml | Dandy Cosmetics',
    seoDescription:
      'Clarify flaky scalps and soothe itchiness gently with Dandy Anti-Dandruff Shampoo 250 ml.',
  },

  '-Ox6gMQgCgsSR-DrXTWk': {
    productId: '-Ox6gMQgCgsSR-DrXTWk',
    name: 'Anti-Hair Loss Shampoo – 250 ml',
    shortDescription:
      'Caffeine, Rosemary, and Chili-infused 250 ml shampoo designed to cleanse the scalp gently and fortify weak hair roots.',
    description:
      'Formulated with Caffeine, Rosemary, and Chili Pepper extracts alongside gentle cleansers, Dandy Anti-Hair Loss Shampoo (250 ml) purifies the scalp without dryness while helping nourish follicles and strengthen weak strands.',
    highlights: [
      'Infused with Caffeine, Rosemary & Chili extracts to invigorate roots',
      'Helps minimize shedding linked to fragile follicles',
      'Gentle scalp-purifying lather without stripping moisture',
      'Enhances hair body, strength, and natural shine',
    ],
    usageInstructions: [
      'Massage gently onto wet hair and scalp until lather forms.',
      'Leave on for 2 minutes, then rinse thoroughly.',
      'Use 2–3 times weekly alongside Dandy Anti-Hair Loss Spray for optimal care.',
    ],
    ingredientsNote: 'Caffeine, Rosemary Extract, Chili Extract, and Gentle Scalp Cleansers.',
    structuredSections: [
      {
        id: 'overview',
        title: 'Product Overview',
        paragraphs: [
          'Invigorating root-care cleanser built to clear scalp buildup while nourishing follicles for fuller, stronger-feeling hair.',
        ],
        bullets: [],
      },
      {
        id: 'ingredients',
        title: 'Key Botanical Actives',
        paragraphs: [
          'Enriched with Caffeine, Rosemary, and Chili extracts to support root vitality within a gentle, non-drying base.',
        ],
        bullets: [],
      },
      {
        id: 'features',
        title: 'Key Benefits',
        paragraphs: [],
        bullets: [
          'Helps reduce hair shedding caused by weak follicles.',
          'Cleanses impurities gently while preserving scalp comfort.',
          'Supports fuller-looking density and natural gloss over time.',
        ],
      },
      {
        id: 'usage',
        title: 'How to Use',
        paragraphs: [],
        bullets: [
          'Work into wet hair and scalp for 2 minutes, then rinse well.',
          'Use 2–3 times weekly and pair with Dandy Anti-Hair Loss Spray.',
        ],
      },
      {
        id: 'results',
        title: 'Expected Results',
        paragraphs: [
          'With steady routine adherence, hair shedding gradually decreases and hair feels stronger and fuller.',
        ],
        bullets: [],
      },
    ],
    seoTitle: 'Anti-Hair Loss Shampoo 250 ml | Dandy Cosmetics',
    seoDescription:
      'Caffeine and Rosemary Anti-Hair Loss Shampoo 250 ml by Dandy Cosmetics to fortify hair roots and cleanse gently.',
  },

  '-Ox6gklPQABGE7xPcq9a': {
    productId: '-Ox6gklPQABGE7xPcq9a',
    name: 'Anti-Dandruff Scalp Spray – 60 ml',
    shortDescription:
      'Pre-wash targeted 60 ml scalp spray formulated to soften stubborn flakes and soothe itching prior to shampooing.',
    description:
      'Maintain a calm, flake-free scalp with Dandy Anti-Dandruff Spray (60 ml). Designed for pre-wash application, it quickly absorbs to calm itching, soothe irritation, and help loosen stubborn flakes before rinsing.',
    highlights: [
      'Targets visible flakes and reduces recurrent scalp buildup',
      'Calms itching and scalp irritation rapidly',
      'Lightweight, non-greasy pre-wash formula',
      'Suitable for all hair types',
    ],
    usageInstructions: [
      'Spray directly onto clean scalp, massage gently, and leave on for 5–20 minutes only.',
      'Rinse thoroughly using Dandy Anti-Dandruff Shampoo.',
      'Use twice weekly until desired comfort is reached, then taper frequency gradually.',
    ],
    structuredSections: [
      {
        id: 'overview',
        title: 'Product Overview',
        paragraphs: [
          'Focused 5-to-20-minute pre-wash scalp treatment to calm itchiness and lift stubborn flakes before cleansing.',
        ],
        bullets: [],
      },
      {
        id: 'features',
        title: 'Key Benefits',
        paragraphs: [],
        bullets: [
          'Helps reduce dandruff appearance and scalp flakiness.',
          'Soothes scalp irritation and itching.',
          'Fast-absorbing with zero heavy residue.',
        ],
      },
      {
        id: 'usage',
        title: 'How to Use',
        paragraphs: [],
        bullets: [
          'Spray directly onto scalp, massage lightly, wait 5–20 minutes, then wash out thoroughly with Dandy Anti-Dandruff Shampoo.',
          'Repeat twice a week and gradually taper as scalp balance improves.',
        ],
      },
      {
        id: 'results',
        title: 'Expected Results',
        paragraphs: [
          'Supports gradual reduction in visible flakes while keeping the scalp clean and comfortable.',
        ],
        bullets: [],
      },
    ],
    seoTitle: 'Anti-Dandruff Scalp Spray 60 ml | Dandy Cosmetics',
    seoDescription:
      'Pre-wash Dandy Anti-Dandruff Spray 60 ml to soothe itchy, flaky scalps cleanly.',
  },

  '-Ox6hMmd9Ku_sU4d8le-': {
    productId: '-Ox6hMmd9Ku_sU4d8le-',
    name: 'Deep Repair Hair Mask – 250 ml',
    shortDescription:
      'FiberHance-infused 250 ml repair mask with Shea, Cocoa, Jojoba, Pumpkin Seed & Coconut oils, Proteins, Panthenol, and Vitamin B5.',
    description:
      'Revive chemically, heat-, or color-stressed hair with Dandy Deep Repair Hair Mask (250 ml). Powered by FiberHance technology, Shea & Cocoa butters, Lanolin, Jojoba, Pumpkin Seed & Coconut oils, Proteins, Panthenol, and Vitamin B5, it deeply conditions, smooths frizz, and helps restore strength to damaged ends.',
    highlights: [
      'FiberHance bonding technology for damaged, dyed, keratin-, or heat-stressed hair',
      'Enriched with Shea Butter, Cocoa Butter, Lanolin, Jojoba, Pumpkin Seed & Coconut oils',
      'Contains Hair Proteins, Panthenol, and Vitamin B5',
      'Deeply hydrates, tames frizz, and eases detangling',
    ],
    usageInstructions: [
      'After shampooing, apply evenly from mid-lengths to ends.',
      'Leave for ~30 minutes under a thermal cap or warm towel, then rinse with lukewarm water.',
      'Use 2–3 times weekly for noticeably softer, stronger hair.',
    ],
    ingredientsNote:
      'FiberHance Technology, Shea Butter, Cocoa Butter, Lanolin, Jojoba Oil, Pumpkin Seed Oil, Coconut Oil, Proteins, Panthenol, and Vitamin B5.',
    structuredSections: [
      {
        id: 'overview',
        title: 'Product Overview',
        paragraphs: [
          'Intensive restorative hair mask designed especially for dry strands or hair stressed by dye, protein, or straightening treatments.',
        ],
        bullets: [],
      },
      {
        id: 'ingredients',
        title: 'Key Ingredients',
        paragraphs: [
          'Shea Butter, Cocoa Butter, Lanolin, Jojoba Oil, Pumpkin Seed Oil, Coconut Oil, Hydrolyzed Proteins, Panthenol, and Vitamin B5.',
        ],
        bullets: [],
      },
      {
        id: 'features',
        title: 'Key Benefits',
        paragraphs: [],
        bullets: [
          'Deeply conditions damaged, split-prone hair.',
          'Restores silky slip, reduces frizz, and eases combing.',
          'Enhances strand elasticity and minimizes breakage.',
          'Ideal recovery care after coloring, protein, or heat treatments.',
        ],
      },
      {
        id: 'usage',
        title: 'How to Use',
        paragraphs: [],
        bullets: [
          'Smooth through damp shampooed hair from mid-shaft to ends.',
          'Wait 30 minutes (using a warm towel or thermal cap) and rinse thoroughly with lukewarm water 2–3 times a week.',
        ],
      },
      {
        id: 'results',
        title: 'Expected Results',
        paragraphs: [
          'Immediate softness and easier detangling from the first treatment, with improved strength and less splitting over consistent use.',
        ],
        bullets: [],
      },
    ],
    seoTitle: 'Deep Repair Hair Mask 250 ml | Dandy Cosmetics',
    seoDescription:
      'Repair heat-, dye-, and chemically stressed hair with Dandy FiberHance Hair Mask 250 ml.',
  },

  '-Ox6kxYMSw7H675QwVz0': {
    productId: '-Ox6kxYMSw7H675QwVz0',
    name: 'Anti-Dandruff Complete Care Duo',
    shortDescription:
      'Two-step anti-dandruff routine combining Anti-Dandruff Scalp Spray and Anti-Dandruff Shampoo for a calm, flake-free scalp.',
    description:
      'A coordinated two-step scalp solution pairing Dandy Anti-Dandruff Scalp Spray and Anti-Dandruff Shampoo to loosen buildup, soothe itching, balance scalp oils, and keep hair clean, soft, and healthy.',
    highlights: [
      'Complete 2-step system: Anti-Dandruff Spray + Anti-Dandruff Shampoo',
      'Helps eliminate visible flakes and reduce recurrence',
      'Cleanses deeply without stripping hair moisture',
      'Calms itching while balancing scalp sebum levels',
    ],
    usageInstructions: [
      'Spray Anti-Dandruff Spray onto scalp and leave for 5–20 minutes.',
      'Wash out thoroughly with Anti-Dandruff Shampoo, massaging into a lather for 2 minutes before rinsing well.',
      'Use twice weekly until scalp clears, then taper frequency gradually.',
    ],
    structuredSections: [
      {
        id: 'overview',
        title: 'Set Overview',
        paragraphs: [
          'Combines targeted pre-wash scalp treatment with clarifying shampoo cleansing for balanced dandruff control.',
        ],
        bullets: [],
      },
      {
        id: 'features',
        title: 'Key Benefits',
        paragraphs: [],
        bullets: [
          'Targets flakes and eases scalp irritation together.',
          'Deeply clarifies roots without drying hair shafts.',
          'Helps maintain healthy scalp oil balance.',
        ],
      },
      {
        id: 'usage',
        title: 'How to Use',
        paragraphs: [],
        bullets: [
          'Apply Spray to scalp for 5–20 minutes prior to bathing.',
          'Wash thoroughly with Anti-Dandruff Shampoo (leaving lather on for 2 minutes) twice weekly, then taper gradually.',
        ],
      },
      {
        id: 'results',
        title: 'Expected Results',
        paragraphs: [
          'Refreshes the scalp from initial uses while visibly decreasing flakes and irritation over regular weekly sessions.',
        ],
        bullets: [],
      },
    ],
    seoTitle: 'Anti-Dandruff Complete Duo | Dandy Cosmetics',
    seoDescription:
      'Save on a full 2-step anti-dandruff routine with Dandy Anti-Dandruff Spray and Shampoo Collection.',
  },

  '-Ox6lYUp_xif6WXAHMGO': {
    productId: '-Ox6lYUp_xif6WXAHMGO',
    name: 'Anti-Hair Loss Complete Care Duo',
    shortDescription:
      'Coordinated root-strengthening routine pairing Anti-Hair Loss Shampoo and twice-daily Leave-In Scalp Spray.',
    description:
      'A targeted two-step hair-fall routine uniting Dandy Anti-Hair Loss Shampoo and Anti-Hair Loss Spray to cleanse gently, nourish weak follicles, reduce shedding, and promote fuller, stronger-looking hair for both women and men.',
    highlights: [
      'Complete 2-step root routine: Anti-Hair Loss Spray + Shampoo',
      'Nourishes scalp and strengthens hair follicles from the roots',
      'Helps reduce excessive shedding with steady routine commitment',
      'Suitable for women, men, and all hair types',
    ],
    usageInstructions: [
      'Apply Anti-Hair Loss Spray to clean scalp twice daily (morning and evening).',
      'Wash scalp with Anti-Hair Loss Shampoo twice weekly, leaving lather on for 2 minutes before rinsing.',
    ],
    structuredSections: [
      {
        id: 'overview',
        title: 'Set Overview',
        paragraphs: [
          'Structured daily and weekly care designed to support healthier hair follicles and visibly stronger strands.',
        ],
        bullets: [],
      },
      {
        id: 'features',
        title: 'Key Benefits',
        paragraphs: [],
        bullets: [
          'Supports reduced hair shedding and stronger follicle anchoring.',
          'Cleanses scalp gently while delivering key root nutrients.',
          'Suitable for both women and men across all hair textures.',
        ],
      },
      {
        id: 'usage',
        title: 'How to Use',
        paragraphs: [],
        bullets: [
          'Spray onto clean scalp twice daily.',
          'Cleanse twice weekly with Anti-Hair Loss Shampoo.',
        ],
      },
      {
        id: 'results',
        title: 'Expected Results',
        paragraphs: [
          'Shedding gradually eases as hair gains noticeable strength and density; full desired improvement typically unfolds across 3 to 6 months of consistent routine use.',
        ],
        bullets: [],
      },
    ],
    seoTitle: 'Anti-Hair Loss Complete Duo | Dandy Cosmetics',
    seoDescription:
      'Strengthen follicles and reduce hair shedding with Dandy Anti-Hair Loss Shampoo & Spray Collection.',
  },

  '-Ox6sNW3Ki0Am9E6R9n_': {
    productId: '-Ox6sNW3Ki0Am9E6R9n_',
    name: 'Hair Repair Collection (Sulfate-Free Shampoo + Mask)',
    shortDescription:
      'Restorative duo pairing Sulfate-Free Shampoo (500 ml) and Deep Repair Hair Mask (250 ml) for dry, damaged, or treated hair.',
    description:
      'Rebuild softness and shine with Dandy’s restorative hair care duo: gentle Sulfate-Free Shampoo to cleanse without stripping natural oils, plus Deep Repair Hair Mask to deeply moisturize, mend damaged ends, and smooth frizz. Ideal for dyed, keratin-, or protein-treated hair.',
    highlights: [
      'Includes Sulfate-Free Shampoo + Deep Repair Hair Mask',
      'Cleanses without stripping natural oils or moisture',
      'Deeply hydrates, softens frizz, and helps protect against split ends',
      'Safe for color-treated, protein-treated, and keratin-treated hair',
    ],
    usageInstructions: [
      'Wash hair and scalp first with Sulfate-Free Shampoo and rinse thoroughly.',
      'Apply Deep Repair Mask from mid-lengths to ends, leave 10–30 minutes, then rinse well. Use mask 1–2 times weekly.',
    ],
    structuredSections: [
      {
        id: 'overview',
        title: 'Collection Overview',
        paragraphs: [
          'The ideal two-step ritual for dry, heat-styled, color-treated, or protein-treated hair needing gentle cleansing and deep conditioning.',
        ],
        bullets: [],
      },
      {
        id: 'features',
        title: 'Key Benefits',
        paragraphs: [],
        bullets: [
          'Preserves scalp and strand moisture during every wash.',
          'Deeply nourishes brittle lengths and tames stubborn frizz.',
          'Safe compatibility with salon dye, keratin, and protein services.',
        ],
      },
      {
        id: 'usage',
        title: 'How to Use',
        paragraphs: [],
        bullets: [
          'Cleanse hair with Sulfate-Free Shampoo and rinse clean.',
          'Smooth Repair Mask from mid-shaft to tips, leave 10–30 minutes, and rinse well (1–2 times weekly).',
        ],
      },
      {
        id: 'results',
        title: 'Expected Results',
        paragraphs: [
          'Smoother, easier-to-detangle hair from the very first wash, with lasting softness, shine, and reduced breakage over continued care.',
        ],
        bullets: [],
      },
    ],
    seoTitle: 'Hair Repair Collection (Shampoo + Mask) | Dandy Cosmetics',
    seoDescription:
      'Sulfate-Free Shampoo + Deep Repair Hair Mask duo by Dandy Cosmetics for soft, frizz-free, hydrated hair.',
  },

  '-Ox6w5wfqsuhTgYlMDBs': {
    productId: '-Ox6w5wfqsuhTgYlMDBs',
    name: 'Oily & Combination Skin Care Duo',
    shortDescription:
      'Balanced 2-step daily facial routine pairing Facial Cleanser (150 ml) and 3-in-1 Serum (30 ml) for clear, radiant skin.',
    description:
      'Formulated for oily and combination skin, Dandy Skin Care Collection combines our deep-cleansing Facial Cleanser and Niacinamide + Hyaluronic Acid + Alpha Arbutin 3-in-1 Serum to control shine, refine pore appearance, hydrate cleanly, and improve uneven tone without stripping.',
    highlights: [
      'Includes Oily & Combination Facial Cleanser + 3-in-1 Facial Serum',
      'Removes excess oil and impurities while maintaining moisture balance',
      'Helps minimize shine, refine pore appearance, and brighten post-acne marks',
      'Powered by Niacinamide, Hyaluronic Acid, and Alpha Arbutin',
    ],
    usageInstructions: [
      'Cleanse morning and evening with Facial Cleanser, rinse thoroughly, and pat dry.',
      'In the evening, apply 2–3 drops of 3-in-1 Serum onto clean, dry skin (introducing gradually during Week 1), follow with moisturizer, and wear sunscreen by day.',
    ],
    structuredSections: [
      {
        id: 'overview',
        title: 'Collection Overview',
        paragraphs: [
          'Complete 2-step routine tailored for oily and combination skin needing oil control, hydration, and tone clarity.',
        ],
        bullets: [],
      },
      {
        id: 'features',
        title: 'Key Benefits',
        paragraphs: [],
        bullets: [
          'Purifies pores and manages surface oil without over-drying.',
          'Delivers weightless Hyaluronic Acid moisture.',
          'Helps unify tone and diminish post-blemish marks with Niacinamide & Alpha Arbutin.',
        ],
      },
      {
        id: 'usage',
        title: 'How to Use',
        paragraphs: [],
        bullets: [
          '1. Wash morning and night with Facial Cleanser and gently pat dry.',
          '2. Apply 2–3 drops of Serum at night onto clean, dry skin.',
          '3. Follow with a light moisturizer and apply daily daytime SPF.',
        ],
      },
      {
        id: 'results',
        title: 'Expected Results',
        paragraphs: [
          'Clearer, fresher complexion with reduced midday shine and visibly more even-looking skin tone over regular care.',
        ],
        bullets: [],
      },
    ],
    seoTitle: 'Oily & Combination Skin Care Duo | Dandy Cosmetics',
    seoDescription:
      'Shop Dandy Facial Cleanser + 3-in-1 Brightening Serum Collection for balanced, radiant oily and combination skin.',
  },

  '-Ox74e3NwfE2TabGBnUT': {
    productId: '-Ox74e3NwfE2TabGBnUT',
    name: 'Dandy Musk Trio Set (3 × 3 ml)',
    shortDescription:
      'Three concentrated 3 ml perfume oil vials featuring Powder Musk, Pomegranate Musk, and White Musk for effortless layering.',
    description:
      'Discover Dandy’s classic trio of concentrated fragrance oils (3 × 3 ml). Featuring Powder Musk, Pomegranate Musk, and White Musk in sleek pocket-sized vials, this unisex set delivers lasting elegance for everyday wear and special occasions.',
    highlights: [
      'Includes 3 signature scents: Powder Musk, Pomegranate Musk & White Musk',
      'Concentrated, lightweight perfume oil for long-lasting wear',
      'Travel-friendly 3 ml vials ideal for purse or pocket',
      'Unisex fragrance trio suited for everyday wear and gifting',
    ],
    usageInstructions: [
      'Dab a small drop onto pulse points such as wrists, neck, and behind the ears; reapply as desired.',
    ],
    structuredSections: [
      {
        id: 'overview',
        title: 'Set Overview',
        paragraphs: [
          'Three timeless Dandy musk accords curated in convenient 3 ml vials so you can wear each fragrance solo or layer to suit every mood.',
        ],
        bullets: [],
      },
      {
        id: 'features',
        title: 'Key Benefits',
        paragraphs: [],
        bullets: [
          'Three distinct scents in one giftable set: Powder, Pomegranate, and White Musk.',
          'Smooth, alcohol-free oil texture with hours of gentle scent longevity.',
          'Portable size for easy on-the-go fragrance touch-ups.',
          'Unisex scent collection suited to every season.',
        ],
      },
      {
        id: 'usage',
        title: 'How to Use',
        paragraphs: [],
        bullets: [
          'Touch a tiny drop onto wrists, collarbone, or behind the ears.',
        ],
      },
      {
        id: 'results',
        title: 'Fragrance Experience',
        paragraphs: [
          'Leaves skin subtly scented with clean, graceful musk warmth that lingers effortlessly for hours.',
        ],
        bullets: [],
      },
    ],
    seoTitle: 'Dandy Musk Trio Set 3 × 3 ml | Dandy Cosmetics',
    seoDescription:
      'Explore White Musk, Powder Musk, and Pomegranate Musk in the Dandy Cosmetics 3 × 3 ml Musk Trio Set.',
  },

  '-OxC877LX3vzD-3Pi_th': {
    productId: '-OxC877LX3vzD-3Pi_th',
    name: 'Dandy Signature Musk Oil – 6 ml',
    shortDescription:
      'Concentrated 6 ml traditional musk perfume oil available in White Musk, Pomegranate Musk, and Powder Musk.',
    description:
      'Experience timeless elegance with Dandy Signature Musk (6 ml). Available in three cherished scents — White Musk, Pomegranate Musk, and Powder Musk — designed for soft, lingering fragrance on pulse points.',
    highlights: [
      'Concentrated 6 ml musk oil for long-wearing pulse-point fragrance',
      'Available in White Musk, Pomegranate Musk, and Powder Musk',
      'Sleek travel-ready bottle',
    ],
    usageInstructions: [
      'Apply a gentle touch onto clean wrists, neck, and behind the ears.',
    ],
    variantLabels: {
      'م': 'White Musk',
      'م-1': 'Pomegranate Musk',
      'م-2': 'Powder Musk',
    },
    structuredSections: [
      {
        id: 'overview',
        title: 'Product Overview',
        paragraphs: [
          'A rich, timeless 6 ml musk oil crafted for clean everyday elegance and gentle fragrance layering.',
        ],
        bullets: [],
      },
      {
        id: 'features',
        title: 'Available Scents',
        paragraphs: [],
        bullets: [
          'White Musk: Clean, airy softness with classic elegance.',
          'Pomegranate Musk: Subtle fruity sweetness layered over smooth musk.',
          'Powder Musk: Cozy, clean powdery warmth.',
        ],
      },
    ],
    seoTitle: 'Dandy Signature Musk Oil 6 ml | Dandy Cosmetics',
    seoDescription:
      'Concentrated 6 ml Dandy Musk Oil in White Musk, Pomegranate Musk, and Powder Musk.',
  },

  '-P5hKLdYUiIFHPxjSNUm': {
    productId: '-P5hKLdYUiIFHPxjSNUm',
    name: 'DANDY Body Lotion – 200 ml',
    shortDescription:
      'Lightweight, fast-absorbing 200 ml daily body lotion enriched with natural butters and oils for velvety softness and lingering scent.',
    description:
      'Make daily hydration effortless with DANDY Body Lotion (200 ml). Enriched with nourishing natural butters and oils in a weightless, fast-absorbing texture, it leaves skin velvety-soft, supple, and delicately scented in Vanilla Wave, Rosy Velvet, or Freezy Crystal without any greasy residue.',
    highlights: [
      'Deep daily hydration for soft, supple skin texture',
      'Enriched with nourishing botanical butters and oils',
      'Helps smooth dryness and rough patches',
      'Featherlight, fast-absorbing lotion with zero greasy feel',
      'Available in Vanilla Wave, Rosy Velvet, and Freezy Crystal',
    ],
    usageInstructions: [
      'Apply generously onto clean, dry skin, preferably right after showering.',
      'Massage gently in circular motions until fully absorbed; reapply anytime as needed.',
    ],
    ingredientsNote: 'Natural Nourishing Plant Butters and Conditioning Botanical Oils.',
    variantLabels: {
      v: 'Vanilla Wave',
      f: 'Freezy Crystal',
      r: 'Rosy Velvet',
    },
    structuredSections: [
      {
        id: 'overview',
        title: 'Product Overview',
        paragraphs: [
          'Everyday 200 ml body moisturizer combining deep nourishment and featherlight absorption for comfortable all-day glow.',
        ],
        bullets: [],
      },
      {
        id: 'ingredients',
        title: 'Ingredients & Care Notes',
        paragraphs: [
          'Enriched with nourishing plant butters and oils that lock in hydration and leave skin silky-smooth without feeling heavy or sticky.',
        ],
        bullets: [],
      },
      {
        id: 'features',
        title: 'Key Benefits & Scents',
        paragraphs: [],
        bullets: [
          'Softens dryness and maintains supple skin elasticity.',
          'Fast-absorbing lightweight emulsion for everyday comfort.',
          'Vanilla Wave: Warm, creamy blend of vanilla, milk, and caramel.',
          'Rosy Velvet: Feminine mix of roses, pomegranate musk, berries, and sweet cherry.',
          'Freezy Crystal: Crisp, cool, fresh scent for clean all-day radiance.',
        ],
      },
      {
        id: 'usage',
        title: 'How to Use',
        paragraphs: [],
        bullets: [
          'Smooth over clean, dry skin after showering using gentle circular strokes until absorbed.',
        ],
      },
      {
        id: 'results',
        title: 'Expected Results',
        paragraphs: [
          'Immediate softness and comfortable hydration from the first wear, with velvety skin and lingering scent for hours.',
        ],
        bullets: [],
      },
    ],
    seoTitle: 'DANDY Body Lotion 200 ml | Dandy Cosmetics',
    seoDescription:
      'Lightweight, fast-absorbing DANDY Body Lotion 200 ml enriched with natural butters and oils in Vanilla Wave, Rosy Velvet, and Freezy Crystal.',
  },
});

export interface ClientProductLocalizationEntry {
  name: string;
  categorySlug: string;
  variantLabels: Readonly<Record<string, string>>;
}

/**
 * Compact lookup map safe to serialize cleanly for client-side scripts
 * (`cart-client`, `invoice-client`, `track-order-client`, `account-client`,
 * `SearchDrawer`, `pink-friday`) without shipping full editorial descriptions.
 */
export const EN_PRODUCT_SUMMARY_MAP: Readonly<Record<string, ClientProductLocalizationEntry>> =
  Object.freeze(
    Object.fromEntries(
      Object.values(EN_PRODUCT_CONTENT).map((entry) => [
        entry.productId,
        {
          name: entry.name,
          categorySlug:
            entry.productId === '-OW9WB1GTP1GaDoqcd2R' ||
            entry.productId === '-OWF9Deint3XcB6iNdCE' ||
            entry.productId === '-OvPpguWTAtcaWirD9Um' ||
            entry.productId === '-OvPo-cuVeLHWSU8KQ22' ||
            entry.productId === '-OvPpP6udx6LlLOL9O34' ||
            entry.productId === '-Ox6w5wfqsuhTgYlMDBs'
              ? 'skin-care'
              : entry.productId === '-OWF6uqnhnu3TCvoqLSD' ||
                  entry.productId === '-OWF8NVhw0HgIaJRVOYL' ||
                  entry.productId === '-OvPq4qdTQ-LqYbxr6Yv' ||
                  entry.productId === '-OvPqzneo_vqpucc-ef8' ||
                  entry.productId === '-OvPrFcWZtH_7tuSs7HJ' ||
                  entry.productId === '-Ox74e3NwfE2TabGBnUT' ||
                  entry.productId === '-OxC877LX3vzD-3Pi_th'
                ? 'fragrance'
                : entry.productId === '-OWF5L62TkM4Y0odMy-l' ||
                    entry.productId === '-O_4D5IO_nPZf1fKcVlJ' ||
                    entry.productId === '-ObKDCc_il_Dz2_Mih-a' ||
                    entry.productId.startsWith('-Ow3') ||
                    entry.productId.startsWith('-Ox6g') ||
                    entry.productId.startsWith('-Ox6h') ||
                    entry.productId.startsWith('-Ox6k') ||
                    entry.productId.startsWith('-Ox6l') ||
                    entry.productId.startsWith('-Ox6s')
                  ? 'hair-care'
                  : 'body-care',
          variantLabels: Object.freeze({ ...(entry.variantLabels || {}) }),
        },
      ])
    )
  );

export function resolveClientLocalizedProductName(
  productId: string | undefined | null,
  fallbackName: string,
  locale: 'ar' | 'en'
): string {
  if (locale !== 'en' || !productId) return fallbackName;
  const cleanId = String(productId).split('::')[0];
  return EN_PRODUCT_SUMMARY_MAP[cleanId]?.name || fallbackName;
}

export function resolveClientLocalizedVariantName(
  productId: string | undefined | null,
  variantId: string | undefined | null,
  fallbackName: string,
  locale: 'ar' | 'en'
): string {
  if (locale !== 'en') return fallbackName;
  const cleanId = productId ? String(productId).split('::')[0] : '';
  if (cleanId && variantId && EN_PRODUCT_SUMMARY_MAP[cleanId]?.variantLabels[variantId]) {
    return EN_PRODUCT_SUMMARY_MAP[cleanId].variantLabels[variantId];
  }
  const commonVariantMap: Record<string, string> = {
    'sweet-sugar': 'Sweet Sugar',
    'purple-flowers': 'Purple Flowers',
    'candy-fruits': 'Candy Fruits',
    'cherrys-love': 'Cherry’s Love',
    'vanilla-wave': 'Vanilla Wave',
    'rosy-velvet': 'Rosy Velvet',
    'freezy-crystal': 'Freezy Crystal',
    'golden-breeze': 'Golden Breeze',
    s: 'Strawberry',
    w: 'Watermelon',
    c: 'Coconut',
    v: 'Vanilla Wave',
    f: 'Freezy Crystal',
    r: 'Rosy Velvet',
    'م': 'White Musk',
    'م-1': 'Pomegranate Musk',
    'م-2': 'Powder Musk',
    'مسك أبيض': 'White Musk',
    'مسك رمان': 'Pomegranate Musk',
    'مسك باودر': 'Powder Musk',
  };
  if (variantId && commonVariantMap[variantId]) return commonVariantMap[variantId];
  if (fallbackName && commonVariantMap[fallbackName.trim()]) return commonVariantMap[fallbackName.trim()];
  return fallbackName;
}
