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

        // Apply preprocessing to enhance pen marks
        const pinkPixels = this.enhanceImage(canvas);
        
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

    enhanceImage(canvas) {
        const ctx = canvas.getContext('2d');
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imageData.data;
        
        // First pass: Detect pink grid lines
        const pinkPixels = [];
        for (let i = 0; i < data.length; i += 4) {
            const r = data[i];
            const g = data[i + 1];
            const b = data[i + 2];
            
            // Detect pink grid lines (will be used for alignment)
            const isPink = (r > 200 && g < 150 && b > 150);
            if (isPink) {
                pinkPixels.push(Math.floor(i / 4));
            }
            
            // Check for filled bubbles (dark blue or black)
            const isDark = (r < 100 && g < 100 && b < 100) || // Black
                          (r < 100 && g < 100 && b > 150);    // Dark blue
            
            if (isDark) {
                data[i] = 0;     // R
                data[i + 1] = 0; // G
                data[i + 2] = 0; // B
            } else if (!isPink) {
                // Make non-marks white for better contrast
                data[i] = 255;
                data[i + 1] = 255;
                data[i + 2] = 255;
            }
        }
        
        ctx.putImageData(imageData, 0, 0);
        return pinkPixels;
    }

    findGridBoundaries(canvas) {
        const ctx = canvas.getContext('2d');
        const width = canvas.width;
        const height = canvas.height;
        
        // Find pink grid lines first
        const pinkPixels = this.enhanceImage(canvas);
        
        // Calculate pink pixel density in regions
        let leftMost = width;
        let rightMost = 0;
        let topMost = height;
        let bottomMost = 0;
        
        pinkPixels.forEach(pixel => {
            const x = pixel % width;
            const y = Math.floor(pixel / width);
            
            leftMost = Math.min(leftMost, x);
            rightMost = Math.max(rightMost, x);
            topMost = Math.min(topMost, y);
            bottomMost = Math.max(bottomMost, y);
        });
        
        // Add margins to boundaries
        return {
            left: leftMost + 5,
            right: rightMost - 5,
            top: topMost + 5,
            bottom: bottomMost - 5
        };
    }

    analyzeBubblesNew(canvas, boundaries) {
        const ctx = canvas.getContext('2d');
        const answers = new Array(100).fill(null);
        
        // Calculate grid dimensions based on the OMR format in the image
        const gridWidth = boundaries.right - boundaries.left;
        const gridHeight = boundaries.bottom - boundaries.top;
        
        // The OMR has 4 sections of 25 questions each
        const SECTIONS = 4;
        const QUESTIONS_PER_SECTION = 25;
        const OPTIONS = 4; // A, B, C, D
        
        // Calculate dimensions for each section
        const sectionHeight = gridHeight / SECTIONS;
        const questionHeight = sectionHeight / QUESTIONS_PER_SECTION;
        
        // Process each section
        for (let section = 0; section < SECTIONS; section++) {
            const sectionY = boundaries.top + (section * sectionHeight);
            
            // Process each question in the section
            for (let q = 0; q < QUESTIONS_PER_SECTION; q++) {
                const questionY = sectionY + (q * questionHeight);
                let maxDarkness = 0;
                let selectedOption = null;
                
                // Check each option (A, B, C, D)
                for (let opt = 0; opt < OPTIONS; opt++) {
                    // Calculate bubble position
                    // Adjust these values based on the exact layout in your image
                    const bubbleX = boundaries.left + (opt * (gridWidth / 5.5));
                    const bubbleY = questionY + (questionHeight * 0.2);
                    const bubbleWidth = gridWidth / 20;  // Adjust based on actual bubble size
                    const bubbleHeight = questionHeight * 0.6;
                    
                    const darkness = this.calculateBubbleDarkness(ctx, bubbleX, bubbleY, bubbleWidth, bubbleHeight);
                    
                    // Debug visualization
                    ctx.strokeStyle = 'rgba(255, 0, 0, 0.5)';
                    ctx.strokeRect(bubbleX, bubbleY, bubbleWidth, bubbleHeight);
                    
                    if (darkness > maxDarkness && darkness > 0.2) { // Adjusted threshold
                        maxDarkness = darkness;
                        selectedOption = opt;
                    }
                }
                
                if (selectedOption !== null) {
                    const questionNum = q + (section * QUESTIONS_PER_SECTION);
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
            let totalPixels = 0;
            
            for (let i = 0; i < data.length; i += 4) {
                const r = data[i];
                const g = data[i + 1];
                const b = data[i + 2];
                
                // Count dark pixels (black or dark blue)
                if ((r < 100 && g < 100 && b < 100) ||    // Black
                    (r < 100 && g < 100 && b > 150)) {    // Dark blue
                    darkPixels++;
                }
                totalPixels++;
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