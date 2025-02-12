class OMRScanner {
    constructor() {
        this.canvas = document.getElementById('canvas');
        this.preview = document.getElementById('preview');
        this.processBtn = document.getElementById('process');
        this.resultsDiv = document.getElementById('results');
        this.debugCanvas = document.getElementById('debugCanvas');
        
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
    }

    async processOMR() {
        if (!this.canvas || !this.debugCanvas) {
            throw new Error('Canvas elements not found');
        }

        const canvas = this.canvas;
        const ctx = canvas.getContext('2d');
        
        if (!ctx) {
            throw new Error('Could not get canvas context');
        }

        console.log('Starting OMR processing...');

        try {
            // Step 1: Preprocess image using OpenCV
            const processedMat = await this.preprocessImageCV();
            
            // Step 2: Detect grid using contours
            const gridInfo = await this.detectGridCV(processedMat);
            
            // Step 3: Detect bubbles using ML-enhanced detection
            const bubbles = await this.detectBubblesML(processedMat, gridInfo);
            
            if (!bubbles || bubbles.length === 0) {
                throw new Error('No bubbles detected in the image');
            }
            
            // Step 4: Analyze bubbles and map to answers
            const answers = this.analyzeBubbles(bubbles);
            
            // Display results
            this.displayResults({
                total: this.numQuestions,
                details: answers.map((ans, i) => ({
                    question: i + 1,
                    given: ans || '-'
                }))
            });

            // Cleanup
            processedMat.delete();
        } catch (error) {
            console.error('Error in OMR processing:', error);
            throw error;
        }
    }

    async preprocessImageCV() {
        return cv.imread(this.canvas).then(mat => {
            // Convert to grayscale
            const gray = new cv.Mat();
            cv.cvtColor(mat, gray, cv.COLOR_RGBA2GRAY);
            
            // Apply Gaussian blur to reduce noise
            const blurred = new cv.Mat();
            const ksize = new cv.Size(5, 5);
            cv.GaussianBlur(gray, blurred, ksize, 0);
            
            // Apply adaptive thresholding
            const binary = new cv.Mat();
            cv.adaptiveThreshold(
                blurred,
                binary,
                255,
                cv.ADAPTIVE_THRESH_GAUSSIAN_C,
                cv.THRESH_BINARY_INV,
                11,
                2
            );
            
            // Remove pink grid lines
            const mask = new cv.Mat();
            const pink = new cv.Mat(mat.rows, mat.cols, mat.type(), [255, 192, 203, 255]);
            cv.inRange(mat, pink, pink, mask);
            cv.bitwise_not(mask, mask);
            cv.bitwise_and(binary, mask, binary);
            
            // Cleanup
            mat.delete();
            gray.delete();
            blurred.delete();
            mask.delete();
            pink.delete();
            
            return binary;
        });
    }

    async detectGridCV(mat) {
        // Find contours
        const contours = new cv.MatVector();
        const hierarchy = new cv.Mat();
        cv.findContours(
            mat,
            contours,
            hierarchy,
            cv.RETR_EXTERNAL,
            cv.CHAIN_APPROX_SIMPLE
        );
        
        // Find the largest rectangular contour (should be the grid)
        let maxArea = 0;
        let gridContour = null;
        
        for (let i = 0; i < contours.size(); i++) {
            const contour = contours.get(i);
            const area = cv.contourArea(contour);
            if (area > maxArea) {
                const perimeter = cv.arcLength(contour, true);
                const approx = new cv.Mat();
                cv.approxPolyDP(contour, approx, 0.02 * perimeter, true);
                
                if (approx.rows === 4) { // If it's rectangular
                    maxArea = area;
                    gridContour = approx;
                }
            }
        }
        
        if (!gridContour) {
            throw new Error('Grid not found in image');
        }
        
        // Get grid corners
        const corners = [];
        for (let i = 0; i < 4; i++) {
            corners.push({
                x: gridContour.data32S[i * 2],
                y: gridContour.data32S[i * 2 + 1]
            });
        }
        
        // Sort corners (top-left, top-right, bottom-right, bottom-left)
        corners.sort((a, b) => a.y - b.y);
        const [topTwo, bottomTwo] = [corners.slice(0, 2), corners.slice(2)];
        topTwo.sort((a, b) => a.x - b.x);
        bottomTwo.sort((a, b) => a.x - b.x);
        const sortedCorners = [...topTwo, ...bottomTwo.reverse()];
        
        // Calculate grid dimensions
        const width = mat.cols;
        const height = mat.rows;
        
        // Cleanup
        contours.delete();
        hierarchy.delete();
        gridContour.delete();
        
        return {
            corners: sortedCorners,
            cellWidth: width / this.gridConfig.cols,
            cellHeight: height / this.gridConfig.rows,
            width,
            height
        };
    }

    async detectBubblesML(mat, gridInfo) {
        const bubbles = [];
        const { corners, cellWidth, cellHeight } = gridInfo;
        
        // Create a mask for bubble detection
        const mask = new cv.Mat.zeros(mat.rows, mat.cols, cv.CV_8UC1);
        
        // For each potential bubble position
        for (let row = 0; row < this.gridConfig.rows; row++) {
            for (let col = 0; col < this.gridConfig.cols; col++) {
                const bubbleGroup = [];
                
                for (let opt = 0; opt < this.gridConfig.optionsPerQ; opt++) {
                    // Calculate bubble position
                    const x = Math.floor(corners[0].x + col * cellWidth + 
                        (opt + 1) * (cellWidth / (this.gridConfig.optionsPerQ + 1)));
                    const y = Math.floor(corners[0].y + row * cellHeight + cellHeight / 2);
                    
                    // Extract bubble region
                    const bubbleROI = this.extractBubbleRegion(
                        mat,
                        x,
                        y,
                        this.gridConfig.bubbleRadius
                    );
                    
                    // Calculate fill ratio using contour analysis
                    const darkness = await this.analyzeBubbleRegion(bubbleROI);
                    
                    bubbleGroup.push({
                        row,
                        col,
                        option: opt,
                        darkness,
                        x, y
                    });
                    
                    // Draw debug visualization
                    if (this.debugCanvas) {
                        const ctx = this.debugCanvas.getContext('2d');
                        ctx.strokeStyle = `rgba(255, 0, 0, ${darkness})`;
                        ctx.strokeRect(
                            x - this.gridConfig.bubbleRadius,
                            y - this.gridConfig.bubbleRadius,
                            this.gridConfig.bubbleRadius * 2,
                            this.gridConfig.bubbleRadius * 2
                        );
                    }
                    
                    bubbleROI.delete();
                }
                
                // Find the darkest bubble in the group
                const darkest = bubbleGroup.reduce((prev, curr) => 
                    curr.darkness > prev.darkness ? curr : prev
                );
                
                // Only consider it marked if darkness is above threshold
                if (darkest.darkness > 0.3) {
                    bubbles.push(darkest);
                }
            }
        }
        
        mask.delete();
        return bubbles;
    }

    extractBubbleRegion(mat, x, y, radius) {
        const rect = new cv.Rect(
            x - radius,
            y - radius,
            radius * 2,
            radius * 2
        );
        return mat.roi(rect);
    }

    async analyzeBubbleRegion(bubbleROI) {
        // Convert to binary
        const binary = new cv.Mat();
        cv.threshold(bubbleROI, binary, 0, 255, cv.THRESH_BINARY_INV + cv.THRESH_OTSU);
        
        // Find contours in the bubble region
        const contours = new cv.MatVector();
        const hierarchy = new cv.Mat();
        cv.findContours(
            binary,
            contours,
            hierarchy,
            cv.RETR_EXTERNAL,
            cv.CHAIN_APPROX_SIMPLE
        );
        
        // Calculate fill ratio
        let totalArea = 0;
        for (let i = 0; i < contours.size(); i++) {
            totalArea += cv.contourArea(contours.get(i));
        }
        const bubbleArea = bubbleROI.rows * bubbleROI.cols;
        const fillRatio = totalArea / bubbleArea;
        
        // Cleanup
        binary.delete();
        contours.delete();
        hierarchy.delete();
        
        return fillRatio;
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