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
        
        // Add new properties
        this.numQuestions = 100;
        this.optionsPerQuestion = 4;
        this.availableOptions = ['A', 'B', 'C', 'D'];
        
        // Check if we're on HTTPS
        if (window.location.protocol === 'http:' && !window.location.hostname.includes('localhost')) {
            this.displaySecureContextError();
        } else {
            this.initializeCamera();
        }
        
        this.initializeConfigHandlers();
        this.createAnswerForm();
        this.addEventListeners();
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
        const canvas = document.getElementById('canvas');
        const ctx = canvas.getContext('2d');
        
        // Get the answer key from the form
        const answerKey = {};
        for (let i = 1; i <= this.numQuestions; i++) {
            const container = document.getElementById(`options-container-${i}`);
            const selectedOption = container.querySelector('input:checked');
            if (selectedOption) {
                answerKey[i] = selectedOption.value;
            }
        }
        
        // Convert to grayscale and enhance contrast
        let imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        let data = imageData.data;
        
        // Convert to grayscale with enhanced contrast
        for (let i = 0; i < data.length; i += 4) {
            let avg = (data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114);
            // Enhance contrast
            avg = avg < 128 ? avg * 0.8 : Math.min(255, avg * 1.2);
            data[i] = avg;     // red
            data[i + 1] = avg; // green
            data[i + 2] = avg; // blue
        }
        
        ctx.putImageData(imageData, 0, 0);
        
        // Find the grid boundaries using edge detection
        const boundaries = this.findGridBoundaries(canvas);
        if (!boundaries) {
            alert('Could not detect OMR grid. Please ensure proper lighting and alignment.');
            return;
        }
        
        // Extract and analyze bubbles
        const scannedAnswers = this.analyzeBubblesNew(canvas, boundaries);
        
        // Compare answers and calculate score
        const results = {
            score: 0,
            total: this.numQuestions,
            details: []
        };

        for (let i = 0; i < this.numQuestions; i++) {
            const questionNum = i + 1;
            const scanned = scannedAnswers[i];
            const correct = answerKey[questionNum];
            
            results.details.push({
                question: questionNum,
                correct: correct || '-',
                given: scanned || '-',
                isCorrect: correct && scanned && correct === scanned
            });

            if (correct && scanned && correct === scanned) {
                results.score++;
            }
        }
        
        // Display results
        this.displayResults(results);
    }

    findGridBoundaries(canvas) {
        const ctx = canvas.getContext('2d');
        const width = canvas.width;
        const height = canvas.height;
        
        // Create horizontal and vertical projections
        const horizontalProjection = new Array(height).fill(0);
        const verticalProjection = new Array(width).fill(0);
        
        const imageData = ctx.getImageData(0, 0, width, height);
        const data = imageData.data;
        
        // Calculate projections
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const i = (y * width + x) * 4;
                const intensity = data[i]; // Using red channel (grayscale)
                if (intensity < 128) { // Dark pixel
                    horizontalProjection[y]++;
                    verticalProjection[x]++;
                }
            }
        }
        
        // Find grid boundaries using peaks in projections
        const boundaries = {
            top: 0,
            bottom: height - 1,
            left: 0,
            right: width - 1
        };
        
        // Find top boundary
        for (let y = 0; y < height; y++) {
            if (horizontalProjection[y] > width * 0.3) { // At least 30% of width is dark
                boundaries.top = y;
                break;
            }
        }
        
        // Find bottom boundary
        for (let y = height - 1; y >= 0; y--) {
            if (horizontalProjection[y] > width * 0.3) {
                boundaries.bottom = y;
                break;
            }
        }
        
        // Find left boundary
        for (let x = 0; x < width; x++) {
            if (verticalProjection[x] > height * 0.3) {
                boundaries.left = x;
                break;
            }
        }
        
        // Find right boundary
        for (let x = width - 1; x >= 0; x--) {
            if (verticalProjection[x] > height * 0.3) {
                boundaries.right = x;
                break;
            }
        }
        
        // Validate boundaries
        if (boundaries.right - boundaries.left < width * 0.3 || 
            boundaries.bottom - boundaries.top < height * 0.3) {
            return null;
        }
        
        return boundaries;
    }

    analyzeBubblesNew(canvas, boundaries) {
        const ctx = canvas.getContext('2d');
        const answers = new Array(100).fill(null);
        
        // Calculate grid dimensions
        const gridWidth = boundaries.right - boundaries.left;
        const gridHeight = boundaries.bottom - boundaries.top;
        
        // Define the expected grid structure
        const COLUMNS = 4;  // 4 columns of questions
        const ROWS = 25;    // 25 questions per column
        const OPTIONS = 4;  // 4 options per question (A,B,C,D)
        
        // Calculate cell dimensions
        const cellWidth = gridWidth / COLUMNS;
        const cellHeight = gridHeight / ROWS;
        const optionWidth = cellWidth / OPTIONS;
        
        // Analyze each question
        for (let col = 0; col < COLUMNS; col++) {
            for (let row = 0; row < ROWS; row++) {
                let maxDarkness = 0;
                let selectedOption = null;
                
                // Check each option (A,B,C,D)
                for (let opt = 0; opt < OPTIONS; opt++) {
                    const x = boundaries.left + (col * cellWidth) + (opt * optionWidth) + (optionWidth * 0.25);
                    const y = boundaries.top + (row * cellHeight) + (cellHeight * 0.25);
                    const w = optionWidth * 0.5;
                    const h = cellHeight * 0.5;
                    
                    const darkness = this.calculateBubbleDarkness(ctx, x, y, w, h);
                    
                    if (darkness > maxDarkness && darkness > 0.3) { // At least 30% dark
                        maxDarkness = darkness;
                        selectedOption = opt;
                    }
                }
                
                if (selectedOption !== null) {
                    const questionNum = row + (col * ROWS);
                    answers[questionNum] = ['A', 'B', 'C', 'D'][selectedOption];
                }
            }
        }
        
        return answers;
    }

    calculateBubbleDarkness(ctx, x, y, width, height) {
        try {
            const imageData = ctx.getImageData(Math.floor(x), Math.floor(y), 
                                             Math.ceil(width), Math.ceil(height));
            const data = imageData.data;
            let darkPixels = 0;
            let totalPixels = width * height;
            
            for (let i = 0; i < data.length; i += 4) {
                // Using a more sophisticated darkness calculation
                const intensity = (data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114);
                if (intensity < 128) {
                    darkPixels++;
                }
            }
            
            return darkPixels / totalPixels;
        } catch (e) {
            console.error('Error calculating bubble darkness:', e);
            return 0;
        }
    }

    displayResults(results) {
        const resultsDiv = document.getElementById('results');
        resultsDiv.innerHTML = `
            <div class="results-header">
                <h3>OMR Results</h3>
                <div class="score-summary">
                    <h4>Score: ${results.score}/${results.total}</h4>
                    <p>Percentage: ${((results.score / results.total) * 100).toFixed(2)}%</p>
                </div>
            </div>
        `;
        
        const table = document.createElement('table');
        table.className = 'results-table';
        
        // Create header row
        const headerRow = document.createElement('tr');
        ['Q.No', 'Correct Answer', 'Given Answer', 'Status'].forEach(text => {
            const th = document.createElement('th');
            th.textContent = text;
            headerRow.appendChild(th);
        });
        table.appendChild(headerRow);
        
        // Add results rows
        results.details.forEach(detail => {
            const row = document.createElement('tr');
            row.className = detail.isCorrect ? 'correct-answer' : 'wrong-answer';
            
            // Question number
            const qNumCell = document.createElement('td');
            qNumCell.textContent = detail.question;
            
            // Correct answer
            const correctCell = document.createElement('td');
            correctCell.textContent = detail.correct;
            
            // Given answer
            const givenCell = document.createElement('td');
            givenCell.textContent = detail.given;
            
            // Status
            const statusCell = document.createElement('td');
            statusCell.textContent = detail.isCorrect ? '✓' : '✗';
            statusCell.className = detail.isCorrect ? 'status-correct' : 'status-wrong';
            
            row.appendChild(qNumCell);
            row.appendChild(correctCell);
            row.appendChild(givenCell);
            row.appendChild(statusCell);
            
            table.appendChild(row);
        });
        
        resultsDiv.appendChild(table);
        
        // Show email button
        this.emailBtn.style.display = 'block';
    }

    emailResults() {
        // Implement email functionality here
        alert('Results will be emailed (not implemented in this demo)');
    }
}

// Initialize the application when the page loads
document.addEventListener('DOMContentLoaded', () => {
    new OMRScanner();
}); 