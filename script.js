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
        const preview = document.getElementById('preview');
        
        // Convert to grayscale and apply threshold
        let imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        let data = imageData.data;
        
        // Convert to grayscale
        for (let i = 0; i < data.length; i += 4) {
            let avg = (data[i] + data[i + 1] + data[i + 2]) / 3;
            data[i] = avg;     // red
            data[i + 1] = avg; // green
            data[i + 2] = avg; // blue
        }
        
        // Apply threshold
        for (let i = 0; i < data.length; i += 4) {
            let v = data[i] < 128 ? 0 : 255;
            data[i] = v;     // red
            data[i + 1] = v; // green
            data[i + 2] = v; // blue
        }
        
        ctx.putImageData(imageData, 0, 0);
        
        // Detect pink borders
        const borders = this.detectPinkBorders(canvas);
        if (!borders) {
            alert('Could not detect OMR sheet borders. Please ensure proper lighting and alignment.');
            return;
        }
        
        // Extract and analyze bubbles
        const answers = this.analyzeBubbles(canvas, borders);
        
        // Display results
        this.displayResults(answers);
    }

    detectPinkBorders(canvas) {
        const ctx = canvas.getContext('2d');
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imageData.data;
        
        // Pink color range in RGB
        const pinkLowerR = 200, pinkUpperR = 255;
        const pinkLowerG = 100, pinkUpperG = 180;
        const pinkLowerB = 150, pinkUpperB = 220;
        
        let leftBorder = canvas.width;
        let rightBorder = 0;
        let topBorder = canvas.height;
        let bottomBorder = 0;
        
        for (let y = 0; y < canvas.height; y++) {
            for (let x = 0; x < canvas.width; x++) {
                const i = (y * canvas.width + x) * 4;
                const r = data[i];
                const g = data[i + 1];
                const b = data[i + 2];
                
                if (r >= pinkLowerR && r <= pinkUpperR &&
                    g >= pinkLowerG && g <= pinkUpperG &&
                    b >= pinkLowerB && b <= pinkUpperB) {
                    
                    leftBorder = Math.min(leftBorder, x);
                    rightBorder = Math.max(rightBorder, x);
                    topBorder = Math.min(topBorder, y);
                    bottomBorder = Math.max(bottomBorder, y);
                }
            }
        }
        
        if (leftBorder >= rightBorder || topBorder >= bottomBorder) {
            return null;
        }
        
        return {
            left: leftBorder,
            right: rightBorder,
            top: topBorder,
            bottom: bottomBorder
        };
    }

    analyzeBubbles(canvas, borders) {
        const ctx = canvas.getContext('2d');
        const answers = new Array(100).fill(null);
        
        // Calculate grid dimensions
        const gridWidth = borders.right - borders.left;
        const gridHeight = borders.bottom - borders.top;
        
        // Define bubble dimensions
        const bubbleWidth = gridWidth / 4;  // 4 options (A,B,C,D)
        const bubbleHeight = gridHeight / 25; // 25 questions per column
        
        // Analyze each bubble
        for (let col = 0; col < 4; col++) {
            for (let row = 0; row < 25; row++) {
                for (let option = 0; option < 4; option++) {
                    const x = borders.left + (col * gridWidth/4) + (option * bubbleWidth) + (bubbleWidth * 0.25);
                    const y = borders.top + (row * bubbleHeight) + (bubbleHeight * 0.25);
                    const w = bubbleWidth * 0.5;
                    const h = bubbleHeight * 0.5;
                    
                    const filled = this.isBubbleFilled(ctx, x, y, w, h);
                    if (filled) {
                        const questionNum = row + (col * 25);
                        answers[questionNum] = ['A', 'B', 'C', 'D'][option];
                    }
                }
            }
        }
        
        return answers;
    }

    isBubbleFilled(ctx, x, y, width, height) {
        const imageData = ctx.getImageData(x, y, width, height);
        const data = imageData.data;
        let darkPixels = 0;
        let totalPixels = width * height;
        
        for (let i = 0; i < data.length; i += 4) {
            if (data[i] < 128) { // If pixel is dark
                darkPixels++;
            }
        }
        
        return (darkPixels / totalPixels) > 0.5; // More than 50% dark pixels
    }

    displayResults(answers) {
        const resultsDiv = document.getElementById('results');
        resultsDiv.innerHTML = '<h3>Scanned Answers:</h3>';
        
        const table = document.createElement('table');
        table.className = 'results-table';
        
        // Create header row
        const headerRow = document.createElement('tr');
        ['Q.No', 'Answer', 'Q.No', 'Answer', 'Q.No', 'Answer', 'Q.No', 'Answer'].forEach(text => {
            const th = document.createElement('th');
            th.textContent = text;
            headerRow.appendChild(th);
        });
        table.appendChild(headerRow);
        
        // Create rows with 4 questions per row
        for (let i = 0; i < 25; i++) {
            const row = document.createElement('tr');
            for (let j = 0; j < 4; j++) {
                const qNum = i + (j * 25);
                const qNumCell = document.createElement('td');
                qNumCell.textContent = qNum + 1;
                const ansCell = document.createElement('td');
                ansCell.textContent = answers[qNum] || '-';
                row.appendChild(qNumCell);
                row.appendChild(ansCell);
            }
            table.appendChild(row);
        }
        
        resultsDiv.appendChild(table);
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