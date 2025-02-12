# OMR Sheet Scanner

A web-based OMR (Optical Mark Recognition) sheet scanner that uses your device's camera to capture and process answer sheets.

## Features

- Real-time camera feed for capturing OMR sheets
- Configurable number of questions and options
- Support for both single-choice and multiple-choice questions
- Answer key input interface
- Results display with score calculation
- Mobile-friendly interface

## Live Demo

Visit [https://ashutosh0212.github.io/OMR-Sheet/](https://ashutosh0212.github.io/OMR-Sheet/) to try the application.

## Setup

1. Clone the repository:
   ```bash
   git clone https://github.com/Ashutosh0212/OMR-Sheet.git
   cd OMR-Sheet
   ```

2. Open `index.html` in a web browser with HTTPS or through a local server:
   ```bash
   # Using Python
   python -m http.server 8000
   # Then visit http://localhost:8000
   ```

## Usage

1. Allow camera access when prompted
2. Configure the number of questions and options per question
3. Input the answer key
4. Capture the OMR sheet using your device's camera
5. Process the image to get results

## Requirements

- Modern web browser (Chrome, Firefox, Edge recommended)
- Camera access
- HTTPS connection (for production use)

## License

MIT License 