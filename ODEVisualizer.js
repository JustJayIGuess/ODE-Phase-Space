Number.prototype.map = function (in_min, in_max, out_min, out_max) {
    return (this - in_min) * (out_max - out_min) / (in_max - in_min) + out_min;
}

const vectorFieldStyles = {
    NORMALIZE: 1,
    CAP: 2,
    SCALAR: 3
};

class CanvasUpdateSettings {
    constructor(doLinePass, doColor, doVectorFieldPass, doRandomizePoints, doAxesPass, _colorContinuumEnabled) {
        this.doLinePass = doLinePass;
        this.doColor = doColor;
        this.doVectorFieldPass = doVectorFieldPass;
        this.doRandomizePoints = doRandomizePoints;
        this.doAxesPass = doAxesPass;
        this.colorContinuumEnabled = false;

    }

    updateColorContinuumEnabled() {
        this.colorContinuumEnabled = document.getElementById("colorPivotEnabled").checked;
        return this;
    }
}

class Point {
    constructor(position = new Vector(0, 0), velocity = new Vector(0, 0), acceleration = new Vector(0, 0)) {
        this.position = position;
        this.velocity = velocity;
        this.acceleration = acceleration;
        this.GC = false;
    }

    update() {
        this.velocity.add(this.acceleration);
        this.position.add(this.velocity);
    }

    capVelocity(cap) {
        if (this.velocity > cap) {
            this.velocity = cap;
        }
    }

    markGC(b) {
        this.GC = b;
    }
}

class Vector {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.mag = this.calculateMag();
        this.trueMag = this.mag; // Won't be changed after normalizing
    }

    inRect(rX, rY, rWidth, rHeight) {
        if (this.x < rX || this.x > rX + rWidth || this.y < rY || this.y > rY + rHeight) {
            return false;
        }
        return true;
    }

    calculateMag() {
        return Math.sqrt(this.x * this.x + this.y * this.y);
    }

    calculateTrueMag() {
        this.trueMag = this.calculateMag();
    }

    randomize() {
        this.x = Math.random() * 2 - 1;
        this.y = Math.random() * 2 - 1;
    }

    add(vec) {
        this.x += vec.x;
        this.y += vec.y;
    }

    sub(vec) {
        this.x -= vec.x;
        this.y -= vec.y;
    }

    scale(s) {
        this.x *= s;
        this.y *= s;
    }

    normalize() {
        this.mag = this.calculateMag();
        if (this.mag == 0) {
            return new Vector(0, 0);
        }
        this.x /= this.mag;
        this.y /= this.mag;
    }

    cap(maxMag) {
        this.mag = this.calculateMag();
        if (this.mag > maxMag) {
            this.normalize();
            this.scale(maxMag);
        }
    }
    
    static cap(vec, maxMag) {
        var vecMag = vec.trueMag;
        var res = _.cloneDeep(vec);
        if (vecMag > maxMag) {
            res.normalize();
            res.scale(maxMag);
        }
        return res;
    }

    static map(tail, xDot, yDot, t) {
        var res = new Vector(0, 0);
        res.x = xDot(tail.x, tail.y, t);
        res.y = yDot(tail.x, tail.y, t);
        return res;
    }

    static add(a, b) {
        var vec = new Vector(0, 0);
        vec.x = a.x + b.x;
        vec.y = a.y + b.y;
        return vec;
    }

    static sub(a, b) {
        var vec = new Vector(0, 0);
        vec.x = a.x - b.x;
        vec.y = a.y - b.y;
        return vec;
    }

    static mult(a, b) {
        var res = new Vector(0, 0);
        res.x = a.x * b.x;
        res.y = a.y * b.y;
        return res;
    }

    static dot(a, b) {
        return a.x * b.x + a.y * b.y;
    }

    static scale(vec, n) {
        var res = new Vector(0, 0);
        res.x = vec.x * n;
        res.y = vec.y * n;
        return res;
    }

    static normalize(vec) {
        var res = new Vector(0, 0);
        var vecMag = vec.calculateMag();
        if (vecMag == 0) {
            return new Vector(0, 0);
        }
        res.x = vec.x / vecMag;
        res.y = vec.y / vecMag;
        return res;
    }
}

const VEC_RIGHT = new Vector(1, 0);
const VEC_UP = new Vector(0, 1);
const VEC_LEFT = new Vector(-1, 0);
const VEC_DOWN = new Vector(0, -1);

class VectorFieldRange {
    constructor(xNeg, xPos, yNeg, yPos) {
        this.xNeg = xNeg;
        this.xPos = xPos;
        this.yNeg = yNeg;
        this.yPos = yPos;
    }

    getScale(bounds) {
        return new Vector((this.xPos - this.xNeg) / bounds.x, (this.yPos - this.yNeg) / bounds.y);
    }

    toChartCoords(vec, bounds) {
        return new Vector(vec.x.map(0, bounds.x, this.xNeg, this.xPos), vec.y.map(0, bounds.y, this.yNeg, this.yPos));
    }

    toChartScale(vec, bounds) {
        let scale = this.getScale(bounds);
        return new Vector(vec.x * scale.x, vec.y * scale.y);
    }
}

class VectorField {
    constructor(width, height, rows, cols, canvas, xDot, yDot, chartRange, colorScale, vectorScale = 0.1, fieldStyle = vectorFieldStyles.SCALAR, vectorCap = 10) {
        this.width = width;
        this.height = height;
        this.rows = rows;
        this.cols = cols;
        this.canvas = canvas;
/** @type {CanvasRenderingContext2D} */
        this.c = canvas.getContext('2d');
        this.xDot = xDot;
        this.yDot = yDot;
        this.chart = chartRange;
        this.colorScale = colorScale;
        this.vectorScale = vectorScale;
        this.fieldStyle = fieldStyle;
        this.vectorCap = vectorCap;

        this.canvas.width = this.width;
        this.canvas.height = this.height;

        this.activePoints = [];
        this.originalPoints = [];

        this.deltaX = document.getElementById("deltaXSlider").value;
        this.colorPivot = document.getElementById("colorPivotCount").value;
        this.iterationCount = document.getElementById("iterationCount").value;

        this.margins;
        this.canvasBounds = new Vector(this.width, this.height);
        this.gridBounds = new Vector(this.cols, this.rows);
        this.canvasBoundingRect = this.canvas.getBoundingClientRect();
        this.activeDist = () => new Vector(Math.random() * w, Math.random() * h);

        this.vectorField = new Array(this.cols);
        for (let i = 0; i < this.cols; i++) {
            this.vectorField[i] = new Array(this.rows);
            this.vectorField[i].fill(new Vector(0, 0));
        }

        this.colorGrad = [
            [
                0,
                [0, 100, 255]
            ],
            [
                33,
                [255, 127, 50]
            ],
            [
                67,
                [255, 100, 100]
            ],
            [
                100,
                [255, 0, 0]
            ]
        ];

        this.calculateMargins();
        this.calculateGaps();
    }

    updatePivot(val) {
        this.colorPivot = val;
    }

    randomize() {
        for (let i = 0; i < this.cols; i++) {
            for (let j = 0; j < this.rows; j++) {
                this.vectorField[i][j].randomize();                
            }            
        }
    }

    updateFieldStyle(style) {
        this.fieldStyle = style;
    }

    calculateMargins() {
        this.margins = new Vector(this.width / (this.cols * 2), this.height / (this.rows * 2));
    }

    calculateGaps() {
        this.gapHorizontal = this.width / this.cols;
        this.gapVertical = this.height / this.rows;
    }

    calculateVectorsAtTime(t) {
        let chartMargins = this.chart.toChartScale(this.margins, this.canvasBounds);
        for (let i = 0; i < this.cols; i++) {
            for (let j = 0; j < this.rows; j++) {
                let gridPos = new Vector(i, j);
                let chartPos = Vector.add(this.chart.toChartCoords(gridPos, this.gridBounds), chartMargins);
                this.vectorField[i][j] = Vector.map(chartPos, this.xDot, this.yDot, t);
                this.vectorField[i][j].calculateTrueMag();
                switch (this.fieldStyle) {
                    case vectorFieldStyles.NORMALIZE:
                        this.vectorField[i][j].normalize();
                        this.vectorField[i][j].scale(this.vectorScale);
                        break;
                    case vectorFieldStyles.CAP:
                        this.vectorField[i][j].scale(this.vectorScale);
                        this.vectorField[i][j].cap(this.vectorCap);
                        break;
                    default:
                        this.vectorField[i][j].scale(this.vectorScale);
                        break;
                }
            }
        }
    }

    clearFrame() {
        this.c.clearRect(0, 0, this.width, this.height)
    }

    getColorFromContinuum(t) {
        var p = -Math.exp(-t / this.colorPivot) + 1;
        var w2 = p;
        var w1 = 1 - w2;
        var color1, color2;
        if (p < this.colorGrad[1][0]) {
            color1 = this.colorGrad[0][1];
            color2 = this.colorGrad[1][1];
        } else if (p >= this.colorGrad[1][0] && p < this.colorGrad[2][0]) {
            color1 = this.colorGrad[1][1];
            color2 = this.colorGrad[2][1];
        } else {
            color1 = this.colorGrad[2][1];
            color2 = this.colorGrad[3][1];
        }
        var r = Math.round(color1[0] * w1 + color2[0] * w2);
        var g = Math.round(color1[1] * w1 + color2[1] * w2);
        var b = Math.round(color1[2] * w1 + color2[2] * w2);
        return `rgb(${r}, ${g}, ${b})`;
    }
    
    initPoints(count, deltaX = this.deltaX, dist = (w, h) => new Vector(Math.random() * w, Math.random() * h)) {
        this.activePoints.length = 0;
        this.originalPoints.length = 0;
        this.deltaX = deltaX;
        this.activeDist = dist;
        for (let i = 0; i < count; i++) {
            this.activePoints.push(new Point(dist(this.width, this.height)));
            this.originalPoints.push(_.cloneDeep(this.activePoints[i]));
        }
    }

    // DEPRECATED
    updatePoints() {
        for (let i = 0; i < this.activePoints.length; i++) {
            if (!this.activePoints[i].position.inRect(0, 0, this.width, this.height)) {
                this.activePoints[i] = new Point(this.activeDist(this.width, this.height));
            }
            this.activePoints[i].velocity = Vector.normalize(this.nearestVector(this.activePoints[i].position)).scale(this.deltaX);
            this.activePoints[i].update();
        }
    }

    updatePoint(i, t) {
        if (!this.activePoints[i].position.inRect(0, 0, this.width, this.height)) {
            this.activePoints[i].markGC(true);
            return;
        }
        var chartPos = this.chart.toChartCoords(this.activePoints[i].position, this.canvasBounds);
        var chartDPos = Vector.map(chartPos, this.xDot, this.yDot, t);
        this.activePoints[i].velocity = Vector.scale(Vector.normalize(chartDPos), this.deltaX);// <- new version | Deprecated: this.nearestVector(this.activePoints[i].position)), this.deltaX);
        this.activePoints[i].update();
    }

    placePoint(pos) {
        this.activePoints.push(new Point(pos));
        this.originalPoints.push(_.cloneDeep(this.activePoints[this.activePoints.length - 1]));
    }
// in dev 
/*
    removePoint(pos, threshhold = 5) {
        this.activePoints.find(function(pointPos) {return Math.dist(pointPos.x, pointPos.y, pos.x, pos.y)}).indexOf;
    }*/

    // DEPRECATED
    nearestVector(vec) {
        var nearestCol = Math.floor(vec.x / this.gapHorizontal);
        var nearestRow = Math.floor(vec.y / this.gapVertical);
        return this.vectorField[nearestCol][nearestRow];
    }

    updateDeltaX(deltaX) {
        this.deltaX = deltaX;
    }

    updateIterationCount(val) {
        this.iterationCount = val;
    }

    // DEPRECATED
    drawArrow(x1, y1, x2, y2, arrowAngle, arrowHeadSize) {
        this.c.moveTo(x1, y1);
        this.c.lineTo(x2, y2);
        var dispVec = new Vector(x2 - x1, y2 - y1);
        dispVec.normalize();
        var theta = Vector.dot(dispVec, VEC_RIGHT);
        console.log(theta);
    }

    toCanvasCursorPosition(event) {
        const rect = this.canvasBoundingRect;
        return new Vector(event.clientX - rect.left, event.clientY - rect.top);
    }

    // Called every time Program.update() runs; draws vector field, axes and active points/lines to screen
    draw(t, drawSettings) {
        // Axes
        if (drawSettings.doAxesPass) {
            var xInt = (-this.width  * this.chart.xNeg) / (this.chart.xPos - this.chart.xNeg);
            var yInt = (-this.height * this.chart.yNeg) / (this.chart.yPos - this.chart.yNeg);
            this.c.beginPath();
            this.c.strokeStyle = "white";
            this.c.lineWidth = 2;
            this.c.moveTo(xInt, 0);
            this.c.lineTo(xInt, this.height);
            this.c.moveTo(0, yInt);
            this.c.lineTo(this.width, yInt);
            this.c.stroke();
        }

        // Vector-field
        for (let i = 0; i < this.cols; i++) {
            for (let j = 0; j < this.rows; j++) {
                this.c.beginPath();
                this.c.lineWidth = 1;
                
                if (drawSettings.doColor) {
                    this.c.fillStyle = drawSettings.colorContinuumEnabled ? this.getColorFromContinuum(this.vectorField[i][j].trueMag * this.colorScale) : "lightblue";
                    this.c.strokeStyle = this.c.fillStyle;
                } else {
                    this.c.fillStyle = "white";
                    this.c.strokeStyle = "white";
                }

                if (drawSettings.doVectorFieldPass) {
                    this.c.ellipse(this.margins.x + i * this.gapHorizontal, this.margins.y + j * this.gapVertical, 1, 1, 0, 0, Math.PI * 2);
                    this.c.fill();
                    this.c.moveTo(this.margins.x + i * this.gapHorizontal, this.margins.y + j * this.gapVertical);
                    this.c.lineTo(this.margins.x + i * this.gapHorizontal + this.vectorField[i][j].x, this.margins.y + j * this.gapVertical + this.vectorField[i][j].y);
                    this.c.stroke();
                }
            }            
        }

        if (drawSettings.doLinePass) {
        // Points/lines
            for (let i = 0; i < this.activePoints.length; i++) {
                this.activePoints[i] = _.cloneDeep(this.originalPoints[i]);

                this.c.beginPath();
                this.c.strokeStyle = "white";
                this.c.lineWidth = 1.5;

                this.c.fillStyle = "orange";
                this.c.ellipse(this.activePoints[i].position.x, this.activePoints[i].position.y, 3, 3, 0, 0, Math.PI * 2);
                this.c.fill();

                this.c.fillStyle = "white";
                this.c.moveTo(this.activePoints[i].position.x, this.activePoints[i].position.y);
                for (let j = 0; j < this.iterationCount; j++) {
                    this.updatePoint(i, t);
                    if (this.activePoints[i].GC) {  // If the point was marked for disposal by updatePoint() (if it went outside the frame), break out of loop
                        break;
                    }
                    this.c.lineTo(this.activePoints[i].position.x, this.activePoints[i].position.y);
                }
                this.c.stroke();
            }
        }
    }
}


class Program {
    xDot(x, y, t) {
        return y;//Math.sin(x * y / Math.sin(t) * y + Math.cos(Math.cos(t * 0.5) * x - y));//y; //-10 * (400 * x / Math.pow(Math.sqrt(x * x + y * y), 3) + 100 * (x - 10 * t) / Math.pow(Math.sqrt((x - 10 * t) * (x - 10 * t) + y * y), 3));
    }

    yDot(x, y, t) {
        return -9.807 / 10 * Math.sin(x) - Math.sin(t).map(-1, 1, 0.001, 0.1) * 10 * y;//x + Math.sin(y) / Math.sin(t);//-10 * (400 * y / Math.pow(Math.sqrt(x * x + y * y), 3) + 100 * y / Math.pow(Math.sqrt((x - 10 * t) * (x - 10 * t) + y * y), 3));//
    }

    // Initialise variables
    init(speed = 1) {
        this.fullCanvasUpdate = new CanvasUpdateSettings(true, true, true, false, true, document.getElementById("colorPivotEnabled").value);
        this.noPointRandomizeUpdate = new CanvasUpdateSettings(true, true, true, false, true, document.getElementById("colorPivotEnabled").value);
        this.speed = speed;
        this.stopped = true;
        this.hasRandomizedPoints = false;
        this.vecField = new VectorField(innerWidth - 2, innerHeight - 150, Math.floor((innerHeight - 150) / 15), Math.floor((innerWidth - 2) / 15), document.getElementById("MainCanvas"), this.xDot, this.yDot, new VectorFieldRange(-(innerWidth - 2) / 100, (innerWidth - 2) / 100, -(innerHeight - 2) / 100, (innerHeight - 2) / 100), 255, 12, vectorFieldStyles.CAP);
        this.timeLabel = document.getElementById("TimeLabel");
        this.timeStarted = Date.now();
        this.timeOfLastFrame;
        this.deltaTime;
        this.update(this.noPointRandomizeUpdate);
    }

    stopAnimation() {
        this.stopped = true;
    }

    startAnimation() {
        this.stopped = false;
        this.timeStarted = Date.now();
        this.update();
    }

    updatePivot(val) {
        this.vecField.updatePivot(val);
        this.refresh();
    }

    updateDeltaX(val) {
        this.vecField.updateDeltaX(val);
        this.refresh();
    }

    updateIterationCount(val) {
        this.vecField.updateIterationCount(val);
        this.refresh();
    }

    updateFieldStyle(style) {
        this.vecField.updateFieldStyle(style);
        this.refresh();
    }

    refresh() {
        if (this.stopped) {
            this.update(this.noPointRandomizeUpdate);
        }
    }

    // Called every frame while this.stopped is false
    update(updateSettings = this.fullCanvasUpdate) {
        var t = (Date.now() - this.timeStarted) / 1000;
        this.deltaTime = t - this.timeOfLastFrame;
        this.timeOfLastFrame = t;
        this.vecField.calculateVectorsAtTime(t * this.speed);
        this.vecField.clearFrame();
        updateSettings.updateColorContinuumEnabled();
        this.vecField.draw(t * this.speed, updateSettings);
        this.timeLabel.innerHTML = `t = ${t.toFixed(2)}, Framerate = ${(1 / this.deltaTime).toFixed(2)} (Click graph to set initial conditions)`;
        if (!this.stopped) {
            requestAnimationFrame(this.update.bind(this, updateSettings));
        } else if (this.hasRandomizedPoints) {
            this.reset(this.noPointRandomizeUpdate);
        } else {
            this.reset(updateSettings);
        }
    }

    // Called after first update loop and whenever animation stops, after the last update() loop runs
    reset(updateSettings = this.fullCanvasUpdate) {
        this.vecField.calculateVectorsAtTime(0);
        updateSettings.updateColorContinuumEnabled();
        if (updateSettings.doRandomizePoints) {
            this.vecField.initPoints(1, this.vecField.deltaX);
            this.hasRandomizedPoints = true;
        }
        this.vecField.clearFrame();
        this.vecField.draw(0, updateSettings);
        this.timeLabel.innerHTML = "t = 0.00 (Click graph to set initial conditions)";
    }
}

const main = new Program();

window.onload = function() {
    const colorPivotCountBox = document.getElementById("colorPivotCount");
    const deltaXSlider = document.getElementById("deltaXSlider");
    const deltaXLabel = document.getElementById("deltaXLabel");
    const iterationCountBox = document.getElementById("iterationCount");

    main.init();

    colorPivotCountBox.oninput = function() {
        main.updatePivot(this.value);
    }
    deltaXSlider.oninput = function() {
        main.updateDeltaX(this.value * this.value / 10);
        deltaXLabel.innerHTML = "Step Size: " + (this.value * this.value / 10).toFixed(3);
    }
    iterationCountBox.oninput = function() {
        main.updateIterationCount(this.value);
    }
    window.addEventListener("mouseup", function(e) {
        canvasClickPos = main.vecField.toCanvasCursorPosition(e);
        if (canvasClickPos.inRect(0, 0, main.vecField.width, main.vecField.height)) {
            main.hasRandomizedPoints = true;
            main.vecField.placePoint(canvasClickPos);
            main.refresh();
        }
    });
};

function updateColorPivot() {
    console.log("Updating...");
    main.refresh();
}