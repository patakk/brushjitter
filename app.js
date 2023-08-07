const canvas = document.getElementById('canvas');
canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

const gl = canvas.getContext('webgl', { preserveDrawingBuffer: true });
gl.enable(gl.BLEND);
gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
// gl.clearColor(1.0, 1.0, 1.0, 1.0);
// gl.clear(gl.COLOR_BUFFER_BIT);

// Vertex shader program
const vsSource = `
    attribute vec4 aVertexPosition;
    uniform vec2 uPosition;    // The brush center position in GL coordinates
    uniform float uSize;       // Half the size of the brush quad
    uniform vec2 uResolution;

    varying vec2 vUV;

    void main(void) {
        vec2 size = vec2(uSize) / uResolution;
        gl_Position = aVertexPosition * vec4(size.xy, 1.0, 1.0) + vec4(uPosition, 0.0, 0.0);
        vUV = aVertexPosition.xy * 0.5 + 0.5;

    }
`;


// Fragment shader program (solid color)
const fsSource = `
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

const shaderProgram = initShaderProgram(gl, vsSource, fsSource);
const programInfo = {
    program: shaderProgram,
    attribLocations: {
        vertexPosition: gl.getAttribLocation(shaderProgram, 'aVertexPosition'),
    },
    uniformLocations: {
        brushColor: gl.getUniformLocation(shaderProgram, 'uBrushColor'),
        position: gl.getUniformLocation(shaderProgram, 'uPosition'),
        size: gl.getUniformLocation(shaderProgram, 'uSize'),
        resolution: gl.getUniformLocation(shaderProgram, 'uResolution')  // Added line
    },
};

function hsl2rgb(h, s, l) {
    function hue2rgb(p, q, t) {
        if (t < 0) t += 1;
        if (t > 1) t -= 1;
        if (t < 1 / 6) return p + (q - p) * 6 * t;
        if (t < 1 / 2) return q;
        if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
        return p;
    }

    let r, g, b;

    if (s === 0) {
        r = g = b = l; // achromatic
    } else {
        const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
        const p = 2 * l - q;
        r = hue2rgb(p, q, h + 1 / 3);
        g = hue2rgb(p, q, h);
        b = hue2rgb(p, q, h - 1 / 3);
    }

    return [r, g, b];
}

function rgb2hsl(r, g, b) {
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    let h, s, l = (max + min) / 2;
    // l = calculateLuminance(r, g, b);

    if (max === min) {
        h = s = 0; // achromatic
    } else {
        const delta = max - min;
        s = l > 0.5 ? delta / (2 - max - min) : delta / (max + min);

        switch (max) {
            case r:
                h = (g - b) / delta + (g < b ? 6 : 0);
                break;
            case g:
                h = (b - r) / delta + 2;
                break;
            case b:
                h = (r - g) / delta + 4;
                break;
        }

        h /= 6;
    }

    return [h, s, l];
}

function rgb2hsb(r, g, b) {
    let max = Math.max(r, g, b);
    let min = Math.min(r, g, b);
    let h, s, v = max;
    let diff = max - min;

    s = max === 0 ? 0 : diff / max;

    if (max === min) {
        h = 0; // achromatic
    } else {
        switch (max) {
            case r: h = (g - b) / diff + (g < b ? 6 : 0); break;
            case g: h = (b - r) / diff + 2; break;
            case b: h = (r - g) / diff + 4; break;
        }
        h /= 6;
    }

    return [h, s, v];
}

function hsb2rgb(h, s, v) {
    let r, g, b;

    let i = Math.floor(h * 6);
    let f = h * 6 - i;
    let p = v * (1 - s);
    let q = v * (1 - f * s);
    let t = v * (1 - (1 - f) * s);

    switch (i % 6) {
        case 0: r = v, g = t, b = p; break;
        case 1: r = q, g = v, b = p; break;
        case 2: r = p, g = v, b = t; break;
        case 3: r = p, g = q, b = v; break;
        case 4: r = t, g = p, b = v; break;
        case 5: r = v, g = p, b = q; break;
    }

    return [r, g, b];
}



function calculateLuminance(r, g, b) {
    return Math.sqrt(0.299 * r * r + 0.587 * g * g + 0.114 * b * b)
}


let brushSize = 30.0;  // Change this to adjust the size
let brushColor = [1.0, 0.0, 0.0, 1.0];  // Red color
let mouseDown = false;
let baseHue0 = Math.random();
let baseSat = Math.random();
let baseBri = Math.random();
let baseHue = baseHue0;
let baseColorHSL = [baseHue, baseSat, baseBri];
// baseColorHSL = [.6, baseSat, baseBri];
let baseColor = hsl2rgb(baseColorHSL[0], baseColorHSL[1], baseColorHSL[2]);
let lightnessBase0 = calculateLuminance(baseColor[0], baseColor[1], baseColor[2]);


// canvas.addEventListener('mousemove', (event) => {
//     if (event.buttons == 1) {

//         drawQuad(event.clientX, event.clientY, brushSize);
//         // drawQuad(event.clientX, event.clientY, brushSize, [lightnessRand, lightnessRand, lightnessRand, 1.0]);
//         mouseDown = true;
//     }
// });
// canvas.addEventListener('mouseup', (event) => {

//     baseHue = (baseHue0 + .1 * (-1 + 2 * Math.random()) + 1.) % 1.;
//     baseColorHSL = [baseHue, baseSat, baseBri];
//     baseColor = hsl2rgb(baseColorHSL[0], baseColorHSL[1], baseColorHSL[2]);

//     for (let k = 0; k < 4; k++) {
//         let lightnessRand = calculateLuminance(baseColor[0], baseColor[1], baseColor[2]);
//         let scale = lightnessBase0 / lightnessRand;
//         baseColor = baseColor.map(x => x * scale);
//         baseColor = baseColor.map(x => Math.min(x, 1.0));
//     }

//     baseColorHSL = rgb2hsl(baseColor[0], baseColor[1], baseColor[2]);

//     mouseDown = false;

//     picker.jscolor.show();
// });

function handleDrawing(event) {

    if(event.pressure < 0.05){
        handleEnd(event);
    }

    // Prevent default behavior to stop things like scrolling.
    event.preventDefault();

    const x = event.clientX;
    const y = event.clientY;

    event.preventDefault();
    picker.jscolor.show();


    // Ensure we're dealing with pen input (Apple Pencil or other stylus devices).
    drawQuad(x, y, brushSize);
}

function handleEnd(event) {
    baseHue = (baseHue0 + .1 * (-1 + 2 * Math.random()) + 1.) % 1.;
    baseColorHSL = [baseHue, baseSat, baseBri];
    baseColor = hsl2rgb(baseColorHSL[0], baseColorHSL[1], baseColorHSL[2]);

    for (let k = 0; k < 4; k++) {
        let lightnessRand = calculateLuminance(baseColor[0], baseColor[1], baseColor[2]);
        let scale = lightnessBase0 / lightnessRand;
        baseColor = baseColor.map(x => x * scale);
        baseColor = baseColor.map(x => Math.min(x, 1.0));
    }

    baseColorHSL = rgb2hsl(baseColor[0], baseColor[1], baseColor[2]);

    mouseDown = false;
    picker.jscolor.show();
}

canvas.addEventListener('pointermove', handleDrawing);
// canvas.addEventListener('pointerup', handleEnd);



function initShaderProgram(gl, vsSource, fsSource) {
    const vertexShader = loadShader(gl, gl.VERTEX_SHADER, vsSource);
    const fragmentShader = loadShader(gl, gl.FRAGMENT_SHADER, fsSource);

    const shaderProgram = gl.createProgram();
    gl.attachShader(shaderProgram, vertexShader);
    gl.attachShader(shaderProgram, fragmentShader);
    gl.linkProgram(shaderProgram);

    return shaderProgram;
}

function loadShader(gl, type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    return shader;
}

const quadVertices = new Float32Array([
    -1, -1,
    1, -1,
    1, 1,
    -1, 1,
]);
const vertexBuffer = gl.createBuffer();
gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
gl.bufferData(gl.ARRAY_BUFFER, quadVertices, gl.STATIC_DRAW);

let prevX = 0;
let prevY = 0;
const detail = 24;

function drawQuad(x, y, size) {
    const glX = (x / canvas.width) * 2 - 1;
    const glY = -(y / canvas.height) * 2 + 1;


    let dist = Math.sqrt((glX - prevX) * (glX - prevX) + (glY - prevY) * (glY - prevY));
    let parts = Math.floor(dist / detail);

    for(let k = 0; k < parts; k++) {

        let rr = 0.06 + .06*(1-baseSat);
        let randColorHSL = [(baseColorHSL[0] + rr * (-1 + 2 * Math.random()) + 1) % 1, baseColorHSL[1], baseColorHSL[2]];

        let randColor = hsl2rgb(randColorHSL[0], randColorHSL[1], randColorHSL[2]);
        let baseColor = hsl2rgb(baseColorHSL[0], baseColorHSL[1], baseColorHSL[2]);
        let lightnessBase = calculateLuminance(baseColor[0], baseColor[1], baseColor[2]);

        for (let k = 0; k < 4; k++) {
            let lightnessRand = calculateLuminance(randColor[0], randColor[1], randColor[2]);
            let scale = lightnessBase / lightnessRand;
            randColor = randColor.map(x => x * scale);
            randColor = randColor.map(x => Math.min(x, 1.0));
        }



        let xx = prevX + (x - prevX) * k / parts;
        let yy = prevY + (y - prevY) * k / parts;
        xx = (xx / canvas.width) * 2 - 1;
        yy = -(yy / canvas.height) * 2 + 1;

        // Set uniforms
        gl.uniform2f(programInfo.uniformLocations.position, xx, yy);
        gl.uniform1f(programInfo.uniformLocations.size, size);
        gl.uniform4fv(programInfo.uniformLocations.brushColor, [randColor[0], randColor[1], randColor[2], 1.0]);
        gl.uniform2f(programInfo.uniformLocations.resolution, canvas.width, canvas.height);


        // Bind vertex buffer
        gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
        gl.vertexAttribPointer(programInfo.attribLocations.vertexPosition, 2, gl.FLOAT, false, 0, 0);
        gl.enableVertexAttribArray(programInfo.attribLocations.vertexPosition);

        gl.useProgram(programInfo.program);
        gl.drawArrays(gl.TRIANGLE_FAN, 0, 4);
    }

    prevX = x;
    prevY = y;
}
function hsl2hsb(h, s, l) {
    const [r, g, b] = hsl2rgb(h, s, l);
    return rgb2hsb(r, g, b);
}

function hsb2hsl(h, s, br) {
    const [r, g, b] = hsb2rgb(h, s, br);
    return rgb2hsl(r, g, b);
}


function updateColor(jscolor) {

    baseHue0 = jscolor.channels.h / 360;
    baseSat = jscolor.channels.s / 100;
    baseBri = jscolor.channels.v / 100;
    afajsl = hsb2hsl(baseHue0, baseSat, baseBri);
    baseHue0 = afajsl[0];
    baseSat = afajsl[1];
    baseBri = afajsl[2];
    baseHue = baseHue0;
    baseColorHSL = [baseHue, baseSat, baseBri];
    // baseColorHSL = [.6, baseSat, baseBri];
    baseColor = hsl2rgb(baseColorHSL[0], baseColorHSL[1], baseColorHSL[2]);
    lightnessBase0 = calculateLuminance(baseColor[0], baseColor[1], baseColor[2]);
}

document.addEventListener('keydown', (e) => {
    if (e.key === 'c') {
        // const picker = document.getElementById('colorPicker');
        // picker.jscolor.show();
    }
});

let picker;
document.addEventListener('DOMContentLoaded', () => {
    picker = document.getElementById('colorPicker');
});

const brushSizeSlider = document.getElementById('brushSizeSlider');

brushSizeSlider.addEventListener('input', function () {
    brushSize = parseFloat(brushSizeSlider.value) / 100 * 70 + 10;  // Convert range from [1, 100] to [0.01, 1]
    // You may adjust the formula above based on your requirements
});
