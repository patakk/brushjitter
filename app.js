const canvas = document.getElementById('canvas');
const glcanvas = document.getElementById('glCanvas');

canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

const gl = canvas.getContext('webgl', { preserveDrawingBuffer: true });
const gl2 = glcanvas.getContext('webgl', { preserveDrawingBuffer: true });
gl.enable(gl.BLEND);
gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

const isIpad = /iPad|Macintosh/.test(navigator.userAgent) && 'ontouchend' in document;
const isPC = !isIpad;

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

let pickedHue = 0.5;
let pickedSat = 0.5;
let pickedVal = 0.5;
let currntHue = 0.5;
let currntSat = 0.5;
let currntVal = 0.5;
let brushSize = 30.0;  // Change this to adjust the size
let brushColor = [1.0, 0.0, 0.0, 1.0];  // Red color
let mouseDown = false;

let debugelement = document.getElementById('debug');

let colorPickerBuffer;
function createColorPickerBuffer() {
    const vertices = new Float32Array([
        -1.0,  1.0,
         1.0,  1.0,
        -1.0, -1.0,
         1.0, -1.0,
    ]);

    colorPickerBuffer = gl2.createBuffer();
    gl2.bindBuffer(gl2.ARRAY_BUFFER, colorPickerBuffer);
    gl2.bufferData(gl2.ARRAY_BUFFER, vertices, gl2.STATIC_DRAW);

    gl2.uniform1f(programInfo2.uniformLocations.uValue, currntVal);

}



// Shader sources (You can use separate shaders for the color picker)
const vsSource2 = `
    attribute vec2 aVertexPosition;
    void main(void) {
        gl_Position = vec4(aVertexPosition, 0.0, 1.0);
    }
`;

const fsSource2 = `
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


const shaderProgram2 = initShaderProgram(gl2, vsSource2, fsSource2);
const programInfo2 = {
    program: shaderProgram2,
    attribLocations: {
        vertexPosition: gl2.getAttribLocation(shaderProgram2, 'aVertexPosition'),
    },
    uniformLocations: {
        uHueSatVal: gl2.getUniformLocation(shaderProgram2, 'uHueSatVal')  // Added line
    },
};

let hueSlider = document.getElementById('valueSlider');

hueSlider.addEventListener('input', (event) => {

    pickedVal = event.target.value / 100.0;
    currntHue = pickedHue;
    currntSat = pickedSat;
    currntVal = pickedVal;

    // Update WebGL shader uniform and redraw
    drawColorPicker(); // Make sure to only redraw the color picker, not the entire scene.
});

function drawColorPicker() {
    

    // Bind the color picker buffer
    gl2.useProgram(shaderProgram2);
    gl2.uniform3f(programInfo2.uniformLocations.uHueSatVal, pickedHue, pickedSat, pickedVal);
    gl2.bindBuffer(gl2.ARRAY_BUFFER, colorPickerBuffer);
    
    // Set the vertex attribute pointers for the color picker
    gl2.enableVertexAttribArray(programInfo2.attribLocations.vertexPosition);
    gl2.vertexAttribPointer(programInfo2.attribLocations.vertexPosition, 2, gl2.FLOAT, false, 0, 0);

    // Render to the canvas
    gl2.disable(gl2.BLEND);

    gl2.clearColor(1.0, 0.0, 0.0, 1.0);
    gl2.clear(gl2.COLOR_BUFFER_BIT);

    gl2.useProgram(shaderProgram2);
    gl2.drawArrays(gl2.TRIANGLE_STRIP, 0, 4);
}

// Initial draw of the color picker
createColorPickerBuffer();
drawColorPicker();


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

function lum(r, g, b) {
    return Math.sqrt(0.299 * r * r + 0.587 * g * g + 0.114 * b * b);
}

function hue2rgb(p, q, t) {
    if (t < 0.0) t += 1.0;
    if (t > 1.0) t -= 1.0;
    if (t < 1.0 / 6.0) return p + (q - p) * 6.0 * t;
    if (t < 0.5) return q;
    if (t < 2.0 / 3.0) return p + (q - p) * (2.0 / 3.0 - t) * 6.0;
    return p;
}

function hsl2rgb(h, s, l) {
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

function hsx2rgb(hue, sat, targetLuminance) {
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


function handleDrawing(event) {
    const x = event.clientX;
    const y = event.clientY;

    // Prevent default behavior to stop things like scrolling.
    event.preventDefault();
    event.preventDefault();

    if (event.pointerType === 'pen' && event.pressure === 0) {
        return;
    }

    if(!mouseDown){
        return;
    }

    drawQuad(x, y, brushSize);
}

function handleEnd(event) {
    if(event.pointerType !== 'pen' && isIpad) {
        return;
    }
    mouseDown = false;


    let rrn = .15 * (-1 + 2 * Math.random());
    currntHue = (pickedHue + rrn + 1.) % 1.;
    currntSat = pickedSat;
    currntVal = pickedVal;
}

function handleDown(event) {
    if(event.pointerType !== 'pen' && isIpad) {
        return;
    }
    const x = event.clientX;
    const y = event.clientY;

    if(event.pointerType === 'pen' && event.pressure === 0) {
        return;
    }


    if(!mouseDown){
        prevX = x;
        prevY = y;
        mouseDown = true;
        handleDrawing(event);
    }

}

if(isIpad){
    canvas.addEventListener('pointermove', handleDrawing);
    canvas.addEventListener('pointerdown', handleDown);
    canvas.addEventListener('pointerup', handleEnd);
    canvas.addEventListener('pointerout', handleEnd);
}
else{
    canvas.addEventListener('mousemove', handleDrawing);
    canvas.addEventListener('mousedown', handleDown);
    canvas.addEventListener('mouseup', handleEnd);
}



function initShaderProgram(gll, vsSource, fsSource) {
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

        let rr = 0.06 + .06*(1-currntSat);

        let randColor = hsx2rgb((currntHue + rr * (-1 + 2 * Math.random()) + 1) % 1, currntSat, currntVal);

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
    const [r, g, b] = hsx2rgb(h, s, l);
    return rgb2hsb(r, g, b);
}

function hsb2hsl(h, s, br) {
    const [r, g, b] = hsb2rgb(h, s, br);
    return rgb2hsl(r, g, b);
}


document.addEventListener('keydown', (e) => {
    if (e.key === 'c') {
        // const picker = document.getElementById('colorPicker');
        // picker.jscolor.show();
    }
});

let picker;
document.addEventListener('DOMContentLoaded', () => {
    
});

const brushSizeSlider = document.getElementById('brushSizeSlider');

brushSizeSlider.addEventListener('input', function () {
    brushSize = parseFloat(brushSizeSlider.value) / 100 * 70 + 10;  // Convert range from [1, 100] to [0.01, 1]
});

function newcolorpicked(event){
    var boundingRect = event.target.getBoundingClientRect();
    pickedHue = (event.clientX - boundingRect.left) / boundingRect.width;
    pickedSat = 1. - (event.clientY - boundingRect.top) / boundingRect.height;
    currntHue = pickedHue;
    currntSat = pickedSat;
    currntVal = pickedVal;

    drawColorPicker(); // Make sure to only redraw the color picker, not the entire scene.
}

if(isIpad){
    glcanvas.addEventListener('pointermove', newcolorpicked);
    glcanvas.addEventListener('pointerdown', newcolorpicked);
}
else{
    glcanvas.addEventListener('click', newcolorpicked);
    glcanvas.addEventListener('mousemove', newcolorpicked);
}

let initialTouchY = null;
let initialTouchY2 = null;  // for the second touch point

document.addEventListener('touchstart', function(event) {
    debugelement.innerHTML = "touchstart";
    if (event.touches.length === 2) {
        debugelement.innerHTML = "touchstart 22222";
        event.preventDefault();
        initialTouchY = event.touches[0].clientY;
        initialTouchY2 = event.touches[1].clientY;
    } else {
        initialTouchY = null;
        initialTouchY2 = null;
    }
}, { passive: false });

let dragVal = pickedVal;
canvas.addEventListener('touchmove', function(event) {
    // debugelement.innerHTML = "touchmove " + (initialTouchY !== null) + " " + (initialTouchY2 !== null);
    // if (initialTouchY !== null && initialTouchY2 !== null) {
        // Calculate the change in Y position for the average of two fingers
        debugelement.innerHTML = "touchmove 11112 ";
        let deltaY = ((event.touches[0].clientY - initialTouchY) + (event.touches[1].clientY - initialTouchY2)) / 2;

        // Use deltaY to control your dragVal. 
        // Depending on your needs, you might scale the value or use it directly.
        dragVal = dragVal + deltaY * 0.3;  // scale the value for smoother control
        pickedVal = max(0.0, min(1.0, dragVal));
        debugelement.innerHTML = "touchmove 22222 " + pickedVal + 'hh';
        initialTouchY = event.touches[0].clientY;
        initialTouchY2 = event.touches[1].clientY;
        event.preventDefault();

        drawColorPicker(); // Make sure to only redraw the color picker, not the entire scene.
        hueSlider.value = pickedVal;
    // }

}, { passive: false });


canvas.addEventListener('touchend', function(event) {
    debugelement.innerHTML = "touchend";
    initialTouchY = null;
    initialTouchY2 = null;
}, { passive: false });