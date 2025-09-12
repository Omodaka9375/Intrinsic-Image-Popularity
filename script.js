class ImagePopularityPredictor {
    constructor() {
        this.session = null;
        this.isModelLoaded = false;
        this.currentImageFile = null;
        
        this.initializeElements();
        this.attachEventListeners();
        this.loadModel();
    }

    initializeElements() {
        // Get DOM elements
        this.uploadArea = document.getElementById('uploadArea');
        this.fileInput = document.getElementById('fileInput');
        this.fileInfo = document.getElementById('fileInfo');
        this.fileName = document.getElementById('fileName');
        this.fileSize = document.getElementById('fileSize');
        this.removeFileBtn = document.getElementById('removeFile');
        this.previewSection = document.getElementById('previewSection');
        this.imagePreview = document.getElementById('imagePreview');
        this.imageDimensions = document.getElementById('imageDimensions');
        this.analysisSection = document.getElementById('analysisSection');
        this.analyzeBtn = document.getElementById('analyzeBtn');
        this.loading = document.getElementById('loading');
        this.resultsSection = document.getElementById('resultsSection');
        this.scoreValue = document.getElementById('scoreValue');
        this.scoreTitle = document.getElementById('scoreTitle');
        this.scoreDescription = document.getElementById('scoreDescription');
        this.resetBtn = document.getElementById('resetBtn');
        this.modelStatus = document.getElementById('modelStatus');
    }

    attachEventListeners() {
        // Upload area events
        this.uploadArea.addEventListener('click', () => this.fileInput.click());
        this.uploadArea.addEventListener('dragover', this.handleDragOver.bind(this));
        this.uploadArea.addEventListener('dragleave', this.handleDragLeave.bind(this));
        this.uploadArea.addEventListener('drop', this.handleDrop.bind(this));
        
        // File input
        this.fileInput.addEventListener('change', this.handleFileSelect.bind(this));
        
        // Browse button
        document.querySelector('.browse-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            this.fileInput.click();
        });
        
        // Remove file
        this.removeFileBtn.addEventListener('click', this.removeFile.bind(this));
        
        // Analyze button
        this.analyzeBtn.addEventListener('click', this.analyzeImage.bind(this));
        
        // Reset button
        this.resetBtn.addEventListener('click', this.reset.bind(this));
    }

    async loadModel() {
        try {
            console.log('Loading ONNX model...');
            // Set up ONNX Runtime
            ort.env.wasm.wasmPaths = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.19.0/dist/';
            
            // Load the model
            this.session = await ort.InferenceSession.create('model.onnx');
            this.isModelLoaded = true;
            
            console.log('Model loaded successfully');
            this.updateModelStatus('Model ready', true);
        } catch (error) {
            console.error('Failed to load model:', error);
            this.updateModelStatus('Model failed to load', false);
            this.showError('Failed to load the AI model. Please refresh the page and try again.');
        }
    }

    updateModelStatus(message, isReady) {
        const statusContent = this.modelStatus.querySelector('.status-content');
        const spinner = statusContent.querySelector('.spinner-small');
        const text = statusContent.querySelector('span');
        
        if (isReady) {
            spinner.style.display = 'none';
            text.textContent = message;
            text.style.color = '#10b981';
            
            // Hide status after 2 seconds
            setTimeout(() => {
                this.modelStatus.classList.add('hidden');
            }, 2000);
        } else {
            text.textContent = message;
            text.style.color = '#ef4444';
        }
    }

    handleDragOver(e) {
        e.preventDefault();
        this.uploadArea.classList.add('drag-over');
    }

    handleDragLeave(e) {
        e.preventDefault();
        this.uploadArea.classList.remove('drag-over');
    }

    handleDrop(e) {
        e.preventDefault();
        this.uploadArea.classList.remove('drag-over');
        
        const files = e.dataTransfer.files;
        if (files.length > 0) {
            this.handleFile(files[0]);
        }
    }

    handleFileSelect(e) {
        const files = e.target.files;
        if (files.length > 0) {
            this.handleFile(files[0]);
        }
    }

    handleFile(file) {
        // Validate file type
        if (!file.type.startsWith('image/')) {
            this.showError('Please select a valid image file.');
            return;
        }

        // Validate file size (max 10MB)
        if (file.size > 10 * 1024 * 1024) {
            this.showError('File size must be less than 10MB.');
            return;
        }

        this.currentImageFile = file;
        this.displayFileInfo(file);
        this.displayImagePreview(file);
    }

    displayFileInfo(file) {
        this.fileName.textContent = file.name;
        this.fileSize.textContent = this.formatFileSize(file.size);
        
        this.uploadArea.style.display = 'none';
        this.fileInfo.style.display = 'flex';
        this.fileInfo.classList.add('fade-in');
    }

    displayImagePreview(file) {
        const reader = new FileReader();
        
        reader.onload = (e) => {
            this.imagePreview.src = e.target.result;
            this.imagePreview.onload = () => {
                const { naturalWidth, naturalHeight } = this.imagePreview;
                this.imageDimensions.textContent = `${naturalWidth} × ${naturalHeight} pixels`;
                
                this.previewSection.style.display = 'block';
                this.previewSection.classList.add('slide-up');
                
                this.analysisSection.style.display = 'block';
                this.analysisSection.classList.add('slide-up');
            };
        };
        
        reader.readAsDataURL(file);
    }

    removeFile() {
        this.currentImageFile = null;
        this.fileInput.value = '';
        
        this.uploadArea.style.display = 'block';
        this.fileInfo.style.display = 'none';
        this.previewSection.style.display = 'none';
        this.analysisSection.style.display = 'none';
        this.resultsSection.style.display = 'none';
    }

    async analyzeImage() {
        if (!this.currentImageFile || !this.isModelLoaded) {
            this.showError('Please select an image and wait for the model to load.');
            return;
        }

        try {
            // Show loading
            this.analyzeBtn.style.display = 'none';
            this.loading.style.display = 'flex';
            this.updateLoadingMessage('Preprocessing image...');

            // Preprocess image
            const imageData = await this.preprocessImage(this.currentImageFile);
            
            this.updateLoadingMessage('Running AI analysis...');
            // Run inference
            const score = await this.runInference(imageData);
            
            this.updateLoadingMessage('Analyzing image characteristics...');
            // Display results
            await this.displayResults(score);
            
        } catch (error) {
            console.error('Analysis failed:', error);
            this.showError('Failed to analyze the image. Please try again.');
        } finally {
            this.loading.style.display = 'none';
        }
    }

    async preprocessImage(file) {
        return new Promise((resolve, reject) => {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            const img = new Image();
            
            img.onload = () => {
                try {
                    // Resize to 224x224 (same as PyTorch model)
                    canvas.width = 224;
                    canvas.height = 224;
                    
                    // Draw and resize image
                    ctx.drawImage(img, 0, 0, 224, 224);
                    
                    // Get image data
                    const imageData = ctx.getImageData(0, 0, 224, 224);
                    const data = imageData.data;
                    
                    // Convert to tensor format [1, 3, 224, 224]
                    // The Python version only uses ToTensor() which converts to [0, 1] range
                    // NO ImageNet normalization is applied in the original model
                    const tensorData = new Float32Array(1 * 3 * 224 * 224);
                    let idx = 0;
                    
                    // Separate RGB channels and convert to [0, 1] range (same as PyTorch ToTensor())
                    for (let c = 0; c < 3; c++) {
                        for (let h = 0; h < 224; h++) {
                            for (let w = 0; w < 224; w++) {
                                const pixelIdx = (h * 224 + w) * 4; // RGBA format
                                const pixelValue = data[pixelIdx + c] / 255.0; // Normalize to [0, 1] only
                                tensorData[idx++] = pixelValue;
                            }
                        }
                    }
                    
                    resolve(tensorData);
                } catch (error) {
                    reject(error);
                }
            };
            
            img.onerror = () => reject(new Error('Failed to load image'));
            img.src = URL.createObjectURL(file);
        });
    }

    async runInference(imageData) {
        try {
            // Create input tensor
            const inputTensor = new ort.Tensor('float32', imageData, [1, 3, 224, 224]);
            
            // Run inference
            const feeds = { input: inputTensor };
            const results = await this.session.run(feeds);
            
            // Get output
            const output = results.output;
            const score = output.data[0];
            
            return score;
        } catch (error) {
            console.error('Inference failed:', error);
            throw new Error('Model inference failed');
        }
    }

    async displayResults(score) {
        // Update score display
        this.scoreValue.textContent = score.toFixed(2);
        
        // Analyze image characteristics
        const imageAnalysis = await this.analyzeImageCharacteristics();
        
        // Determine score category and description
        let category, description, color;
        if (score >= 4.0) {
            category = 'Excellent';
            description = 'This image has exceptional viral potential! It contains highly engaging visual elements.';
            color = '#10b981';
        } else if (score >= 2.0) {
            category = 'Good';
            description = 'This image shows good potential for engagement with appealing visual content.';
            color = '#3b82f6';
        } else if (score >= 0.0) {
            category = 'Fair';
            description = 'This image has moderate appeal and may receive average engagement.';
            color = '#f59e0b';
        } else {
            category = 'Poor';
            description = 'This image may struggle to gain traction on social media platforms.';
            color = '#ef4444';
        }
        
        this.scoreTitle.textContent = category;
        this.scoreDescription.textContent = description;
        
        // Update score circle color
        const scoreCircle = document.querySelector('.score-circle');
        scoreCircle.style.background = `linear-gradient(135deg, ${color}, #06b6d4)`;
        
        // Highlight the appropriate score range
        this.highlightScoreRange(score);
        
        // Update insights with detailed analysis
        this.updateInsights(score, imageAnalysis);
        
        // Show results section
        this.resultsSection.style.display = 'block';
        this.resultsSection.classList.add('slide-up');
    }

    highlightScoreRange(score) {
        const ranges = document.querySelectorAll('.score-range');
        ranges.forEach(range => range.style.opacity = '0.6');
        
        if (score >= 4.0) {
            ranges[0].style.opacity = '1'; // Excellent
        } else if (score >= 2.0) {
            ranges[1].style.opacity = '1'; // Good
        } else if (score >= 0.0) {
            ranges[2].style.opacity = '1'; // Fair
        } else {
            ranges[3].style.opacity = '1'; // Poor
        }
    }

    async analyzeImageCharacteristics() {
        return new Promise((resolve) => {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            const img = this.imagePreview;
            
            canvas.width = img.naturalWidth;
            canvas.height = img.naturalHeight;
            ctx.drawImage(img, 0, 0);
            
            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const data = imageData.data;
            
            // Analyze various image characteristics
            const analysis = {
                dimensions: {
                    width: img.naturalWidth,
                    height: img.naturalHeight,
                    aspectRatio: (img.naturalWidth / img.naturalHeight).toFixed(2),
                    megapixels: ((img.naturalWidth * img.naturalHeight) / 1000000).toFixed(1)
                },
                colors: this.analyzeColors(data, canvas.width, canvas.height),
                composition: this.analyzeComposition(img.naturalWidth, img.naturalHeight),
                lighting: this.analyzeLighting(data, canvas.width, canvas.height),
                sharpness: this.analyzeSharpness(data, canvas.width, canvas.height)
            };
            
            resolve(analysis);
        });
    }

    analyzeColors(data, width, height) {
        let totalR = 0, totalG = 0, totalB = 0;
        let brightPixels = 0, darkPixels = 0;
        const pixelCount = width * height;
        
        for (let i = 0; i < data.length; i += 4) {
            const r = data[i];
            const g = data[i + 1];
            const b = data[i + 2];
            
            totalR += r;
            totalG += g;
            totalB += b;
            
            const brightness = (r + g + b) / 3;
            if (brightness > 200) brightPixels++;
            if (brightness < 50) darkPixels++;
        }
        
        const avgR = Math.round(totalR / pixelCount);
        const avgG = Math.round(totalG / pixelCount);
        const avgB = Math.round(totalB / pixelCount);
        const avgBrightness = Math.round((avgR + avgG + avgB) / 3);
        
        // Determine dominant color
        let dominantColor = 'Neutral';
        if (avgR > avgG && avgR > avgB) dominantColor = 'Warm (Red-toned)';
        else if (avgG > avgR && avgG > avgB) dominantColor = 'Natural (Green-toned)';
        else if (avgB > avgR && avgB > avgG) dominantColor = 'Cool (Blue-toned)';
        
        return {
            averageBrightness: avgBrightness,
            dominantColor,
            brightPixelRatio: (brightPixels / pixelCount * 100).toFixed(1),
            darkPixelRatio: (darkPixels / pixelCount * 100).toFixed(1),
            colorBalance: { r: avgR, g: avgG, b: avgB }
        };
    }

    analyzeComposition(width, height) {
        const aspectRatio = width / height;
        let format = 'Square';
        let orientation = 'Square';
        
        if (aspectRatio > 1.3) {
            format = 'Landscape';
            orientation = 'Horizontal';
        } else if (aspectRatio < 0.8) {
            format = 'Portrait';
            orientation = 'Vertical';
        }
        
        // Check if it matches social media optimal ratios
        let socialOptimized = false;
        const commonRatios = {
            'Instagram Square': 1.0,
            'Instagram Portrait': 0.8,
            'Instagram Story': 0.56,
            'Facebook Cover': 2.7,
            'Twitter Header': 3.0
        };
        
        for (const [platform, ratio] of Object.entries(commonRatios)) {
            if (Math.abs(aspectRatio - ratio) < 0.1) {
                socialOptimized = platform;
                break;
            }
        }
        
        return {
            format,
            orientation,
            aspectRatio,
            socialOptimized,
            resolution: width >= 1080 ? 'High' : width >= 720 ? 'Medium' : 'Low'
        };
    }

    analyzeLighting(data, width, height) {
        let histogram = new Array(256).fill(0);
        const pixelCount = width * height;
        
        for (let i = 0; i < data.length; i += 4) {
            const brightness = Math.round((data[i] + data[i + 1] + data[i + 2]) / 3);
            histogram[brightness]++;
        }
        
        // Find peaks in histogram
        const shadows = histogram.slice(0, 85).reduce((a, b) => a + b, 0) / pixelCount;
        const midtones = histogram.slice(85, 170).reduce((a, b) => a + b, 0) / pixelCount;
        const highlights = histogram.slice(170, 256).reduce((a, b) => a + b, 0) / pixelCount;
        
        let lightingType = 'Balanced';
        if (shadows > 0.4) lightingType = 'Dramatic/Moody';
        else if (highlights > 0.3) lightingType = 'Bright/Airy';
        else if (midtones > 0.6) lightingType = 'Even/Soft';
        
        return {
            type: lightingType,
            shadowRatio: (shadows * 100).toFixed(1),
            midtoneRatio: (midtones * 100).toFixed(1),
            highlightRatio: (highlights * 100).toFixed(1)
        };
    }

    analyzeSharpness(data, width, height) {
        // Simple edge detection for sharpness estimation
        let edgeStrength = 0;
        const sampleSize = Math.min(10000, width * height); // Sample for performance
        const step = Math.floor((width * height) / sampleSize);
        
        for (let i = 0; i < data.length - width * 4; i += step * 4) {
            const currentPixel = (data[i] + data[i + 1] + data[i + 2]) / 3;
            const nextPixel = (data[i + width * 4] + data[i + width * 4 + 1] + data[i + width * 4 + 2]) / 3;
            edgeStrength += Math.abs(currentPixel - nextPixel);
        }
        
        const avgEdgeStrength = edgeStrength / (sampleSize / step);
        let sharpnessLevel = 'Medium';
        
        if (avgEdgeStrength > 25) sharpnessLevel = 'High';
        else if (avgEdgeStrength < 10) sharpnessLevel = 'Low';
        
        return {
            level: sharpnessLevel,
            edgeStrength: avgEdgeStrength.toFixed(1)
        };
    }

    updateInsights(score, analysis) {
        const insightsContent = document.getElementById('insights');
        
        // Generate detailed analysis
        let insights = [];
        let positives = [];
        let improvements = [];
        
        // Analyze dimensions and resolution
        if (analysis.dimensions.megapixels > 2) {
            positives.push(`High resolution (${analysis.dimensions.megapixels}MP) - great for detail`);
        } else if (analysis.dimensions.megapixels < 0.5) {
            improvements.push('Higher resolution would improve image quality');
        }
        
        // Analyze social media optimization
        if (analysis.composition.socialOptimized) {
            positives.push(`Optimized for ${analysis.composition.socialOptimized}`);
        } else {
            insights.push(`Format: ${analysis.composition.format} (${analysis.dimensions.aspectRatio}:1 ratio)`);
        }
        
        // Analyze lighting
        if (analysis.lighting.type === 'Bright/Airy' && score >= 2.0) {
            positives.push('Bright, airy lighting appeals to social media audiences');
        } else if (analysis.lighting.type === 'Dramatic/Moody' && score >= 3.0) {
            positives.push('Dramatic lighting creates visual impact');
        } else if (analysis.lighting.type === 'Even/Soft') {
            if (score >= 2.0) {
                positives.push('Soft, even lighting provides professional look');
            } else {
                improvements.push('Try more dynamic lighting for greater visual interest');
            }
        }
        
        // Analyze colors
        if (analysis.colors.averageBrightness > 150 && score >= 2.0) {
            positives.push('Bright images tend to perform well on social media');
        } else if (analysis.colors.averageBrightness < 80 && score < 2.0) {
            improvements.push('Darker images may struggle for attention in social feeds');
        }
        
        if (analysis.colors.dominantColor !== 'Neutral') {
            insights.push(`Color palette: ${analysis.colors.dominantColor}`);
        }
        
        // Analyze sharpness
        if (analysis.sharpness.level === 'High') {
            positives.push('Sharp, crisp image quality');
        } else if (analysis.sharpness.level === 'Low') {
            improvements.push('Sharper focus could improve visual appeal');
        }
        
        // Generate score-specific insights
        if (score >= 4.0) {
            insights.push('🌟 This image has multiple viral elements working together!');
        } else if (score >= 2.0) {
            insights.push('✨ This image has good engagement potential');
        } else if (score >= 0.0) {
            insights.push('📈 Room for improvement to increase engagement');
        } else {
            insights.push('🔧 Several factors could be optimized for better performance');
        }
        
        // Build the insights HTML
        let html = `<div class="analysis-details">`;
        
        // Image technical details
        html += `
            <div class="detail-section">
                <h5><i class="fas fa-info-circle"></i> Image Details</h5>
                <div class="detail-grid">
                    <div class="detail-item">
                        <span class="label">Resolution:</span>
                        <span class="value">${analysis.dimensions.width} × ${analysis.dimensions.height} (${analysis.dimensions.megapixels}MP)</span>
                    </div>
                    <div class="detail-item">
                        <span class="label">Format:</span>
                        <span class="value">${analysis.composition.format} • ${analysis.composition.resolution} Quality</span>
                    </div>
                    <div class="detail-item">
                        <span class="label">Lighting:</span>
                        <span class="value">${analysis.lighting.type}</span>
                    </div>
                    <div class="detail-item">
                        <span class="label">Sharpness:</span>
                        <span class="value">${analysis.sharpness.level}</span>
                    </div>
                </div>
            </div>`;
        
        // Positive aspects
        if (positives.length > 0) {
            html += `
                <div class="detail-section positive">
                    <h5><i class="fas fa-thumbs-up"></i> What's Working Well</h5>
                    <ul class="insight-list">`;
            positives.forEach(positive => {
                html += `<li class="positive-item">${positive}</li>`;
            });
            html += `</ul></div>`;
        }
        
        // General insights
        if (insights.length > 0) {
            html += `
                <div class="detail-section">
                    <h5><i class="fas fa-lightbulb"></i> Key Insights</h5>
                    <ul class="insight-list">`;
            insights.forEach(insight => {
                html += `<li>${insight}</li>`;
            });
            html += `</ul></div>`;
        }
        
        // Improvement suggestions
        if (improvements.length > 0) {
            html += `
                <div class="detail-section improvement">
                    <h5><i class="fas fa-arrow-up"></i> Potential Improvements</h5>
                    <ul class="insight-list">`;
            improvements.forEach(improvement => {
                html += `<li class="improvement-item">${improvement}</li>`;
            });
            html += `</ul></div>`;
        }
        
        // Research-based tips
        html += `
            <div class="detail-section research">
                <h5><i class="fas fa-graduation-cap"></i> Research-Based Tips</h5>
                <ul class="insight-list">
                    <li>Images with faces receive 38% more engagement</li>
                    <li>Bright, high-contrast images perform better in feeds</li>
                    <li>Square and portrait formats optimize for mobile viewing</li>
                    <li>Visual storytelling increases emotional connection</li>
                </ul>
            </div>`;
        
        html += `</div>`;
        
        insightsContent.innerHTML = html;
    }

    reset() {
        this.currentImageFile = null;
        this.fileInput.value = '';
        
        // Hide all sections except upload
        this.uploadArea.style.display = 'block';
        this.fileInfo.style.display = 'none';
        this.previewSection.style.display = 'none';
        this.analysisSection.style.display = 'none';
        this.resultsSection.style.display = 'none';
        this.analyzeBtn.style.display = 'block';
        this.loading.style.display = 'none';
        
        // Reset score range highlighting
        const ranges = document.querySelectorAll('.score-range');
        ranges.forEach(range => range.style.opacity = '1');
    }

    formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    updateLoadingMessage(message) {
        const loadingText = this.loading.querySelector('p');
        if (loadingText) {
            loadingText.textContent = message;
        }
    }

    showError(message) {
        // Simple error display - in production, you might want a more sophisticated error UI
        alert(message);
    }
}

// Initialize the application when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new ImagePopularityPredictor();
});