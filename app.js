import { hsx2rgb, okhsl_to_srgb } from './hsx2rgb.js';
import { drawingVertexShader, drawingFragmentShader, pickerVertexShader, pickerFragmentShader, screenVertexQuadSource, screenFragmentQuadSource } from './shaders.js';
import { initShaderProgram, createQuadBuffer } from './shaders.js';

let canvas, glcanvas;
let gl, gl_picker;
let isIpad, isPC;

let pickerProgram;
let pickerProgramInfo;
let drawingProgram;
let drawingProgramInfo;
let screenQuadProgram;
let screenQuadProgramInfo;
let screenQuadBuffer;

let colorPickerBuffer;
let vertexBuffer;
let debugelement;

let valSlider;
let brushSizeSlider;
let jitterSlider;
let pickedHue = Math.random();
let pickedSat = 0.5;
let pickedVal = 0.5;
let currntHue = pickedHue;
let currntSat = pickedSat;
let currntVal = pickedVal;
let brushSize = 30.0;  // Change this to adjust the size
let brushJitter = 0.5;
let secondColor = [.5, .5, .5, 1.];
let mouseDown = false;
let dissipation = 0.0;

let ctrlPressed = false;


let dragVal = pickedVal;
let initialTouchY = 0.0;
let initialTouchY2 = 0.0;  // for the second touch point
let prevX = 0;
let prevY = 0;
let detail = 2;

canvas = document.getElementById('mainCanvas');
glcanvas = document.getElementById('pickerCanvas');

canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

gl = canvas.getContext('webgl', { preserveDrawingBuffer: true, antialias: true });
gl_picker = glcanvas.getContext('webgl', { preserveDrawingBuffer: true, antialias: true });

isIpad = /iPad|Macintosh/.test(navigator.userAgent) && 'ontouchend' in document;
isPC = !isIpad;

gl.clearColor(.33, .33, .33, 1.0);
gl.clear(gl.COLOR_BUFFER_BIT);

colorPickerBuffer = createQuadBuffer(gl_picker);
vertexBuffer = createQuadBuffer(gl);

valSlider = document.getElementById('valueSlider');
debugelement = document.getElementById('debug');

brushSizeSlider = document.getElementById('brushSizeSlider');
jitterSlider = document.getElementById('jitterSlider');
jitterSlider.value = brushJitter * 100;
brushSizeSlider.value = (brushSize - 10) / 70 * 100;

pickerProgram = initShaderProgram(gl_picker, pickerVertexShader, pickerFragmentShader);
pickerProgramInfo = {
    program: pickerProgram,
    attribLocations: {
        vertexPosition: gl_picker.getAttribLocation(pickerProgram, 'aVertexPosition'),
    },
    uniformLocations: {
        uHueSatVal: gl_picker.getUniformLocation(pickerProgram, 'uHueSatVal')  // Added line
    },
};


drawingProgram = initShaderProgram(gl, drawingVertexShader, drawingFragmentShader);
drawingProgramInfo = {
    program: drawingProgram,
    attribLocations: {
        vertexPosition: gl.getAttribLocation(drawingProgram, 'aVertexPosition'),
    },
    uniformLocations: {
        brushColor: gl.getUniformLocation(drawingProgram, 'uBrushColor'),
        secondColor: gl.getUniformLocation(drawingProgram, 'uSecondColor'),
        isBump: gl.getUniformLocation(drawingProgram, 'uIsBump'),
        time: gl.getUniformLocation(drawingProgram, 'uTime'),
        position: gl.getUniformLocation(drawingProgram, 'uPosition'),
        size: gl.getUniformLocation(drawingProgram, 'uSize'),
        brushJitter: gl.getUniformLocation(drawingProgram, 'uBrushJitter'),
        dissipation: gl.getUniformLocation(drawingProgram, 'uDissipation'),
        angle: gl.getUniformLocation(drawingProgram, 'uAngle'),
        resolution: gl.getUniformLocation(drawingProgram, 'uResolution')  // Added line
    },
};

screenQuadProgram = initShaderProgram(gl, screenVertexQuadSource, screenFragmentQuadSource);
screenQuadBuffer = createQuadBuffer(gl);

screenQuadProgramInfo = {
    program: screenQuadProgram,
    attribLocations: {
        vertexPosition: gl.getAttribLocation(screenQuadProgram, 'aVertexPosition'),
    },
    uniformLocations: {
        texture: gl.getUniformLocation(screenQuadProgram, 'uTexture'),
        bumpTexture: gl.getUniformLocation(screenQuadProgram, 'uBumpTexture'),  // Add this
        resolution: gl.getUniformLocation(screenQuadProgram, 'uResolution'),
    }
};

const framebuffer = gl.createFramebuffer();
gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);

const screentex = gl.createTexture();
gl.bindTexture(gl.TEXTURE_2D, screentex);
gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, canvas.width*2, canvas.height*2, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, screentex, 0);
gl.bindFramebuffer(gl.FRAMEBUFFER, null);


const framebuffersmall = gl.createFramebuffer();
gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffersmall);

const screentexsmall = gl.createTexture();
gl.bindTexture(gl.TEXTURE_2D, screentexsmall);
gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, canvas.width/16, canvas.height/16, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, screentexsmall, 0);
gl.bindFramebuffer(gl.FRAMEBUFFER, null);


const framebufferbump = gl.createFramebuffer();
gl.bindFramebuffer(gl.FRAMEBUFFER, framebufferbump);
const screentexbump = gl.createTexture();
gl.bindTexture(gl.TEXTURE_2D, screentexbump);
gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, canvas.width, canvas.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, screentexbump, 0);
gl.bindFramebuffer(gl.FRAMEBUFFER, null);


const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
switch (status) {
    case gl.FRAMEBUFFER_INCOMPLETE_ATTACHMENT:
        debugelement.innerHTML = "FRAMEBUFFER_INCOMPLETE_ATTACHMENT";
        break;
    case gl.FRAMEBUFFER_INCOMPLETE_DIMENSIONS:
        debugelement.innerHTML = "FRAMEBUFFER_INCOMPLETE_DIMENSIONS";
        break;
    case gl.FRAMEBUFFER_INCOMPLETE_MISSING_ATTACHMENT:
        debugelement.innerHTML = "FRAMEBUFFER_INCOMPLETE_MISSING_ATTACHMENT";
        break;
    case gl.FRAMEBUFFER_UNSUPPORTED:
        debugelement.innerHTML = "FRAMEBUFFER_UNSUPPORTED";
        break;
}


function setupEvents(){
    if(isIpad){
        canvas.addEventListener('pointermove', handleDrawing);
        canvas.addEventListener('pointerdown', handleDown);
        canvas.addEventListener('pointerup', handleEnd);
        canvas.addEventListener('pointerout', handleEnd);

        canvas.addEventListener('touchstart', function(event) {
            if (event.touches.length === 2) {
                event.preventDefault();
                initialTouchY = event.touches[0].clientY;
                initialTouchY2 = event.touches[1].clientY;
            } else {
                initialTouchY = null;
                initialTouchY2 = null;
            }
        }, { passive: false });

        canvas.addEventListener('touchmove', function(event) {
            if (initialTouchY !== null && initialTouchY2 !== null) {
                // Calculate the change in Y position for the average of two fingers
                let numtouches = event.touches.length;

                if (numtouches == 2) {
                    
                    let deltaY = ((event.touches[0].clientY - initialTouchY) + (event.touches[1].clientY - initialTouchY2)) / 2;

                    // Use deltaY to control your dragVal. 
                    // Depending on your needs, you might scale the value or use it directly.
                    dragVal = dragVal - deltaY * 0.00015;  // scale the value for smoother control
                    pickedVal = Math.max(0.0, Math.min(1.0, dragVal));
                    currntHue = pickedHue;
                    currntSat = pickedSat;
                    currntVal = pickedVal;
                    initialTouchY = event.touches[0].clientY;
                    initialTouchY2 = event.touches[1].clientY;
                    event.preventDefault();
                    
                    drawColorPicker(); // Make sure to only redraw the color picker, not the entire scene.
                    valSlider.value = pickedVal*100;
                } else {
                    initialTouchY = null;
                    initialTouchY2 = null;
                }
            }

        }, { passive: false });

        canvas.addEventListener('touchend', function(event) {
            initialTouchY = null;
            initialTouchY2 = null;
        }, { passive: false });
    }
    else{
        canvas.addEventListener('mousemove', handleDrawing);
        canvas.addEventListener('mousedown', handleDown);
        canvas.addEventListener('mouseup', handleEnd);

        // ctrl button
        document.addEventListener('keydown', function(event) {
            if (event.ctrlKey) {
                ctrlPressed = true;
        }
        });
        document.addEventListener('keyup', function(event) {
            if (!event.ctrlKey) {
                ctrlPressed = false;
            }
        });

        // scrolling affects brush size
        canvas.addEventListener('wheel', function(event) {
            event.preventDefault();

            if(ctrlPressed){
                pickedVal = Math.max(0, Math.min(pickedVal - event.deltaY * 0.000125, 1));
                dragVal = pickedVal;
                currntHue = pickedHue;
                currntSat = pickedSat;
                currntVal = pickedVal;
                valSlider.value = pickedVal*100;
                drawColorPicker();
            }
            else{
                brushSize = Math.max(10, Math.min(brushSize - event.deltaY * 0.0075, 80));
                brushSizeSlider.value = (brushSize - 10) / 70 * 100;
            }
        });


    }


    brushSizeSlider.addEventListener('input', function () {
        brushSize = parseFloat(brushSizeSlider.value) / 100 * 70 + 10;  // Convert range from [1, 100] to [0.01, 1]
    });

    
    jitterSlider.addEventListener('input', function () {
        brushJitter = parseFloat(jitterSlider.value) / 100;  // Convert range from [1, 100] to [0.01, 1]
    });

    if(isIpad){
        glcanvas.addEventListener('pointermove', newcolorpicked);
        glcanvas.addEventListener('pointerdown', newcolorpicked);
    }
    else{
        glcanvas.addEventListener('mousedown', (event) => {mouseDown = true; newcolorpicked(event);});
        glcanvas.addEventListener('mouseup', (event) => {mouseDown = false;});
        glcanvas.addEventListener('mousemove', (event) => {if(mouseDown) newcolorpicked(event);});
    }

    valSlider.addEventListener('input', (event) => {
        pickedVal = event.target.value / 100.0;
        dragVal = pickedVal;
        currntHue = pickedHue;
        currntSat = pickedSat;
        currntVal = pickedVal;
        drawColorPicker();
    });
}

document.addEventListener('DOMContentLoaded', () => {
    setupEvents();
    drawColorPicker();
});


function drawColorPicker() {
    
    // Bind the color picker buffer
    gl_picker.useProgram(pickerProgram);
    gl_picker.uniform3f(pickerProgramInfo.uniformLocations.uHueSatVal, pickedHue, pickedSat, pickedVal);
    gl_picker.bindBuffer(gl_picker.ARRAY_BUFFER, colorPickerBuffer);
    
    // Set the vertex attribute pointers for the color picker
    gl_picker.enableVertexAttribArray(pickerProgramInfo.attribLocations.vertexPosition);
    gl_picker.vertexAttribPointer(pickerProgramInfo.attribLocations.vertexPosition, 2, gl_picker.FLOAT, false, 0, 0);

    // Render to the canvas
    gl_picker.disable(gl_picker.BLEND);

    gl_picker.clearColor(1.0, 0.0, 0.0, 1.0);
    gl_picker.clear(gl_picker.COLOR_BUFFER_BIT);

    gl_picker.useProgram(pickerProgram);
    gl_picker.bindFramebuffer(gl.FRAMEBUFFER, null);

    gl_picker.drawArrays(gl_picker.TRIANGLE_FAN, 0, 4);
}

let angle = 0;
let prevXa = 0;
let prevYa = 0;

let sx = null;
let sy = null;
let ssx = null;
let ssy = null;

function handleDrawing(event) {

    if(ssx == null && ssy == null){
        ssx = event.clientX;
        ssy = event.clientY;
    }
    else{
        ssx = ssx + .7*(event.clientX - ssx);
        ssy = ssy + .7*(event.clientY - ssy);
    }

    // Prevent default behavior to stop things like scrolling.
    event.preventDefault();
    event.preventDefault();

    // if(quadCount % 1 == 0){
    //     let vector = [x - prevXa, y - prevYa];
    //     let dist = Math.sqrt((x - prevXa) * (x - prevXa) + (y - prevYa) * (y - prevYa));
    //     let normalized = [vector[0] / dist, vector[1] / dist];
    //     let xx = prevXa + normalized[0] * dist*brushSize*2;
    //     let yy = prevYa + normalized[1] * dist*brushSize*2;
    //     let colo = getColorFromFramebuffer(gl, framebuffersmall, xx/16, canvas.height/16-yy/16);
    //     if(colo.a> 222){
    //         secondColor = [colo.r/255, colo.g/255, colo.b/255, colo.a/255];
    //         dissipation = Math.min(1., dissipation+.021);
    //     }
    // }

    // debugelement.innerHTML = "x: " + x + " y: " + y + " pointerType: " + event.pointerType + " pressure: " + event.pressure;
    if (event.pointerType === 'pen' && event.pressure === 0) {
        return;
    }

    if(!mouseDown){
        return;
    }

        
    let dist = Math.sqrt((ssx - prevXa) * (ssx - prevXa) + (ssy - prevYa) * (ssy - prevYa));
    let vector = [ssx - prevXa, ssy - prevYa];
    let normalized = [vector[0] / dist, vector[1] / dist];
    if(dist > 5){
        angle = angle + 0.991*(Math.atan2(normalized[1], normalized[0])-angle);
        if(angle == 0){
            console.log(dist)
        }
    }

    drawQuad(ssx, ssy, brushSize, angle);
}

function handleEnd(event) {
    if(event.pointerType !== 'pen' && isIpad) {
        return;
    }
    mouseDown = false;

    let rrn = (.025 + .025*(1-currntSat)*(1-currntVal)) * (-1 + 2 * Math.random());
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

    let colo = getColorFromFramebuffer(gl, framebuffersmall, x/16, canvas.height/16-y/16);
    if(colo.a > 222){
        secondColor = [colo.r/255, colo.g/255, colo.b/255, colo.a/255];
        dissipation = 1.;
    }

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

let quadCount = 0;


function renderFramebufferToScreen(gl, framebufferTexture, bumpFramebufferTexture) {
    gl.useProgram(screenQuadProgramInfo.program);

    // Set the framebuffer's texture
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, framebufferTexture);
    gl.uniform1i(screenQuadProgramInfo.uniformLocations.texture, 0);

    // Set the bump framebuffer's texture
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, bumpFramebufferTexture);
    gl.uniform1i(screenQuadProgramInfo.uniformLocations.bumpTexture, 1);  // assuming your shader expects this as 'bumpTexture'

    gl.uniform2f(screenQuadProgramInfo.uniformLocations.resolution, canvas.width, canvas.height);

    // Bind and draw the full-screen quad
    gl.bindBuffer(gl.ARRAY_BUFFER, screenQuadBuffer);
    gl.vertexAttribPointer(screenQuadProgramInfo.attribLocations.vertexPosition, 2, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(screenQuadProgramInfo.attribLocations.vertexPosition);

    gl.drawArrays(gl.TRIANGLE_FAN, 0, 4);
}

function getColorFromFramebuffer(gl, framebuffer, x, y) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);

    let pixels = new Uint8Array(4);
    gl.readPixels(x, y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixels);

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    return {
        r: pixels[0],
        g: pixels[1],
        b: pixels[2],
        a: pixels[3]
    };
}

function drawQuad(x, y, size, angle=0) {
    let dist = Math.sqrt((x - prevX) * (x - prevX) + (y - prevY) * (y - prevY));
    let parts = 2 + Math.floor(dist / detail);

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
    gl.viewport(0, 0, canvas.width*2, canvas.height*2);
    //gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    for(let kk = 0; kk < 3; kk++){
        if(kk == 0){
            gl.enable(gl.BLEND);
            gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
            gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
            gl.viewport(0, 0, canvas.width*2, canvas.height*2);
        }
        else if(kk == 1){
            gl.enable(gl.BLEND);
            gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
            gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffersmall);
            gl.viewport(0, 0, canvas.width/16, canvas.height/16);
        }
        else if(kk == 2){
            gl.enable(gl.BLEND);
            gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
            gl.bindFramebuffer(gl.FRAMEBUFFER, framebufferbump);
            gl.viewport(0, 0, canvas.width, canvas.height);
        }
        for(let k = 0; k < parts; k++) {

            let rr = 0.026 + .046*(1-currntSat)*(1-currntVal);
    
            let randColor = hsx2rgb((currntHue + rr * (-1 + 2 * Math.random()) + 1) % 1, currntSat, currntVal);
    
            let xx = prevX + (x - prevX) * k / parts;
            let yy = prevY + (y - prevY) * k / parts;
            xx = (xx / canvas.width) * 2 - 1;
            yy = -(yy / canvas.height) * 2 + 1;
    
            gl.useProgram(drawingProgramInfo.program);
            // Set uniforms
            gl.uniform2f(drawingProgramInfo.uniformLocations.position, xx, yy);
            gl.uniform1f(drawingProgramInfo.uniformLocations.size, size);
            gl.uniform1f(drawingProgramInfo.uniformLocations.angle, angle);
            gl.uniform1f(drawingProgramInfo.uniformLocations.brushJitter, brushJitter);
            gl.uniform1f(drawingProgramInfo.uniformLocations.dissipation, dissipation);
            // gl.uniform4fv(drawingProgramInfo.uniformLocations.brushColor, [randColor[0], randColor[1], randColor[2], 1.0]);
            gl.uniform4fv(drawingProgramInfo.uniformLocations.brushColor, [(currntHue + 0*rr * (-1 + 2 * Math.random()) + 1) % 1, currntSat, currntVal, 1.0]);
            gl.uniform4fv(drawingProgramInfo.uniformLocations.secondColor, secondColor);
            gl.uniform1f(drawingProgramInfo.uniformLocations.time, quadCount);
            gl.uniform1f(drawingProgramInfo.uniformLocations.isBump, kk==2?1:0);
            gl.uniform2f(drawingProgramInfo.uniformLocations.resolution, canvas.width, canvas.height);

            dissipation = Math.max(0.0, dissipation - 0.001);

            if(kk == 0){
                quadCount++;
            }
    
    
            // Bind vertex buffer
            gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
            gl.vertexAttribPointer(drawingProgramInfo.attribLocations.vertexPosition, 2, gl.FLOAT, false, 0, 0);
            gl.enableVertexAttribArray(drawingProgramInfo.attribLocations.vertexPosition);
    
            
            gl.drawArrays(gl.TRIANGLE_FAN, 0, 4);
        }
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, canvas.width, canvas.height);

    gl.clearColor(.33, .33, .33, 1.0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    // gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    renderFramebufferToScreen(gl, screentex, screentexbump);

    // Draw framebuffer's texture to screen

    prevX = x;
    prevY = y;

    if(Math.sqrt((x - prevXa) * (x - prevXa) + (y - prevYa) * (y - prevYa)) > 6){
        prevXa = x;
        prevYa = y;
    }
}


function newcolorpicked(event){
    var boundingRect = event.target.getBoundingClientRect();
    pickedHue = (event.clientX - boundingRect.left) / boundingRect.width;
    pickedSat = 1. - (event.clientY - boundingRect.top) / boundingRect.height;
    currntHue = pickedHue;
    currntSat = pickedSat;
    currntVal = pickedVal;

    drawColorPicker(); // Make sure to only redraw the color picker, not the entire scene.
}
