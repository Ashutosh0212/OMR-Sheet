class OMRScanner {
    constructor() {
        this.video = document.getElementById('camera');
        this.canvas = document.getElementById('canvas');
        this.preview = document.getElementById('preview');
        this.captureBtn = document.getElementById('capture');
        this.processBtn = document.getElementById('process');
        this.emailBtn = document.getElementById('email-results');
        this.answerForm = document.getElementById('answer-form');
        this.resultsDiv = document.getElementById('results');
        
        // Configuration specific to the OMR sheet format
        this.numQuestions = 100;
        this.optionsPerQuestion = 4;
        this.availableOptions = ['A', 'B', 'C', 'D'];
        
        // Grid configuration for the specific format
        this.gridConfig = {
            rows: 25,          // 25 questions per column
            cols: 4,           // 4 columns
            optionsPerQ: 4,    // A, B, C, D
            bubbleRadius: 12,  // Approximate radius of bubbles
            gridMarginTop: 0.2,  // 20% margin from top
            gridMarginLeft: 0.1  // 10% margin from left
        };

        // Check if we're on HTTPS
        if (window.location.protocol === 'http:' && !window.location.hostname.includes('localhost')) {
            this.displaySecureContextError();
        } else {
            this.initializeCamera();
        }
        
        this.initializeConfigHandlers();
        this.createAnswerForm();
        this.addEventListeners();

        // Debug options
        this.debug = true;
        this.debugCanvas = document.createElement('canvas');
        this.debugCanvas.className = 'debug-overlay';
        document.querySelector('.preview-container').appendChild(this.debugCanvas);

        // Initialize ML model
        this.model = null;
        this.loadModel();
    }

    displaySecureContextError() {
        const cameraContainer = document.querySelector('.camera-container');
        const httpsUrl = `https://${window.location.hostname}${window.location.pathname}`;
        cameraContainer.innerHTML = `
            <div class="error-message">
                <p>Camera access requires a secure connection (HTTPS).</p>
                <pre>Please access this page using HTTPS:
                <a href="${httpsUrl}">${httpsUrl}</a></pre>
                <button onclick="location.href='${httpsUrl}'">Switch to HTTPS</button>
            </div>
        `;
    }

    async initializeCamera() {
        try {
            // Show loading state
            const cameraContainer = document.querySelector('.camera-container');
            cameraContainer.innerHTML = '<p>Loading camera...</p>';

            // Check if running in secure context
            if (!window.isSecureContext) {
                throw new Error('Camera access requires a secure context (HTTPS or localhost)');
            }

            // Check for camera support
            if (!navigator.mediaDevices?.getUserMedia) {
                throw new Error('Your browser does not support camera access');
            }

            // Set up initial constraints
            const constraints = {
                video: {
                    width: { ideal: 1280 },
                    height: { ideal: 720 },
                    facingMode: { ideal: 'environment' }
                },
                audio: false
            };

            try {
                // Try to get camera access
                const stream = await navigator.mediaDevices.getUserMedia(constraints);
                await this.setupVideoStream(stream, cameraContainer);
            } catch (err) {
                console.log('First camera attempt failed, trying fallback...', err);
                
                // Try again with front camera
                constraints.video.facingMode = 'user';
                const stream = await navigator.mediaDevices.getUserMedia(constraints);
                await this.setupVideoStream(stream, cameraContainer);
            }

        } catch (err) {
            console.error('Camera Error:', err);
            this.handleCameraError(err);
        }
    }

    async setupVideoStream(stream, cameraContainer) {
        // Reset camera container to original state
        cameraContainer.innerHTML = `
            <video id="camera" autoplay playsinline muted></video>
            <div class="camera-overlay"></div>
            <button id="capture">Capture OMR Sheet</button>
            <canvas id="canvas" style="display: none;"></canvas>
        `;

        // Get new video element reference and set up stream
        this.video = document.getElementById('camera');
        this.video.setAttribute('playsinline', ''); // required to tell iOS safari we don't want fullscreen
        this.video.setAttribute('autoplay', '');
        this.video.setAttribute('muted', '');
        this.video.style.width = '100%';
        this.video.style.height = 'auto';

        // Attach the stream
        this.video.srcObject = stream;
        
        // Wait for video to be ready
        return new Promise((resolve) => {
            this.video.onloadedmetadata = () => {
                this.video.play()
                    .then(() => {
                        console.log('Camera started successfully');
                        // Re-attach button reference and event listener
                        this.captureBtn = document.getElementById('capture');
                        this.captureBtn.addEventListener('click', () => this.captureImage());
                        resolve();
                    })
                    .catch(error => {
                        console.error('Error playing video:', error);
                        this.handleCameraError(error);
                    });
            };
        });
    }

    handleCameraError(err) {
        let errorMessage, instructions;

        if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
            errorMessage = 'Camera access was denied. Please allow camera access to use this feature.';
            instructions = this.getCameraPermissionInstructions();
        } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
            errorMessage = 'No camera found on your device.';
            instructions = 'Please make sure your device has a camera and try again.';
        } else if (err.name === 'NotReadableError' || err.name === 'TrackStartError') {
            errorMessage = 'Your camera is in use by another application.';
            instructions = 'Please close other applications that might be using your camera and refresh the page.';
        } else {
            errorMessage = 'Error accessing camera: ' + (err.message || err);
            instructions = 'Please check if your camera is properly connected and refresh the page.';
        }

        this.displayCameraError(errorMessage, instructions);
    }

    getCameraPermissionInstructions() {
        const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
        
        if (isMobile) {
            return `
                Mobile Browser Instructions:
                1. Tap the lock/info icon in your address bar
                2. Find "Camera" in permissions
                3. Allow camera access
                4. Refresh this page
                
                If using iOS:
                1. Go to Settings > Safari
                2. Scroll down to Camera
                3. Allow access for this website
                
                If using Android:
                1. Go to Settings > Site Settings > Camera
                2. Allow access for this website`;
        } else {
            return `
                Desktop Browser Instructions:
                
                Chrome/Edge:
                1. Click the camera icon in the address bar
                2. Select "Allow" for camera access
                3. Refresh the page
                
                Firefox:
                1. Click the camera icon in the address bar
                2. Select "Allow" and "Remember this decision"
                3. Refresh the page
                
                Safari:
                1. Click Safari > Preferences > Websites
                2. Find Camera in the left sidebar
                3. Allow access for this website`;
        }
    }

    // Add this new method to display camera errors in the UI
    displayCameraError(message, instructions) {
        const cameraContainer = document.querySelector('.camera-container');
        cameraContainer.innerHTML = `
            <div class="error-message">
                <p>${message}</p>
                <pre>${instructions}</pre>
                <button onclick="location.reload()">Retry Camera Access</button>
            </div>
        `;
    }

    initializeConfigHandlers() {
        const updateFormBtn = document.getElementById('update-form');
        const numQuestionsInput = document.getElementById('num-questions');
        const optionsPerQuestionInput = document.getElementById('options-per-question');
        const optionsContainer = document.getElementById('options-container');

        updateFormBtn.addEventListener('click', () => {
            this.numQuestions = parseInt(numQuestionsInput.value);
            this.optionsPerQuestion = parseInt(optionsPerQuestionInput.value);
            
            // Get selected options
            this.availableOptions = Array.from(optionsContainer.querySelectorAll('input[type="checkbox"]:checked'))
                .map(cb => cb.value)
                .sort();

            if (this.availableOptions.length < this.optionsPerQuestion) {
                alert('Please select enough options for the number of options per question');
                return;
            }

            this.createAnswerForm();
        });
    }

    createAnswerForm() {
        const container = document.createElement('div');
        container.className = 'answer-grid';

        for (let i = 1; i <= this.numQuestions; i++) {
            const div = document.createElement('div');
            div.className = 'answer-input';
            
            const label = document.createElement('label');
            label.textContent = `Q${i}:`;
            
            // Create a container for options
            const optionsContainer = document.createElement('div');
            optionsContainer.className = 'options-container';
            optionsContainer.id = `options-container-${i}`;

            // Add available options as radio buttons initially
            this.availableOptions.forEach(option => {
                const input = document.createElement('input');
                input.type = 'radio';
                input.value = option;
                input.name = `q${i}-options`;
                input.disabled = false; // Enable for single choice

                const optionLabel = document.createElement('label');
                optionLabel.textContent = option;
                optionLabel.prepend(input);

                optionsContainer.appendChild(optionLabel);
            });

            div.appendChild(label);
            div.appendChild(optionsContainer);

            // Add question type toggle
            const questionTypeDiv = document.createElement('div');
            questionTypeDiv.className = 'question-type';
            questionTypeDiv.innerHTML = `
                <label>
                    <input type="radio" name="q${i}-type" value="single" checked> Single
                </label>
                <label>
                    <input type="radio" name="q${i}-type" value="multi"> Multi
                </label>
            `;
            div.appendChild(questionTypeDiv);

            // Add event listener to toggle between single and multi
            questionTypeDiv.addEventListener('change', (event) => {
                const isMulti = event.target.value === 'multi';
                optionsContainer.querySelectorAll('input').forEach(input => {
                    input.type = isMulti ? 'checkbox' : 'radio';
                });
            });

            container.appendChild(div);
        }

        // Clear existing form and add new one
        this.answerForm.innerHTML = '';
        this.answerForm.appendChild(container);
    }

    addEventListeners() {
        this.captureBtn.addEventListener('click', () => this.captureImage());
        this.processBtn.addEventListener('click', () => this.processOMR());
        this.emailBtn.addEventListener('click', () => this.emailResults());
    }

    captureImage() {
        const context = this.canvas.getContext('2d');
        this.canvas.width = this.video.videoWidth;
        this.canvas.height = this.video.videoHeight;
        context.drawImage(this.video, 0, 0, this.canvas.width, this.canvas.height);
        
        const imageData = this.canvas.toDataURL('image/png');
        this.preview.src = imageData;
        this.preview.style.display = 'block';
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
        
        // Pre-process image
        const processedImageData = this.preprocessImage(canvas);
        
        // Detect grid and align
        const gridInfo = this.detectGrid(processedImageData);
        
        // Find and analyze bubbles
        const bubbles = this.detectBubbles(processedImageData, gridInfo);
        
        if (!bubbles || bubbles.length === 0) {
            throw new Error('No bubbles detected in the image');
        }
        
        // Analyze bubbles
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
        
        // Convert to grayscale and enhance contrast
        for (let i = 0; i < data.length; i += 4) {
            // Convert to grayscale with optimized weights for blue/black ink
            const gray = Math.round(
                0.299 * data[i] +     // Red
                0.587 * data[i + 1] + // Green
                0.114 * data[i + 2]   // Blue
            );
            
            // Enhance contrast for better bubble detection
            let enhanced = gray;
            if (gray < 128) {
                enhanced = gray * 0.8; // Darken dark pixels
            } else {
                enhanced = Math.min(255, gray * 1.2); // Lighten light pixels
            }
            
            data[i] = enhanced;
            data[i + 1] = enhanced;
            data[i + 2] = enhanced;
        }
        
        // Apply local adaptive thresholding
        imageData = this.applyAdaptiveThreshold(imageData);
        
        if (this.debug) {
            this.debugCanvas.getContext('2d').putImageData(imageData, 0, 0);
        }
        
        return imageData;
    }

    applyAdaptiveThreshold(imageData) {
        const width = imageData.width;
        const height = imageData.height;
        const data = imageData.data;
        const windowSize = 15;
        const C = 5; // Threshold adjustment
        
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const i = (y * width + x) * 4;
                
                // Calculate local mean
                let sum = 0;
                let count = 0;
                
                for (let wy = -windowSize; wy <= windowSize; wy++) {
                    for (let wx = -windowSize; wx <= windowSize; wx++) {
                        const ny = y + wy;
                        const nx = x + wx;
                        
                        if (ny >= 0 && ny < height && nx >= 0 && nx < width) {
                            sum += data[(ny * width + nx) * 4];
                            count++;
                        }
                    }
                }
                
                const mean = sum / count;
                const threshold = mean - C;
                
                // Apply threshold
                const value = data[i] < threshold ? 0 : 255;
                data[i] = value;
                data[i + 1] = value;
                data[i + 2] = value;
            }
        }
        
        return imageData;
    }

    detectGrid(imageData) {
        const width = imageData.width;
        const height = imageData.height;
        
        // Calculate grid dimensions based on the image size
        return {
            cellWidth: width / (this.gridConfig.cols + 2), // Add margin
            cellHeight: height / (this.gridConfig.rows + 2), // Add margin
            startX: width * this.gridConfig.gridMarginLeft,
            startY: height * this.gridConfig.gridMarginTop
        };
    }

    detectBubbles(imageData, gridInfo) {
        const bubbles = [];
        const data = imageData.data;
        const { cellWidth, cellHeight, startX, startY } = gridInfo;
        
        // Size of the bubble detection area
        const bubbleWidth = cellWidth * 0.2;  // 20% of cell width
        const bubbleHeight = cellHeight * 0.2; // 20% of cell height
        
        for (let row = 0; row < this.gridConfig.rows; row++) {
            for (let col = 0; col < this.gridConfig.cols; col++) {
                const bubbleGroup = [];
                
                for (let opt = 0; opt < this.gridConfig.optionsPerQ; opt++) {
                    // Calculate bubble center position
                    const x = Math.floor(startX + col * cellWidth + (opt + 0.5) * (cellWidth / this.gridConfig.optionsPerQ));
                    const y = Math.floor(startY + row * cellHeight + cellHeight * 0.5);
                    
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
                    
                    // Draw debug rectangle
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
                if (darkest.darkness > 0.25) { // Lowered threshold for better detection
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
        
        for (let dy = 0; dy < h; dy++) {
            for (let dx = 0; dx < w; dx++) {
                const px = x + dx;
                const py = y + dy;
                
                if (px >= 0 && px < width && py >= 0 && py < data.length/(4*width)) {
                    const i = (py * width + px) * 4;
                    // Consider darker pixels (adjusted threshold)
                    if (data[i] < 180) {
                        darkPixels++;
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

    emailResults() {
        // Implement email functionality here
        alert('Results will be emailed (not implemented in this demo)');
    }

    async loadModel() {
        try {
            // Load pre-trained MobileNet model
            this.model = await tf.loadLayersModel('https://storage.googleapis.com/tfjs-models/tfjs/mobilenet_v1_0.25_224/model.json');
            console.log('ML model loaded successfully');
        } catch (error) {
            console.error('Error loading ML model:', error);
        }
    }
}

// Initialize the application when the page loads
document.addEventListener('DOMContentLoaded', () => {
    const scanner = new OMRScanner();
    const statusDiv = document.getElementById('model-status');
    if (statusDiv) {
        statusDiv.textContent = 'Scanner ready';
        statusDiv.style.color = '#28a745';
    }
}); 