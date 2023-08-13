import { hsx2rgb } from './hsx2rgb.js';
import { drawingVertexShader, drawingFragmentShader, pickerVertexShader, pickerFragmentShader } from './shaders.js';
import { initShaderProgram, createQuadBuffer } from './shaders.js';

let canvas, glcanvas;
let gl, gl_picker;
let isIpad, isPC;

let pickerProgram;
let pickerProgramInfo;
let drawingProgram;
let drawingProgramInfo;

let colorPickerBuffer;
let vertexBuffer;
let debugelement;

let valSlider;
let brushSizeSlider;
let pickedHue = 0.5;
let pickedSat = 0.5;
let pickedVal = 0.5;
let currntHue = 0.5;
let currntSat = 0.5;
let currntVal = 0.5;
let brushSize = 30.0;  // Change this to adjust the size
let mouseDown = false;

let ctrlPressed = false;


let dragVal = pickedVal;
let initialTouchY = 0.0;
let initialTouchY2 = 0.0;  // for the second touch point
let prevX = 0;
let prevY = 0;
let detail = 3;

canvas = document.getElementById('mainCanvas');
glcanvas = document.getElementById('pickerCanvas');

canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

gl = canvas.getContext('webgl', { preserveDrawingBuffer: true });
gl_picker = glcanvas.getContext('webgl', { preserveDrawingBuffer: true });

isIpad = /iPad|Macintosh/.test(navigator.userAgent) && 'ontouchend' in document;
isPC = !isIpad;

gl.enable(gl.BLEND);
gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

colorPickerBuffer = createQuadBuffer(gl_picker);
vertexBuffer = createQuadBuffer(gl);

valSlider = document.getElementById('valueSlider');
debugelement = document.getElementById('debug');

brushSizeSlider = document.getElementById('brushSizeSlider');
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
        position: gl.getUniformLocation(drawingProgram, 'uPosition'),
        size: gl.getUniformLocation(drawingProgram, 'uSize'),
        angle: gl.getUniformLocation(drawingProgram, 'uAngle'),
        resolution: gl.getUniformLocation(drawingProgram, 'uResolution')  // Added line
    },
};


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
                    dragVal = dragVal - deltaY * 0.0015;  // scale the value for smoother control
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
            console.log(ctrlPressed)
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
            console.log(ctrlPressed)

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
                brushSize = Math.max(10, Math.min(brushSize - event.deltaY * 0.0015, 80));
                brushSizeSlider.value = (brushSize - 10) / 70 * 100;
            }
        });


    }


    brushSizeSlider.addEventListener('input', function () {
        brushSize = parseFloat(brushSizeSlider.value) / 100 * 70 + 10;  // Convert range from [1, 100] to [0.01, 1]
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
    gl_picker.drawArrays(gl_picker.TRIANGLE_FAN, 0, 4);
}

let angle = 0;
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
        
    let dist = Math.sqrt((x - prevX) * (x - prevX) + (y - prevY) * (y - prevY));
    let vector = [x - prevX, y - prevY];
    let normalized = [vector[0] / dist, vector[1] / dist];
    if(dist > 0){
        angle = angle + 0.1*(Math.atan2(normalized[1], normalized[0])-angle);
        if(angle == 0){
            console.log(dist)
        }
    }

    drawQuad(x, y, brushSize, angle);
}

function handleEnd(event) {
    if(event.pointerType !== 'pen' && isIpad) {
        return;
    }
    mouseDown = false;


    let rrn = .025 * (-1 + 2 * Math.random());
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


function drawQuad(x, y, size, angle=0) {
    let dist = Math.sqrt((x - prevX) * (x - prevX) + (y - prevY) * (y - prevY));
    let parts = 1 + Math.floor(dist / detail);

    for(let k = 0; k < parts; k++) {

        let rr = 0.06 + .06*(1-currntSat);

        let randColor = hsx2rgb((currntHue + rr * (-1 + 2 * Math.random()) + 1) % 1, currntSat, currntVal);

        let xx = prevX + (x - prevX) * k / parts;
        let yy = prevY + (y - prevY) * k / parts;
        xx = (xx / canvas.width) * 2 - 1;
        yy = -(yy / canvas.height) * 2 + 1;

        // Set uniforms
        gl.uniform2f(drawingProgramInfo.uniformLocations.position, xx, yy);
        gl.uniform1f(drawingProgramInfo.uniformLocations.size, size);
        gl.uniform1f(drawingProgramInfo.uniformLocations.angle, angle);
        gl.uniform4fv(drawingProgramInfo.uniformLocations.brushColor, [randColor[0], randColor[1], randColor[2], 1.0]);
        gl.uniform2f(drawingProgramInfo.uniformLocations.resolution, canvas.width, canvas.height);


        // Bind vertex buffer
        gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
        gl.vertexAttribPointer(drawingProgramInfo.attribLocations.vertexPosition, 2, gl.FLOAT, false, 0, 0);
        gl.enableVertexAttribArray(drawingProgramInfo.attribLocations.vertexPosition);

        gl.useProgram(drawingProgramInfo.program);
        gl.drawArrays(gl.TRIANGLE_FAN, 0, 4);
    }

    prevX = x;
    prevY = y;
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
