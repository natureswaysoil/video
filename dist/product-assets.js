"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getProductLandingConfigByAsin = getProductLandingConfigByAsin;
exports.getProductAssetPath = getProductAssetPath;
const BASE_DOMAIN = 'natureswaysoil.com';
const PRODUCT_LANDING_CONFIGS = {
    B0DJ1JNQW4: {
        asin: 'B0DJ1JNQW4',
        slug: 'pasture-revival',
        url: `${BASE_DOMAIN}/pasture-revival`,
        cta: 'Revive your pasture naturally',
    },
    B0FG38PQQX: {
        asin: 'B0FG38PQQX',
        slug: 'dog-urine-neutralizer',
        url: `${BASE_DOMAIN}/dog-urine-neutralizer`,
        cta: 'Fix yellow pet spots fast',
    },
    B0DC9CSMWS: {
        asin: 'B0DC9CSMWS',
        slug: 'dog-urine-neutralizer',
        url: `${BASE_DOMAIN}/dog-urine-neutralizer`,
        cta: 'Fix yellow pet spots fast',
    },
    B0FG38YYJ5: {
        asin: 'B0FG38YYJ5',
        slug: 'dog-urine-neutralizer',
        url: `${BASE_DOMAIN}/dog-urine-neutralizer`,
        cta: 'Fix yellow pet spots fast',
    },
    B0GFC45K6T: {
        asin: 'B0GFC45K6T',
        slug: 'lawn-fertilizer',
        url: `${BASE_DOMAIN}/lawn-fertilizer`,
        cta: 'Feed your lawn for deeper green',
    },
    B0DDCPYLG1: {
        asin: 'B0DDCPYLG1',
        slug: 'garden-mix',
        url: `${BASE_DOMAIN}/garden-mix`,
        cta: 'Grow stronger, healthier gardens',
    },
    B0D9HT7ND8: {
        asin: 'B0D9HT7ND8',
        slug: 'hydroponic-nutrients',
        url: `${BASE_DOMAIN}/hydroponic-nutrients`,
        cta: 'Power clean hydroponic growth',
    },
    B0GTBZ7N56: {
        asin: 'B0GTBZ7N56',
        slug: 'fruit-tree-fertilizer',
        url: `${BASE_DOMAIN}/fruit-tree-fertilizer`,
        cta: 'Grow bigger, sweeter fruit',
    },
};
function normalizeAsin(asin) {
    return String(asin || '').trim().toUpperCase();
}
function getProductLandingConfigByAsin(asin) {
    const normalized = normalizeAsin(asin);
    if (!normalized)
        return undefined;
    return PRODUCT_LANDING_CONFIGS[normalized];
}
function getProductAssetPath(title) {
    const lower = title.toLowerCase();
    if (lower.includes('dog') || lower.includes('urine')) {
        return 'assets/products/dog-urine.png';
    }
    if (lower.includes('hay') || lower.includes('pasture')) {
        return 'assets/products/hay-pasture.png';
    }
    if (lower.includes('lawn')) {
        return 'assets/products/lawn-fertilizer.png';
    }
    if (lower.includes('fruit') || lower.includes('tree')) {
        return 'assets/products/fruit-tree.png';
    }
    return undefined;
}
