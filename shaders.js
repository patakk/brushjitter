
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

        gl_Position = rotatedPos * vec4(size.xy, 1.0, 1.0) + vec4(uPosition, 0.0, 0.0);
        vUV = aVertexPosition.xy * 0.5 + 0.5;

    }
`;


export const drawingFragmentShader = `
    precision mediump float;

    uniform vec4 uBrushColor;
    uniform vec2 uResolution;

    varying vec2 vUV;

    void main(void) {
        float dist = distance(vUV.xy, vec2(0.5, 0.5));
        float alpha = 1.0 - smoothstep(0.4999, 0.5, dist);
        alpha = 1.;
        gl_FragColor = vec4(uBrushColor.rgb*alpha, alpha); // using alpha
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
        
        vec3 color = hsl2rgb(hue, sat, targetLuminance);
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
