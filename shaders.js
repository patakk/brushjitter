
// Vertex shader program
export const drawingVertexShader = `
    attribute vec4 aVertexPosition;
    uniform vec2 uPosition;    // The brush center position in GL coordinates
    uniform float uSize;       // Half the size of the brush quad
    uniform float uAngle;
    uniform vec2 uResolution;

    varying vec2 vUV;

    void main(void) {
        vec2 size = vec2(uSize) / uResolution;

        // rotation
        float s = sin(uAngle);
        float c = cos(uAngle);
        mat2 rot = mat2(c, -s, s, c);
        vec4 rotatedPos = vec4(rot * aVertexPosition.xy, 1.0, 1.0);

        gl_Position = aVertexPosition * vec4(size.xy, 1.0, 1.0) + vec4(uPosition, 0.0, 0.0);
        vUV = aVertexPosition.xy * 0.5 + 0.5;

    }
`;


export const drawingFragmentShader = `
    precision mediump float;

    uniform vec4 uBrushColor;
    uniform vec2 uResolution;
    uniform float uTime;
    uniform float uBrushJitter;

    varying vec2 vUV;

    
    #define NUM_OCTAVES 8

    
    float lum(float r, float g, float b) {
        return sqrt(0.299*r*r + 0.587*g*g + 0.114*b*b);
        // return sqrt(0.2126*r + 0.7152*g + 0.0722*b);
    }


    float hue2rgb(float p, float q, float t) {
        if (t < 0.0) t += 1.0;
        if (t > 1.0) t -= 1.0;
        if (t < 1.0 / 6.0) return p + (q - p) * 6.0 * t;
        if (t < 0.5) return q;
        if (t < 2.0 / 3.0) return p + (q - p) * (2.0 / 3.0 - t) * 6.0;
        return p;
    }

    vec3 hsl2rgb(float h, float s, float l) {

        float r, g, b;
        if (s == 0.0) {
            r = g = b = l; // achromatic
        } else {
            float q = l < 0.5 ? l * (1.0 + s) : l + s - l * s;
            float p = 2.0 * l - q;
            r = hue2rgb(p, q, h + 1.0 / 3.0);
            g = hue2rgb(p, q, h);
            b = hue2rgb(p, q, h - 1.0 / 3.0);
        }

        return vec3(r, g, b);
    }

    vec3 hsx2rgb(float hue, float sat, float targetLuminance) {
        
        const float epsilon = 0.001;
        float low = 0.0;
        float high = 1.0;
        float mid;

        for(int i = 0; i < 16; i++) { // Limiting the number of iterations for performance
            mid = (low + high) * 0.5;
            vec3 rgb = hsl2rgb(hue, sat, mid);
            float currentLum = lum(rgb.r, rgb.g, rgb.b);

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

    float hash12(vec2 p)
    {
        vec3 p3  = fract(vec3(p.xyx) * .1031);
        p3 += dot(p3, p3.yzx + 33.33);
        return fract((p3.x + p3.y) * p3.z);
    }


    float noise3 (vec2 _st,float t) {
        vec2 i = floor(_st+t);
        vec2 f = fract(_st+t);

        // Four corners2D of a tile
        float a = hash12(i);
        float b = hash12(i + vec2(1.0, 0.0));
        float c = hash12(i + vec2(0.0, 1.0));
        float d = hash12(i + vec2(1.0, 1.0));

        vec2 u = f * f * (3.0 - 2.0 * f);

        return mix(a, b, u.x) +
                (c - a)* u.y * (1.0 - u.x) +
                (d - b) * u.x * u.y;
    }

    float power(float p, float g) {
        if (p < 0.5)
            return 0.5 * pow(2.*p, g);
        else
            return 1. - 0.5 * pow(2.*(1. - p), g);
    }
    float fbm3 (vec2 _st, float t) {
        float v = 0.0;
        float a = 0.5;
        vec2 shift = vec2(100.0);
        // Rotate to reduce axial bias
        mat2 rot = mat2(cos(0.5), sin(0.5),
                        -sin(0.5), cos(0.50));
        for (int i = 0; i < NUM_OCTAVES; ++i) {
            v += a * noise3(_st, t);
            _st = rot * _st * 2.0 + shift;
            a *= 0.5;
        }
        return v;
    }



    void main(void) {
        float dist = distance(vUV.xy, vec2(0.5, 0.5));
        float alpha = 1.0 - smoothstep(0.48, 0.5, dist);

        float ff = fbm3(vUV.xy*10., uTime*.01);
        alpha *= smoothstep(0.5, 0.5+.2, ff);

        float rr = uBrushJitter*0.4*(-1.+2.*fbm3(vUV.xy*10.+31.31, uTime*.01*0.+213.13));

        vec3 brushRgb = hsx2rgb(fract(uBrushColor.r+1.0+rr), uBrushColor.g, uBrushColor.b);

        // gl_FragColor = vec4(brushRgb.rgb*alpha, alpha); // using alpha
        gl_FragColor = vec4(brushRgb.rgb*alpha, alpha); // using alpha
    }
`;


// Shader sources (You can use separate shaders for the color picker)
export const pickerVertexShader = `
    attribute vec2 aVertexPosition;
    void main(void) {
        gl_Position = vec4(aVertexPosition, 0.0, 1.0);
    }
`;

export const pickerFragmentShader = `
    precision mediump float;
    uniform vec3 uHueSatVal;
    
    float lum(float r, float g, float b) {
        return sqrt(0.299*r*r + 0.587*g*g + 0.114*b*b);
        // return sqrt(0.2126*r + 0.7152*g + 0.0722*b);
    }


    float hue2rgb(float p, float q, float t) {
        if (t < 0.0) t += 1.0;
        if (t > 1.0) t -= 1.0;
        if (t < 1.0 / 6.0) return p + (q - p) * 6.0 * t;
        if (t < 0.5) return q;
        if (t < 2.0 / 3.0) return p + (q - p) * (2.0 / 3.0 - t) * 6.0;
        return p;
    }

    vec3 hsl2rgb(float h, float s, float l) {

        float r, g, b;
        if (s == 0.0) {
            r = g = b = l; // achromatic
        } else {
            float q = l < 0.5 ? l * (1.0 + s) : l + s - l * s;
            float p = 2.0 * l - q;
            r = hue2rgb(p, q, h + 1.0 / 3.0);
            g = hue2rgb(p, q, h);
            b = hue2rgb(p, q, h - 1.0 / 3.0);
        }

        return vec3(r, g, b);
    }

    vec3 hsx2rgb(float hue, float sat, float targetLuminance) {
        
        const float epsilon = 0.001;
        float low = 0.0;
        float high = 1.0;
        float mid;

        for(int i = 0; i < 16; i++) { // Limiting the number of iterations for performance
            mid = (low + high) * 0.5;
            vec3 rgb = hsl2rgb(hue, sat, mid);
            float currentLum = lum(rgb.r, rgb.g, rgb.b);

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

    float degreesToRadians(float degrees) {
        return (degrees * 3.141592653589793) / 180.0;
    }
    
    float labF(float t) {
        return t > (6.0 / 29.0) * (6.0 / 29.0) * (6.0 / 29.0) ? pow(t, 0.33333) : t / (3.0 * (6.0 / 29.0) * (6.0 / 29.0)) + 4.0 / 29.0;
    }
    
    float labInverseF(float t) {
        return t > 6.0 / 29.0 ? t * t * t : 3.0 * (6.0 / 29.0) * (6.0 / 29.0) * (t - 4.0 / 29.0);
    }
    
    // Conversion: LCH to CIELAB
    vec3 lchToLab(float l, float c, float h) {
        l *= 100.0; // Scale from [0,1] to [0,100]
        c *= 128.0; // Scale from [0,1] to [0,128]
        h *= 360.0; // Scale from [0,1] to [0,360]
        
        float a = c * cos(degreesToRadians(h));
        float b = c * sin(degreesToRadians(h));
        return vec3(l, a, b);
    }
    
    // Conversion: CIELAB to XYZ
    vec3 labToXYZ(vec3 lab) {
        vec3 D65 = vec3(0.95047, 1.00000, 1.08883); // D65 illuminant
        float y = (lab.x + 16.0) / 116.0;
        float x = y + lab.y / 500.0;
        float z = y - lab.z / 200.0;
        return vec3(
            D65.x * labInverseF(x),
            D65.y * labInverseF(y),
            D65.z * labInverseF(z)
        );
    }
    
    // Conversion: XYZ to RGB
    vec3 xyzToRgb(vec3 xyz) {
        float r = xyz.x *  3.2404542 + xyz.y * -1.5371385 + xyz.z * -0.4985314;
        float g = xyz.x * -0.9692660 + xyz.y *  1.8760108 + xyz.z *  0.0415560;
        float b = xyz.x *  0.0556434 + xyz.y * -0.2040259 + xyz.z *  1.0572252;
        return vec3(
            clamp(r, 0.0, 1.0),
            clamp(g, 0.0, 1.0),
            clamp(b, 0.0, 1.0)
        );
    }
    
    // Wrapper function to convert LCH to RGB
    vec3 lchToRgb(float l, float c, float h) {
        vec3 lab = lchToLab(h, c, l);
        vec3 xyz = labToXYZ(lab);
        return xyzToRgb(xyz);
    }

    vec3 srgb_transfer_function(vec3 a) {
        return vec3(
            a.r <= 0.0031308 ? 12.92 * a.r : 1.055 * pow(a.r, 1.0 / 2.4) - 0.055,
            a.g <= 0.0031308 ? 12.92 * a.g : 1.055 * pow(a.g, 1.0 / 2.4) - 0.055,
            a.b <= 0.0031308 ? 12.92 * a.b : 1.055 * pow(a.b, 1.0 / 2.4) - 0.055
        );
    }
    
    vec3 srgb_transfer_function_inv(vec3 a) {
        return vec3(
            a.r > 0.04045 ? pow((a.r + 0.055) / 1.055, 2.4) : a.r / 12.92,
            a.g > 0.04045 ? pow((a.g + 0.055) / 1.055, 2.4) : a.g / 12.92,
            a.b > 0.04045 ? pow((a.b + 0.055) / 1.055, 2.4) : a.b / 12.92
        );
    }
    
    vec3 linear_srgb_to_oklab(vec3 rgb) {
        float l = 0.4122214708 * rgb.r + 0.5363325363 * rgb.g + 0.0514459929 * rgb.b;
        float m = 0.2119034982 * rgb.r + 0.6806995451 * rgb.g + 0.1073969566 * rgb.b;
        float s = 0.0883024619 * rgb.r + 0.2817188376 * rgb.g + 0.6299787005 * rgb.b;
    
        float l_ = pow(l, 1.0 / 3.0);
        float m_ = pow(m, 1.0 / 3.0);
        float s_ = pow(s, 1.0 / 3.0);
    
        return vec3(
            0.2104542553 * l_ + 0.793617785 * m_ - 0.0040720468 * s_,
            1.9779984951 * l_ - 2.428592205 * m_ + 0.4505937099 * s_,
            0.0259040371 * l_ + 0.7827717662 * m_ - 0.808675766 * s_
        );
    }
    
    vec3 oklab_to_linear_srgb(vec3 lab) {
        float l_ = lab.r + 0.3963377774 * lab.g + 0.2158037573 * lab.b;
        float m_ = lab.r - 0.1055613458 * lab.g - 0.0638541728 * lab.b;
        float s_ = lab.r - 0.0894841775 * lab.g - 1.291485548 * lab.b;
    
        float l = l_ * l_ * l_;
        float m = m_ * m_ * m_;
        float s = s_ * s_ * s_;
    
        return vec3(
            4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
            -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
            -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s
        );
    }

    vec3 okhsl_to_oklab(float H, float S, float L) {
        float a = S * cos(H * 3.141592653589793 / 180.0); // Convert degrees to radians
        float b = S * sin(H * 3.141592653589793 / 180.0);
        return vec3(L, a, b);
    }

    vec3 okhsl_to_linear_srgb(float H, float S, float L) {
        vec3 oklab = okhsl_to_oklab(H, S, L);
        return oklab_to_linear_srgb(vec3(oklab.x, oklab.y, oklab.z));
    }

    vec3 linear_to_srgb(vec3 lin) {
        return vec3(
            srgb_transfer_function(lin)
        );
    }
    
    vec3 okhsl_to_srgb(float H, float S, float L) {
        vec3 linear = okhsl_to_linear_srgb(H, S, L);
        return linear_to_srgb(linear);
    }
    

    void main(void) {
        vec3 color = hsx2rgb(gl_FragCoord.x / 200.0, gl_FragCoord.y / 200.0, uHueSatVal.b);

        float dist = distance(gl_FragCoord.xy, vec2(200.0*uHueSatVal.r, 200.0*uHueSatVal.g));

        float mask1 = smoothstep(10.0, 11.0, dist);
        float mask2 = 1. - smoothstep(11.0, 12.0, dist);
        float mask = mask1 * mask2;

        float ringval = 1.0;
        if(uHueSatVal.b > 0.55)
            ringval = 0.0;
        color = mix(color, vec3(ringval), mask);

        gl_FragColor = vec4(color.rgb, 1.0);
    }
`;

// Vertex Shader
export const screenVertexQuadSource = `
    attribute vec2 aVertexPosition;
    varying vec2 vTexCoords;
    void main() {
        vTexCoords = aVertexPosition * 0.5 + 0.5; // Convert from [-1, 1] to [0, 1]
        gl_Position = vec4(aVertexPosition, 0.0, 1.0);
    }
`;

// Fragment Shader
export const screenFragmentQuadSource = `
    precision mediump float;
    varying vec2 vTexCoords;
    uniform sampler2D uTexture;
    void main() {
        gl_FragColor = texture2D(uTexture, vTexCoords);
    }
`;


export function initShaderProgram(gll, vsSource, fsSource) {
    const vertexShader = loadShader(gll, gll.VERTEX_SHADER, vsSource);
    const fragmentShader = loadShader(gll, gll.FRAGMENT_SHADER, fsSource);

    const shaderProgram = gll.createProgram();
    gll.attachShader(shaderProgram, vertexShader);
    gll.attachShader(shaderProgram, fragmentShader);
    gll.linkProgram(shaderProgram);

    return shaderProgram;
}

function loadShader(gll, type, source) {
    const shader = gll.createShader(type);
    gll.shaderSource(shader, source);
    gll.compileShader(shader);

    if (!gll.getShaderParameter(shader, gll.COMPILE_STATUS)) {
        console.error('An error occurred compiling the shaders: ' + gll.getShaderInfoLog(shader));
        gll.deleteShader(shader);
        return null;
    }

    return shader;
}

export function createQuadBuffer(gl) {
    const vertices = new Float32Array([
        -1, -1,
        1, -1,
        1, 1,
        -1, 1,
    ]);

    let quadBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);

    return quadBuffer;
}
