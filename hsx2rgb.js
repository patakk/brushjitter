
export function lum(r, g, b) {
    return Math.sqrt(0.299 * r * r + 0.587 * g * g + 0.114 * b * b);
}

export function hue2rgb(p, q, t) {
    if (t < 0.0) t += 1.0;
    if (t > 1.0) t -= 1.0;
    if (t < 1.0 / 6.0) return p + (q - p) * 6.0 * t;
    if (t < 0.5) return q;
    if (t < 2.0 / 3.0) return p + (q - p) * (2.0 / 3.0 - t) * 6.0;
    return p;
}

export function hsl2rgb(h, s, l) {
    let r, g, b;
    if (s === 0.0) {
        r = g = b = l; // achromatic
    } else {
        const q = l < 0.5 ? l * (1.0 + s) : l + s - l * s;
        const p = 2.0 * l - q;
        r = hue2rgb(p, q, h + 1.0 / 3.0);
        g = hue2rgb(p, q, h);
        b = hue2rgb(p, q, h - 1.0 / 3.0);
    }

    return [r, g, b];
}

export function hsx2rgb(hue, sat, targetLuminance) {
    let color = hsl2rgb(hue, sat, targetLuminance);
    const epsilon = 0.001;
    let low = 0.0;
    let high = 1.0;
    let mid;

    for (let i = 0; i < 16; i++) {
        mid = (low + high) * 0.5;
        let rgb = hsl2rgb(hue, sat, mid);
        let currentLum = lum(rgb[0], rgb[1], rgb[2]);

        if (currentLum < targetLuminance) {
            low = mid;
        } else {
            high = mid;
        }

        if (high - low < epsilon) {
            break; 
        }
    }

    return hsl2rgb(hue, sat, mid);
}
