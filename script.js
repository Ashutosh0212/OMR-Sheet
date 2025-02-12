class OMRScanner {
    constructor() {
        this.canvas = document.getElementById('canvas');
        this.preview = document.getElementById('preview');
        this.processBtn = document.getElementById('process');
        this.resultsDiv = document.getElementById('results');
        
        // Configuration for VCC OMR sheet
        this.numQuestions = 100;
        this.optionsPerQuestion = 4;
        this.availableOptions = ['A', 'B', 'C', 'D'];
        
        // Specific grid configuration for VCC sheet
        this.gridConfig = {
            rows: 25,          // 25 questions per column
            cols: 4,           // 4 columns
            optionsPerQ: 4,    // A, B, C, D
            bubbleRadius: 10,  // Adjusted bubble radius
            gridMarginTop: 0.15,  // 15% margin from top
            gridMarginLeft: 0.05,  // 5% margin from left
            cellPadding: 0.1,   // 10% padding within cells
            pinkThreshold: 200  // Threshold for pink grid lines
        };

        // Debug options
        this.debug = true;
        this.debugCanvas = document.createElement('canvas');
        this.debugCanvas.className = 'debug-overlay';
        document.querySelector('.preview-container').appendChild(this.debugCanvas);
    }

    async processOMR() {
        if (!this.canvas) {
            throw new Error('Canvas element not found');
        }

        const canvas = this.canvas;
        const ctx = canvas.getContext('2d');
        
        if (!ctx) {
            throw new Error('Could not get canvas context');
        }

        // Validate image data
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        if (!imageData || !imageData.data || imageData.data.length === 0) {
            throw new Error('No valid image data found');
        }
        
        // Set up debug canvas
        this.debugCanvas.width = canvas.width;
        this.debugCanvas.height = canvas.height;
        const debugCtx = this.debugCanvas.getContext('2d');
        debugCtx.clearRect(0, 0, this.debugCanvas.width, this.debugCanvas.height);
        
        console.log('Starting OMR processing...');
        
        // Remove pink grid lines and enhance bubbles
        const processedImageData = this.preprocessImage(canvas);
        
        // Find grid boundaries using pink lines
        const gridInfo = this.detectGridBoundaries(processedImageData);
        
        // Detect and analyze bubbles
        const bubbles = this.detectBubbles(processedImageData, gridInfo);
        
        if (!bubbles || bubbles.length === 0) {
            throw new Error('No bubbles detected in the image');
        }
        
        // Analyze bubbles and map to answers
        const answers = this.analyzeBubbles(bubbles);
        
        // Display results
        this.displayResults({
            total: this.numQuestions,
            details: answers.map((ans, i) => ({
                question: i + 1,
                given: ans || '-'
            }))
        });
    }

    preprocessImage(canvas) {
        const ctx = canvas.getContext('2d');
        let imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imageData.data;
        
        // First pass: Remove pink grid lines and enhance dark marks
        for (let i = 0; i < data.length; i += 4) {
            const r = data[i];
            const g = data[i + 1];
            const b = data[i + 2];
            
            // Check for pink grid lines (high red, lower green/blue)
            const isPink = r > this.gridConfig.pinkThreshold && 
                          r > g * 1.2 && 
                          r > b * 1.2;
            
            // Convert to grayscale with emphasis on blue/black
            const gray = Math.round(
                0.2 * r +     // Less weight on red to reduce pink lines
                0.3 * g +     // Medium weight on green
                0.5 * b       // More weight on blue for blue/black pen marks
            );
            
            // If it's a pink grid line, make it white
            if (isPink) {
                data[i] = 255;
                data[i + 1] = 255;
                data[i + 2] = 255;
            } else {
                // Enhance contrast for bubble marks
                const enhanced = gray < 128 ? gray * 0.7 : Math.min(255, gray * 1.3);
                data[i] = enhanced;
                data[i + 1] = enhanced;
                data[i + 2] = enhanced;
            }
        }
        
        // Second pass: Apply adaptive thresholding
        return this.applyAdaptiveThreshold(imageData, 15, 10);
    }

    applyAdaptiveThreshold(imageData, windowSize = 15, C = 10) {
        const width = imageData.width;
        const height = imageData.height;
        const data = imageData.data;
        
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = width;
        tempCanvas.height = height;
        const tempCtx = tempCanvas.getContext('2d');
        tempCtx.putImageData(imageData, 0, 0);
        
        // Create output image data
        const output = new ImageData(width, height);
        
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const i = (y * width + x) * 4;
                
                // Get average of surrounding pixels
                let sum = 0;
                let count = 0;
                
                for (let dy = -windowSize; dy <= windowSize; dy++) {
                    for (let dx = -windowSize; dx <= windowSize; dx++) {
                        const nx = x + dx;
                        const ny = y + dy;
                        
                        if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
                            const ni = (ny * width + nx) * 4;
                            sum += data[ni];
                            count++;
                        }
                    }
                }
                
                const threshold = (sum / count) - C;
                const value = data[i] < threshold ? 0 : 255;
                
                output.data[i] = value;
                output.data[i + 1] = value;
                output.data[i + 2] = value;
                output.data[i + 3] = 255;
            }
        }
        
        return output;
    }

    detectGridBoundaries(imageData) {
        const width = imageData.width;
        const height = imageData.height;
        
        // Calculate actual grid dimensions
        const effectiveWidth = width * (1 - 2 * this.gridConfig.gridMarginLeft);
        const effectiveHeight = height * (1 - 2 * this.gridConfig.gridMarginTop);
        
        return {
            cellWidth: effectiveWidth / this.gridConfig.cols,
            cellHeight: effectiveHeight / this.gridConfig.rows,
            startX: width * this.gridConfig.gridMarginLeft,
            startY: height * this.gridConfig.gridMarginTop,
            effectiveWidth,
            effectiveHeight
        };
    }

    detectBubbles(imageData, gridInfo) {
        const bubbles = [];
        const data = imageData.data;
        const { cellWidth, cellHeight, startX, startY } = gridInfo;
        
        // Calculate bubble dimensions
        const bubbleWidth = cellWidth / (this.gridConfig.optionsPerQ + 1);
        const bubbleHeight = cellHeight / 3;
        
        for (let row = 0; row < this.gridConfig.rows; row++) {
            for (let col = 0; col < this.gridConfig.cols; col++) {
                const bubbleGroup = [];
                
                for (let opt = 0; opt < this.gridConfig.optionsPerQ; opt++) {
                    // Calculate precise bubble position
                    const x = Math.floor(startX + col * cellWidth + (opt + 1) * bubbleWidth);
                    const y = Math.floor(startY + row * cellHeight + cellHeight / 2);
                    
                    // Calculate darkness in the bubble area
                    const darkness = this.calculateBubbleDarkness(
                        data,
                        imageData.width,
                        x - bubbleWidth/2,
                        y - bubbleHeight/2,
                        bubbleWidth,
                        bubbleHeight
                    );
                    
                    bubbleGroup.push({
                        row,
                        col,
                        option: opt,
                        darkness,
                        x, y,
                        width: bubbleWidth,
                        height: bubbleHeight
                    });
                    
                    // Draw debug visualization
                    if (this.debug) {
                        const ctx = this.debugCanvas.getContext('2d');
                        ctx.strokeStyle = `rgba(255, 0, 0, ${darkness})`;
                        ctx.strokeRect(
                            x - bubbleWidth/2,
                            y - bubbleHeight/2,
                            bubbleWidth,
                            bubbleHeight
                        );
                    }
                }
                
                // Find the darkest bubble in the group
                const darkest = bubbleGroup.reduce((prev, curr) => 
                    curr.darkness > prev.darkness ? curr : prev
                );
                
                // Only consider it marked if darkness is above threshold
                if (darkest.darkness > 0.2) { // Lowered threshold for better detection
                    bubbles.push(darkest);
                }
            }
        }
        
        return bubbles;
    }

    calculateBubbleDarkness(data, width, x, y, w, h) {
        let darkPixels = 0;
        let totalPixels = 0;
        
        // Convert coordinates to integers
        x = Math.floor(x);
        y = Math.floor(y);
        w = Math.floor(w);
        h = Math.floor(h);
        
        // Calculate weighted darkness
        for (let dy = 0; dy < h; dy++) {
            for (let dx = 0; dx < w; dx++) {
                const px = x + dx;
                const py = y + dy;
                
                if (px >= 0 && px < width && py >= 0 && py < data.length/(4*width)) {
                    const i = (py * width + px) * 4;
                    // Use a lower threshold for dark pixels
                    if (data[i] < 160) {
                        // Weight center pixels more heavily
                        const distFromCenter = Math.sqrt(
                            Math.pow((dx - w/2)/(w/2), 2) + 
                            Math.pow((dy - h/2)/(h/2), 2)
                        );
                        const weight = 1 - Math.min(1, distFromCenter);
                        darkPixels += weight;
                    }
                    totalPixels++;
                }
            }
        }
        
        return darkPixels / totalPixels;
    }

    analyzeBubbles(bubbles) {
        const answers = new Array(this.numQuestions).fill(null);
        
        // Group bubbles by question
        bubbles.forEach(bubble => {
            const questionIndex = bubble.row + bubble.col * this.gridConfig.rows;
            if (questionIndex < this.numQuestions) {
                answers[questionIndex] = this.availableOptions[bubble.option];
            }
        });
        
        return answers;
    }

    displayResults(results) {
        if (!this.resultsDiv) {
            console.error('Results div not found');
            return;
        }

        this.resultsDiv.innerHTML = `
            <div class="results-header">
                <h3>OMR Results</h3>
                <div class="score-summary">
                    <p>Total Questions: ${results.total}</p>
                    <p>Answered Questions: ${results.details.filter(d => d.given !== '-').length}</p>
                </div>
            </div>
        `;
        
        const table = document.createElement('table');
        table.className = 'results-table';
        
        // Create header row
        const headerRow = document.createElement('tr');
        ['Q.No', 'Given Answer'].forEach(text => {
            const th = document.createElement('th');
            th.textContent = text;
            headerRow.appendChild(th);
        });
        table.appendChild(headerRow);
        
        // Add results rows
        results.details.forEach(detail => {
            const row = document.createElement('tr');
            
            // Question number
            const qNumCell = document.createElement('td');
            qNumCell.textContent = detail.question;
            
            // Given answer
            const givenCell = document.createElement('td');
            givenCell.textContent = detail.given;
            givenCell.className = detail.given === '-' ? 'unanswered' : 'answered';
            
            row.appendChild(qNumCell);
            row.appendChild(givenCell);
            
            table.appendChild(row);
        });
        
        this.resultsDiv.appendChild(table);
    }
}

// Initialize the application when the page loads
document.addEventListener('DOMContentLoaded', () => {
    const scanner = new OMRScanner();
});