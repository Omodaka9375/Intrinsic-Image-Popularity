class ImagePopularityPredictor {
    constructor() {
        this.session = null;
        this.isModelLoaded = false;
        this.currentImageFile = null;
        this.modelCache = null;
        this.isModelLoading = false;
        
        // Configuration
        this.MODEL_URL = 'model.onnx';
        this.MODEL_VERSION = '1.0.0'; // Update this when model changes
        this.CACHE_NAME = 'popscore-model-cache';
        
        this.initializeElements();
        this.attachEventListeners();
        this.initializeModelCache();
    }

    initializeElements() {
        // Get DOM elements
        this.uploadArea = document.getElementById('uploadArea');
        this.fileInput = document.getElementById('fileInput');
        this.uploadSection = document.querySelector('.upload-section')
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
        this.shareBtn = document.getElementById('shareBtn');
        this.modelStatus = document.getElementById('modelStatus');
        this.scoreMeter = document.getElementById('scoreMeter');
        this.scoreRing = document.getElementById('scoreRing');
        
        // Block upload area initially until model loads
        this.setUploadAreaState(false);
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
        
        // Share button
        this.shareBtn.addEventListener('click', this.shareResults.bind(this));
    }

    async initializeModelCache() {
        try {
            this.modelCache = new ModelCacheManager(this.CACHE_NAME, this.MODEL_VERSION);
            await this.loadModel();
        } catch (error) {
            console.error('Failed to initialize model cache:', error);
            this.updateModelStatus('❌ Cache Initialization Failed', false);
            this.setUploadAreaState(false);
        }
    }

    async loadModel() {
        if (this.isModelLoading) return;
        
        this.isModelLoading = true;
        this.setUploadAreaState(false);
        
        try {
            console.log('Initializing ONNX model loading...');
            
            // Set up ONNX Runtime
            ort.env.wasm.wasmPaths = './wasm/';
            
            // Check if model is cached
            let modelData = await this.modelCache.getModel();
            
            if (modelData) {
                console.log('Loading model from cache...');
                this.updateModelStatus('Loading from Cache', false, 'Using cached model for faster loading');
                
                // Load model from cached data
                this.session = await ort.InferenceSession.create(modelData);
            } else {
                console.log('Loading model for first time...');
                this.updateModelStatus('Loading AI Model', false, 'First-time setup - loading model (~80MB)');
                
                // Fetch and cache the model
                const response = await fetch(this.MODEL_URL);
                if (!response.ok) {
                    throw new Error(`Failed to download model: ${response.status}`);
                }
                
                const totalSize = parseInt(response.headers.get('content-length') || '0');
                let downloadedSize = 0;
                
                // Create a readable stream to track download progress
                const reader = response.body.getReader();
                const chunks = [];
                
                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;
                    
                    chunks.push(value);
                    downloadedSize += value.length;
                    
                    // Update progress
                    const progress = totalSize > 0 ? (downloadedSize / totalSize * 100).toFixed(0) : '...';
                    this.updateModelStatus(
                        'Loading AI Model', 
                        false, 
                        `Loaded ${this.formatBytes(downloadedSize)}${totalSize > 0 ? ` of ${this.formatBytes(totalSize)} (${progress}%)` : ''}`
                    );
                }
                
                // Combine chunks into a single ArrayBuffer
                const totalLength = chunks.reduce((acc, chunk) => acc + chunk.length, 0);
                const combinedArray = new Uint8Array(totalLength);
                let offset = 0;
                for (const chunk of chunks) {
                    combinedArray.set(chunk, offset);
                    offset += chunk.length;
                }
                
                modelData = combinedArray.buffer;
                
                // Cache the model for future use
                this.updateModelStatus('Caching Model', false, 'Saving model for faster future loads');
                await this.modelCache.cacheModel(modelData);
                
                // Load the model
                this.updateModelStatus('Initializing AI Engine', false, 'Preparing model for inference');
                this.session = await ort.InferenceSession.create(modelData);
            }
            
            this.isModelLoaded = true;
            this.isModelLoading = false;
            
            console.log('Model loaded successfully');
            this.updateModelStatus('Model loaded', true);
            this.setUploadAreaState(true);
            
        } catch (error) {
            console.error('Failed to load model:', error);
            this.isModelLoading = false;
            this.updateModelStatus('❌ Model Load Failed', false);
            this.setUploadAreaState(false);
            this.showError('Failed to load the AI model. Please refresh the page and try again.');
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

    setUploadAreaState(enabled) {
        if (!this.uploadArea) return;
        
        if (enabled) {
            this.uploadArea.classList.remove('disabled');
            this.uploadArea.style.pointerEvents = 'auto';
            this.uploadArea.style.opacity = '1';
            if (this.fileInput) this.fileInput.disabled = false;
        } else {
            this.uploadArea.classList.add('disabled');
            this.uploadArea.style.pointerEvents = 'none';
            this.uploadArea.style.opacity = '0.6';
            if (this.fileInput) this.fileInput.disabled = true;
        }
    }

    handleFile(file) {
        // Check if model is loaded
        if (!this.isModelLoaded) {
            this.showError('Please wait for the AI model to finish loading.');
            return;
        }
        
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
        
        this.displayImagePreview(file);
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
            this.uploadArea.style.display = 'none';
            this.analyzeBtn.style.display = 'none';
            this.uploadSection.style.display = 'none';
            this.loading.style.display = 'flex';
            this.updateLoadingMessage('Preprocessing image...', '🔄 Preparing your image for analysis');

            // Preprocess image
            const imageData = await this.preprocessImage(this.currentImageFile);
            
this.updateLoadingMessage('Running AI analysis...', '🧠 Our AI is analyzing your image');
            // Run inference
            const score = await this.runInference(imageData);
            
this.updateLoadingMessage('Analyzing image characteristics...', '📊 Calculating detailed insights');
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
if (score >= 4.5) {
            category = '🔥 Viral Ready';
            description = 'This image is primed for viral success! It has multiple elements that drive high engagement on social media.';
            color = '#10B981';
        } else if (score >= 3.0) {
            category = '✨ High Potential';
            description = 'This image has strong appeal and should perform well with your audience. Great choice!';
            color = '#06B6D4';
        } else if (score >= 1.5) {
            category = '📈 Room to Grow';
            description = 'This image has some appealing qualities but could be optimized for better social media performance.';
            color = '#F59E0B';
        } else {
            category = '🔧 Needs Work';
            description = 'This image could benefit from some adjustments to increase its social media appeal.';
            color = '#EF4444';
        }
        
        this.scoreTitle.textContent = category;
        this.scoreDescription.textContent = description;
        
// Animate score ring
        this.animateScoreRing(score);
        
        // Update score meter
        this.updateScoreMeter(score);
        
        // Highlight the appropriate score range
        this.highlightScoreRange(score);
        
        // Update insights with detailed analysis
        this.updateInsights(score, imageAnalysis);
        
        // Show results section
this.resultsSection.style.display = 'block';
        this.resultsSection.classList.add('slide-up');
        
        // Scroll to results
        setTimeout(() => {
            this.resultsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 300);
    }

highlightScoreRange(score) {
        const ranges = document.querySelectorAll('.score-range');
        ranges.forEach(range => range.style.opacity = '0.6');
        
        if (score >= 4.5) {
            ranges[0].style.opacity = '1'; // Viral Ready
        } else if (score >= 3.0) {
            ranges[1].style.opacity = '1'; // High Potential
        } else if (score >= 1.5) {
            ranges[2].style.opacity = '1'; // Room to Grow
        } else {
            ranges[3].style.opacity = '1'; // Needs Work
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
        let totalSaturation = 0, totalVibrancy = 0;
        const pixelCount = width * height;
        
        for (let i = 0; i < data.length; i += 4) {
            const r = data[i];
            const g = data[i + 1];
            const b = data[i + 2];
            
            totalR += r;
            totalG += g;
            totalB += b;
            
            // Calculate brightness
            const brightness = (r + g + b) / 3;
            if (brightness > 200) brightPixels++;
            if (brightness < 50) darkPixels++;
            
            // Calculate saturation (difference between max and min RGB values)
            const max = Math.max(r, g, b);
            const min = Math.min(r, g, b);
            const saturation = max > 0 ? (max - min) / max : 0;
            totalSaturation += saturation;
            
            // Calculate vibrancy (saturation weighted by luminance)
            const luminance = 0.299 * r + 0.587 * g + 0.114 * b;
            const vibrancy = saturation * (luminance / 255);
            totalVibrancy += vibrancy;
        }
        
const avgR = Math.round(totalR / pixelCount);
        const avgG = Math.round(totalG / pixelCount);
        const avgB = Math.round(totalB / pixelCount);
        const avgBrightness = Math.round((avgR + avgG + avgB) / 3);
        const avgSaturation = (totalSaturation / pixelCount * 100).toFixed(1);
        const avgVibrancy = (totalVibrancy / pixelCount * 100).toFixed(1);
        
// Determine dominant color with better logic
        let dominantColor = 'Neutral';
        const colorDifference = 15; // Minimum difference to be considered dominant
        
        if (avgR > avgG + colorDifference && avgR > avgB + colorDifference) {
            dominantColor = 'Warm (Red-toned)';
        } else if (avgG > avgR + colorDifference && avgG > avgB + colorDifference) {
            dominantColor = 'Natural (Green-toned)';
        } else if (avgB > avgR + colorDifference && avgB > avgG + colorDifference) {
            dominantColor = 'Cool (Blue-toned)';
        } else if (Math.abs(avgR - avgG) < colorDifference && Math.abs(avgR - avgB) < colorDifference) {
            dominantColor = 'Balanced';
        }
        
console.log(`Color analysis: brightness=${avgBrightness}, saturation=${avgSaturation}%, vibrancy=${avgVibrancy}%, dominant=${dominantColor}`);
        
        return {
            averageBrightness: avgBrightness,
            dominantColor,
            brightPixelRatio: (brightPixels / pixelCount * 100).toFixed(1),
            darkPixelRatio: (darkPixels / pixelCount * 100).toFixed(1),
            saturation: avgSaturation,
            vibrancy: avgVibrancy,
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
            'Instagram Portrait': 0.8, // 4:5 ratio
            'Instagram Story': 1.78, // 9:16 ratio (not 0.56)
            'Facebook Cover': 2.7, // 2.7:1 ratio
            'Twitter Header': 3.0 // 3:1 ratio
        };
        
        for (const [platform, ratio] of Object.entries(commonRatios)) {
            if (Math.abs(aspectRatio - ratio) < 0.1) {
                socialOptimized = platform;
                break;
            }
        }
        
// Better resolution analysis considering total pixels and pixel density
        const totalPixels = width * height;
        let resolution = 'Low';
        
        if (totalPixels >= 2073600) { // 1920x1080 or equivalent
            resolution = 'High';
        } else if (totalPixels >= 921600) { // 1280x720 or equivalent
            resolution = 'Medium';
        } else if (totalPixels >= 307200) { // 640x480 or equivalent
            resolution = 'Low';
        } else {
            resolution = 'Very Low';
        }
        
        return {
            format,
            orientation,
            aspectRatio,
            socialOptimized,
            resolution,
            totalPixels
        };
    }

    analyzeLighting(data, width, height) {
        let histogram = new Array(256).fill(0);
        const pixelCount = width * height;
        
        for (let i = 0; i < data.length; i += 4) {
            const brightness = Math.round((data[i] + data[i + 1] + data[i + 2]) / 3);
            histogram[brightness]++;
        }
        
// Analyze lighting distribution with better thresholds
        const shadows = histogram.slice(0, 85).reduce((a, b) => a + b, 0) / pixelCount;
        const midtones = histogram.slice(85, 170).reduce((a, b) => a + b, 0) / pixelCount;
        const highlights = histogram.slice(170, 256).reduce((a, b) => a + b, 0) / pixelCount;
        
        console.log(`Lighting analysis: shadows=${(shadows*100).toFixed(1)}%, midtones=${(midtones*100).toFixed(1)}%, highlights=${(highlights*100).toFixed(1)}%`);
        
        let lightingType = 'Balanced';
        
        // More nuanced lighting classification
        if (shadows > 0.5) {
            lightingType = 'Dark/Moody';
        } else if (highlights > 0.4) {
            lightingType = 'Bright/Airy';
        } else if (shadows > 0.35) {
            lightingType = 'Dramatic/Contrasted';
        } else if (midtones > 0.65) {
            lightingType = 'Even/Soft';
        } else {
            lightingType = 'Balanced';
        }
        
        return {
            type: lightingType,
            shadowRatio: (shadows * 100).toFixed(1),
            midtoneRatio: (midtones * 100).toFixed(1),
            highlightRatio: (highlights * 100).toFixed(1)
        };
    }

analyzeSharpness(data, width, height) {
        // Improved sharpness detection using Laplacian-like edge detection
        let totalVariance = 0;
        let sampleCount = 0;
        const step = 4; // Sample every pixel for better accuracy
        
        // Check both horizontal and vertical edges
        for (let y = 1; y < height - 1; y++) {
            for (let x = 1; x < width - 1; x += step) {
                const idx = (y * width + x) * 4;
                
                // Get grayscale values for current pixel and neighbors
                const center = (data[idx] + data[idx + 1] + data[idx + 2]) / 3;
                const left = (data[idx - 4] + data[idx - 3] + data[idx - 2]) / 3;
                const right = (data[idx + 4] + data[idx + 5] + data[idx + 6]) / 3;
                const top = (data[idx - width * 4] + data[idx - width * 4 + 1] + data[idx - width * 4 + 2]) / 3;
                const bottom = (data[idx + width * 4] + data[idx + width * 4 + 1] + data[idx + width * 4 + 2]) / 3;
                
                // Calculate Laplacian-like operator (measures local variation)
                const laplacian = Math.abs(4 * center - left - right - top - bottom);
                totalVariance += laplacian;
                sampleCount++;
            }
        }
        
const avgVariance = totalVariance / sampleCount;
        let sharpnessLevel = 'Medium';
        let sharpnessScore = avgVariance;
        
        // Debug logging
        console.log(`Sharpness analysis: avgVariance = ${avgVariance.toFixed(2)}, samples = ${sampleCount}`);
        
        // More conservative thresholds based on actual edge detection
        if (avgVariance > 15) {
            sharpnessLevel = 'High';
        } else if (avgVariance > 8) {
            sharpnessLevel = 'Medium';
        } else if (avgVariance > 3) {
            sharpnessLevel = 'Low';
        } else {
            sharpnessLevel = 'Very Low';
        }
        
        console.log(`Sharpness result: ${sharpnessLevel} (score: ${avgVariance.toFixed(2)})`);
        
        
        return {
            level: sharpnessLevel,
            edgeStrength: avgVariance.toFixed(1),
            score: sharpnessScore
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
        
// Analyze colors and vibrancy
        if (analysis.colors.averageBrightness > 150 && score >= 2.0) {
            positives.push('Bright images tend to perform well on social media');
        } else if (analysis.colors.averageBrightness < 80) {
            improvements.push('Darker images may struggle for attention in social feeds');
        }
        
        // Analyze saturation and vibrancy
        if (parseFloat(analysis.colors.saturation) > 40) {
            positives.push('Rich, saturated colors create visual impact');
        } else if (parseFloat(analysis.colors.saturation) < 15) {
            improvements.push('More colorful/saturated images often perform better');
        }
        
        if (parseFloat(analysis.colors.vibrancy) > 25) {
            positives.push('Good color vibrancy makes the image pop');
        }
        
        if (analysis.colors.dominantColor !== 'Neutral' && analysis.colors.dominantColor !== 'Balanced') {
            insights.push(`Color palette: ${analysis.colors.dominantColor}`);
        } else if (analysis.colors.dominantColor === 'Balanced') {
            positives.push('Well-balanced color composition');
        }
        
// Analyze sharpness
        if (analysis.sharpness.level === 'High') {
            positives.push('Sharp, crisp image quality enhances detail');
        } else if (analysis.sharpness.level === 'Medium') {
            insights.push(`Moderate sharpness - acceptable for most uses`);
        } else if (analysis.sharpness.level === 'Low') {
            improvements.push('Image appears somewhat blurry - sharper focus would help');
        } else if (analysis.sharpness.level === 'Very Low') {
            improvements.push('Image is very blurry/pixelated - significant focus improvement needed');
        }
        
// Generate score-specific insights
        if (score >= 4.0) {
            insights.push('🔥 This image is hitting all the right notes for viral content!');
            insights.push('🎯 Perfect combination of visual appeal and engagement factors');
        } else if (score >= 2.0) {
            insights.push('✨ This image has strong elements that resonate with social media users');
            insights.push('📱 Should perform well across different social platforms');
        } else if (score >= 0.0) {
            insights.push('💡 Some adjustments could significantly boost this image\'s performance');
            insights.push('🎨 Consider enhancing lighting, composition, or subject matter');
        } else {
            insights.push('🔄 This image would benefit from several optimizations');
            insights.push('💪 Don\'t worry - small changes can make a big difference!');
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
                    <div class="detail-item">
                        <span class="label">Color Saturation:</span>
                        <span class="value">${analysis.colors.saturation}%</span>
                    </div>
                    <div class="detail-item">
                        <span class="label">Vibrancy:</span>
                        <span class="value">${analysis.colors.vibrancy}%</span>
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
        
// Platform-specific and general research-based tips
        html += this.generatePlatformTips(analysis);
        
        html += `
            <div class="detail-section research">
                <h5><i class="fas fa-graduation-cap"></i> General Research Tips</h5>
                <ul class="insight-list">
                    <li>Images with faces receive 38% more engagement across platforms</li>
                    <li>Bright, high-contrast images perform better in feeds</li>
                    <li>Visual storytelling increases emotional connection</li>
                    <li>Consistent posting times improve reach and engagement</li>
                </ul>
            </div>`;
        
        html += `</div>`;
        
insightsContent.innerHTML = html;
    }
    
    generatePlatformTips(analysis) {
        let html = '';
        
        // Check if image is optimized for any platform
        if (analysis.composition.socialOptimized) {
            const platform = analysis.composition.socialOptimized;
            html += `
                <div class="detail-section research">
                    <h5><i class="fas fa-bullseye"></i> ${platform} Optimization</h5>
                    <ul class="insight-list">
                        ${this.getPlatformSpecificTips(platform)}
                    </ul>
                </div>`;
        } else {
            // Provide tips for the most suitable platforms based on aspect ratio
            const aspectRatio = parseFloat(analysis.dimensions.aspectRatio);
            html += `
                <div class="detail-section research">
                    <h5><i class="fas fa-mobile-alt"></i> Platform Recommendations</h5>
                    <ul class="insight-list">
                        ${this.getAspectRatioTips(aspectRatio, analysis.composition.format)}
                    </ul>
                </div>`;
        }
        
        return html;
    }
    
    getPlatformSpecificTips(platform) {
        const tips = {
            'Instagram Square': `
                <li>📸 Perfect for Instagram feed posts - 1:1 ratio maximizes mobile visibility</li>
                <li>🎯 Use eye-catching subjects in the center for better crop tolerance</li>
                <li>📱 Consider carousel posts to tell a story with multiple 1:1 images</li>
                <li>⏰ Post during peak hours: 11am-1pm and 7-9pm for best engagement</li>`,
            'Instagram Portrait': `
                <li>📱 Excellent for Instagram feed - 4:5 ratio takes up more screen space</li>
                <li>👆 Portrait format encourages users to stop scrolling</li>
                <li>🎨 Use the extra vertical space for text overlays or storytelling</li>
                <li>📊 Portrait posts get 23% more engagement than landscape</li>`,
            'Instagram Story': `
                <li>📱 Optimized for Instagram Stories - 9:16 fills the entire screen</li>
                <li>⏳ Stories have 24-hour visibility - perfect for time-sensitive content</li>
                <li>🎯 Add interactive elements: polls, questions, stickers</li>
                <li>📈 Stories are viewed by 500M+ users daily</li>`,
            'Facebook Cover': `
                <li>🖥️ Perfect for Facebook cover photos - displays well on all devices</li>
                <li>📝 Avoid text in center area where profile photo overlaps</li>
                <li>🎨 Use high-quality images as covers get significant visibility</li>
                <li>🔄 Update covers regularly to keep profile fresh</li>`,
            'Twitter Header': `
                <li>🐦 Ideal for Twitter header - 3:1 ratio fits perfectly</li>
                <li>📱 Ensure key elements are visible on mobile (center area)</li>
                <li>🎯 Headers are first impression - use brand colors/messaging</li>
                <li>📊 Profiles with headers get 3x more followers</li>`
        };
        
        return tips[platform] || '';
    }
    
    getAspectRatioTips(aspectRatio, format) {
        let tips = '';
        
        if (aspectRatio > 2.5) {
            // Wide landscape - good for banners
            tips += `
                <li>🖥️ Great for website banners, LinkedIn covers, and YouTube thumbnails</li>
                <li>📊 Consider Facebook cover (2.7:1) or Twitter header (3:1) optimization</li>`;
        } else if (aspectRatio > 1.5) {
            // Standard landscape
            tips += `
                <li>📺 Suitable for YouTube thumbnails and LinkedIn posts</li>
                <li>🖥️ Works well for desktop-focused platforms</li>`;
        } else if (aspectRatio > 1.1) {
            // Slightly landscape - close to square
            tips += `
                <li>📱 Consider cropping to 1:1 square for Instagram feed</li>
                <li>🎯 Close to optimal social media ratios</li>`;
        } else if (aspectRatio > 0.9) {
            // Square-ish
            tips += `
                <li>📸 Perfect for Instagram posts and Facebook feed</li>
                <li>📱 Square format works across most social platforms</li>`;
        } else if (aspectRatio > 0.6) {
            // Portrait
            tips += `
                <li>📱 Ideal for Instagram feed posts and Pinterest pins</li>
                <li>📊 Portrait images get higher engagement on mobile</li>`;
        } else {
            // Tall portrait - story format
            tips += `
                <li>📱 Perfect for Instagram/Facebook Stories and TikTok</li>
                <li>🎬 Vertical video format is trending across platforms</li>`;
        }
        
        return tips;
    }

    reset() {
        this.currentImageFile = null;
        this.fileInput.value = '';
        
        // Hide all sections except upload
        this.uploadArea.style.display = 'block';
        this.previewSection.style.display = 'none';
        this.analysisSection.style.display = 'none';
        this.resultsSection.style.display = 'none';
        this.analyzeBtn.style.display = 'inline';
        this.uploadSection.style.display = 'block';
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

    formatBytes(bytes) {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
    }


    updateModelStatus(message, isReady, description = null) {
        const statusText = this.modelStatus.querySelector('.status-text');
        const statusSpinner = this.modelStatus.querySelector('.status-spinner');
        const statusStrong = statusText.querySelector('strong');
        const statusSpan = statusText.querySelector('span');
        
        if (isReady) {
            statusSpinner.style.display = 'none';
            statusStrong.textContent = message;
            statusSpan.textContent = description || 'Ready to analyze';
            statusStrong.style.color = 'black';
            
            // Hide status after 4 seconds
            setTimeout(() => {
                this.modelStatus.classList.add('hidden');
            }, 4000);
        } else {
            statusSpinner.style.display = 'block';
            statusStrong.textContent = message;
            statusSpan.textContent = description || 'Please wait...';
            //statusStrong.style.color = isReady === false && !description ? '#EF4444' : '#FFFFFF';
        }
    }

    updateLoadingMessage(title, description) {
        const loadingTitle = document.getElementById('loadingTitle');
        const loadingDescription = document.getElementById('loadingDescription');
        if (loadingTitle && loadingDescription) {
            loadingTitle.textContent = title;
            loadingDescription.textContent = description;
        }
    }

animateScoreRing(score) {
        if (!this.scoreRing) return;
        
        // Calculate percentage for score range 0-6
        const minScore = 0;
        const maxScore = 6;
        const normalizedScore = Math.max(0, Math.min(1, (score - minScore) / (maxScore - minScore)));
        
        // Calculate stroke-dashoffset for the ring (377 is circumference: 2 * PI * 60)
        const circumference = 377;
        const offset = circumference - (normalizedScore * circumference);
        
        // Get category color based on score (same as meter and preview card)
        const categoryColor = this.getCategoryColor(score);
        const lighterCategoryColor = this.lightenColor(categoryColor, 30);
        
        console.log(`Score: ${score}, Normalized: ${normalizedScore.toFixed(3)}, Category Color: ${categoryColor}`);
        
        // Update the gradient to use category colors
        const scoreGradient = document.getElementById('scoreGradient');
        if (scoreGradient) {
            // Create a gradient from lighter to darker category color
            scoreGradient.innerHTML = `
                <stop offset="0%" stop-color="${lighterCategoryColor}"/>
                <stop offset="100%" stop-color="${categoryColor}"/>
            `;
        }
        
        // Animate the ring
        setTimeout(() => {
            this.scoreRing.style.strokeDashoffset = offset;
            this.scoreRing.style.transition = 'stroke-dashoffset 2s ease-out';
        }, 500);
    }
    
getScoreColor(score) {
        // Use exact colors from score interpretation ranges
        // Needs Work (0.0-1.5): Red, Room to Grow (1.5-3.0): Orange, High Potential (3.0-4.5): Blue, Viral Ready (4.5-6.0): Green
        
        if (score >= 4.5) {
            return '#166534'; // Viral Ready - Green (from CSS .score-range.excellent)
        } else if (score >= 3.0) {
            return '#1d4ed8'; // High Potential - Blue (from CSS .score-range.good)
        } else if (score >= 1.5) {
            return '#92400e'; // Room to Grow - Orange/Brown (from CSS .score-range.fair)
        } else {
            return '#dc2626'; // Needs Work - Red (from CSS .score-range.poor)
        }
    }
    
    getCategoryColor(score) {
        // Return lighter, more vibrant colors for the meter fill based on the categories shown in the image
        if (score >= 4.5) {
            return '#10B981'; // Viral Ready - Emerald Green
        } else if (score >= 3.0) {
            return '#3B82F6'; // High Potential - Blue
        } else if (score >= 1.5) {
            return '#F59E0B'; // Room to Grow - Amber
        } else {
            return '#EF4444'; // Needs Work - Red
        }
    }
    
    interpolateColor(color1, color2, factor) {
        // Convert hex to RGB
        const c1 = this.hexToRgb(color1);
        const c2 = this.hexToRgb(color2);
        
        // Interpolate
        const r = Math.round(c1.r + (c2.r - c1.r) * factor);
        const g = Math.round(c1.g + (c2.g - c1.g) * factor);
        const b = Math.round(c1.b + (c2.b - c1.b) * factor);
        
        return this.rgbToHex(r, g, b);
    }
    
    hexToRgb(hex) {
        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        return result ? {
            r: parseInt(result[1], 16),
            g: parseInt(result[2], 16),
            b: parseInt(result[3], 16)
        } : null;
    }
    
rgbToHex(r, g, b) {
        return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
    }
    
    lightenColor(hex, percent) {
        // Convert hex to RGB
        const rgb = this.hexToRgb(hex);
        if (!rgb) return hex;
        
        // Lighten each component
        const r = Math.min(255, Math.round(rgb.r + (255 - rgb.r) * (percent / 100)));
        const g = Math.min(255, Math.round(rgb.g + (255 - rgb.g) * (percent / 100)));
        const b = Math.min(255, Math.round(rgb.b + (255 - rgb.b) * (percent / 100)));
        
        return this.rgbToHex(r, g, b);
    }

updateScoreMeter(score) {
        if (!this.scoreMeter) return;
        
        // Calculate percentage for score range 0-6
        const minScore = 0;
        const maxScore = 6;
        const percentage = Math.max(0, Math.min(100, ((score - minScore) / (maxScore - minScore)) * 100));
        
        // Get category color based on score
        const categoryColor = this.getCategoryColor(score);
        
        // Animate the meter with category color
        setTimeout(() => {
            this.scoreMeter.style.width = `${percentage}%`;
            this.scoreMeter.style.background = `linear-gradient(90deg, ${categoryColor}, ${this.lightenColor(categoryColor, 20)})`;
        }, 800);
    }

async shareResults() {
        // Show sharing options modal
        this.showSharingModal();
    }
    
showSharingModal() {
        const scoreValue = this.scoreValue.textContent;
        const scoreTitle = this.scoreTitle.textContent;
        
        // Get category-based colors (same as meter)
        const score = parseFloat(scoreValue);
        const categoryColor = this.getCategoryColor(score);
        const lighterColor = this.lightenColor(categoryColor, 30);
        
        // Create modal overlay
        const modal = document.createElement('div');
        modal.className = 'share-modal-overlay';
        modal.innerHTML = `
            <div class="share-modal">
                <div class="share-header">
                    <h3><i class="fas fa-share-alt"></i> Share Your PopScore</h3>
                    <button class="modal-close" onclick="this.parentElement.parentElement.parentElement.remove()">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                
                <div class="share-preview">
                    <div class="preview-card" style="background: linear-gradient(135deg, ${lighterColor}, ${categoryColor})">
                        <div class="preview-score">
                            <div class="preview-circle">
                                <span class="preview-value">${scoreValue}</span>
                            </div>
                            <div class="preview-title">${scoreTitle}</div>
                        </div>
                        <p class="preview-text">I just discovered my image's viral potential with PopScore AI! 🔥</p>
                    </div>
                </div>
                
                <div class="share-platforms">
                    <h4>Share on Social Media</h4>
                    <div class="platform-buttons">
                        <button class="platform-btn twitter" onclick="popScore.shareToTwitter('${scoreValue}', '${scoreTitle}')">
                            <i class="fab fa-twitter"></i>
                            <span>Twitter</span>
                        </button>
                        <button class="platform-btn facebook" onclick="popScore.shareToFacebook('${scoreValue}', '${scoreTitle}')">
                            <i class="fab fa-facebook-f"></i>
                            <span>Facebook</span>
                        </button>
                        <button class="platform-btn linkedin" onclick="popScore.shareToLinkedIn('${scoreValue}', '${scoreTitle}')">
                            <i class="fab fa-linkedin-in"></i>
                            <span>LinkedIn</span>
                        </button>
                        <button class="platform-btn instagram" onclick="popScore.copyForInstagram('${scoreValue}', '${scoreTitle}')">
                            <i class="fab fa-instagram"></i>
                            <span>Instagram</span>
                        </button>
                    </div>
                    
                    <div class="share-options">
                        <button class="share-option-btn" onclick="popScore.copyShareText('${scoreValue}', '${scoreTitle}')">
                            <i class="fas fa-copy"></i>
                            Copy Share Text
                        </button>
                        <button class="share-option-btn" onclick="popScore.downloadResultCard('${scoreValue}', '${scoreTitle}')">
                            <i class="fas fa-download"></i>
                            Download
                        </button>
                    </div>
                </div>
            </div>
        `;
        
document.body.appendChild(modal);
        modal.classList.add('show');
    }
    
    shareToTwitter(scoreValue, scoreTitle) {
        const text = `🔥 Just got a "${scoreTitle}" rating of ${scoreValue} on PopScore AI! 📸✨\n\nDiscover your image's viral potential with AI-powered analysis!\n\n👉 Try it yourself:`;
        const url = window.location.href;
        const twitterUrl = `https://x.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`;
        window.open(twitterUrl, '_blank', 'width=600,height=400');
        document.querySelector('.share-modal-overlay').remove();
    }
    
    shareToFacebook(scoreValue, scoreTitle) {
        const url = window.location.href;
        const facebookUrl = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}&quote=${encodeURIComponent(`I just discovered my image's viral potential! Got a "${scoreTitle}" rating of ${scoreValue} with PopScore AI \ud83d\udd25\ud83d\udcf8 Try analyzing your images too!`)}`;
        window.open(facebookUrl, '_blank', 'width=600,height=400');
        document.querySelector('.share-modal-overlay').remove();
    }
    
    shareToLinkedIn(scoreValue, scoreTitle) {
        const text = `Fascinating! I just analyzed my image's social media potential with PopScore AI and received a "${scoreTitle}" rating of ${scoreValue}. \n\nThe AI-powered tool analyzes visual content to predict engagement potential - perfect for marketers, creators, and anyone looking to optimize their social media presence. \n\nWorth checking out if you're serious about visual content strategy!`;
        const url = window.location.href;
        const linkedInUrl = `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}&summary=${encodeURIComponent(text)}`;
        window.open(linkedInUrl, '_blank', 'width=600,height=400');
        document.querySelector('.share-modal-overlay').remove();
    }
    
    copyForInstagram(scoreValue, scoreTitle) {
        const text = `🔥 PopScore Results: ${scoreTitle} (${scoreValue})\n\n🎨 Just discovered my image's viral potential with AI! \n\n🤖 PopScore analyzes your photos and predicts how well they'll perform on social media\n\n✨ Features:\n• AI-powered visual analysis\n• Instant engagement predictions\n• Detailed insights & tips\n• Privacy-focused (runs in browser)\n\n👉 Try it yourself! Link in my bio or search "PopScore AI"\n\n#PopScore #AI #SocialMedia #ContentCreator #Photography #ViralContent #MarketingTools`;
        
        navigator.clipboard.writeText(text).then(() => {
            this.showToast('📸 Instagram caption copied! Paste it when you post your image.');
        });
        document.querySelector('.share-modal-overlay').remove();
    }
    
    copyShareText(scoreValue, scoreTitle) {
        const text = `🔥 I just analyzed my image with PopScore AI and got a "${scoreTitle}" rating of ${scoreValue}!\n\n🤖 PopScore uses AI to predict how well your images will perform on social media. It's like having a crystal ball for viral content!\n\n✨ Try it yourself: ${window.location.href}\n\n#PopScore #AI #SocialMedia #ViralContent`;
        
        navigator.clipboard.writeText(text).then(() => {
            this.showToast('📋 Share text copied to clipboard!');
        });
        document.querySelector('.share-modal-overlay').remove();
    }
    
downloadResultCard(scoreValue, scoreTitle) {
        // Create a downloadable result card image
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        
        // Set canvas size
        canvas.width = 800;
        canvas.height = 600;
        
        // Get the category-based color (same as meter)
        const score = parseFloat(scoreValue);
        const categoryColor = this.getCategoryColor(score);
        
        console.log(`Result card - Score: ${score}, Color: ${categoryColor}, Title: ${scoreTitle}`);
        
        // Create a gradient using the category color
        const gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
        // Lighter version of the category color for gradient start
        const lighterColor = this.lightenColor(categoryColor, 20);
        gradient.addColorStop(0, lighterColor);
        gradient.addColorStop(1, categoryColor);
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        // Add pattern overlay
        ctx.globalAlpha = 0.1;
        for (let i = 0; i < canvas.width; i += 60) {
            for (let j = 0; j < canvas.height; j += 60) {
                ctx.beginPath();
                ctx.arc(i + 30, j + 30, 2, 0, Math.PI * 2);
                ctx.fillStyle = 'white';
                ctx.fill();
            }
        }
        ctx.globalAlpha = 1;
        
        // PopScore branding
        ctx.font = 'bold 48px Inter, sans-serif';
        ctx.fillStyle = 'white';
        ctx.textAlign = 'center';
        ctx.fillText('🔥 PopScore', canvas.width / 2, 80);
        
// Score circle with matching color
        ctx.beginPath();
        ctx.arc(canvas.width / 2, 250, 80, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
        ctx.fill();
        
        // Add a subtle border with category color
        ctx.beginPath();
        ctx.arc(canvas.width / 2, 250, 80, 0, Math.PI * 2);
        ctx.strokeStyle = categoryColor;
        ctx.lineWidth = 4;
        ctx.stroke();
        
        // Score value
        ctx.font = 'bold 64px Inter, sans-serif';
        ctx.fillStyle = '#2d3436';
        ctx.fillText(scoreValue, canvas.width / 2, 270);
        
        // Score title
        ctx.font = 'bold 36px Inter, sans-serif';
        ctx.fillStyle = 'white';
        ctx.fillText(scoreTitle, canvas.width / 2, 380);
        
        // Description
        ctx.font = '24px Inter, sans-serif';
        ctx.fillText('AI-Powered Social Media Image Analysis', canvas.width / 2, 420);
        
        // Call to action
        ctx.font = '20px Inter, sans-serif';
        ctx.fillText('Try PopScore yourself!', canvas.width / 2, 500);
        ctx.fillText(window.location.origin, canvas.width / 2, 530);
        
        // Download the image
        const link = document.createElement('a');
        link.download = `PopScore-${scoreValue}-${scoreTitle.replace(/[^a-z0-9]/gi, '')}.png`;
        link.href = canvas.toDataURL();
        link.click();
        
        document.querySelector('.share-modal-overlay').remove();
        this.showToast('💾 Result card downloaded! Share it on your social media.');
    }

    showToast(message) {
        // Create toast notification
        const toast = document.createElement('div');
        toast.style.cssText = `
            position: fixed;
            top: 20px;
            left: 50%;
            transform: translateX(-50%);
            background: rgba(0, 0, 0, 0.8);
            color: white;
            padding: 12px 24px;
            border-radius: 24px;
            font-size: 14px;
            font-weight: 500;
            z-index: 10000;
            backdrop-filter: blur(10px);
            animation: slideDown 0.3s ease-out;
        `;
        toast.textContent = message;
        
        document.body.appendChild(toast);
        
        setTimeout(() => {
            toast.remove();
        }, 3000);
    }

    showError(message) {
        this.showToast(`⚠️ ${message}`);
    }
}

// Model Cache Manager using IndexedDB
class ModelCacheManager {
    constructor(cacheName, version) {
        this.cacheName = cacheName;
        this.version = version;
        this.dbName = 'PopScoreModelDB';
        this.storeName = 'models';
        this.db = null;
    }

    async initDB() {
        if (this.db) return this.db;

        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, 1);

            request.onerror = () => reject(request.error);
            request.onsuccess = () => {
                this.db = request.result;
                resolve(this.db);
            };

            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                if (!db.objectStoreNames.contains(this.storeName)) {
                    const store = db.createObjectStore(this.storeName, { keyPath: 'key' });
                    store.createIndex('version', 'version', { unique: false });
                    store.createIndex('timestamp', 'timestamp', { unique: false });
                }
            };
        });
    }

    async cacheModel(modelData) {
        try {
            await this.initDB();
            
            const transaction = this.db.transaction([this.storeName], 'readwrite');
            const store = transaction.objectStore(this.storeName);
            
            const cacheEntry = {
                key: this.cacheName,
                version: this.version,
                timestamp: Date.now(),
                data: modelData,
                size: modelData.byteLength
            };

            await new Promise((resolve, reject) => {
                const request = store.put(cacheEntry);
                request.onsuccess = () => resolve(request.result);
                request.onerror = () => reject(request.error);
            });

            console.log(`Model cached successfully (${this.formatBytes(modelData.byteLength)})`);
            return true;
        } catch (error) {
            console.error('Failed to cache model:', error);
            return false;
        }
    }

    async getModel() {
        try {
            await this.initDB();
            
            const transaction = this.db.transaction([this.storeName], 'readonly');
            const store = transaction.objectStore(this.storeName);
            
            const cacheEntry = await new Promise((resolve, reject) => {
                const request = store.get(this.cacheName);
                request.onsuccess = () => resolve(request.result);
                request.onerror = () => reject(request.error);
            });

            if (!cacheEntry) {
                console.log('No cached model found');
                return null;
            }

            // Check version compatibility
            if (cacheEntry.version !== this.version) {
                console.log(`Cached model version (${cacheEntry.version}) doesn't match current (${this.version}), invalidating cache`);
                await this.clearCache();
                return null;
            }

            // Check if cache is too old (30 days)
            const thirtyDays = 30 * 24 * 60 * 60 * 1000;
            if (Date.now() - cacheEntry.timestamp > thirtyDays) {
                console.log('Cached model is too old, invalidating cache');
                await this.clearCache();
                return null;
            }

            console.log(`Found cached model (${this.formatBytes(cacheEntry.size)}, cached ${this.formatTimeSince(cacheEntry.timestamp)} ago)`);
            return cacheEntry.data;
        } catch (error) {
            console.error('Failed to retrieve cached model:', error);
            return null;
        }
    }

    async clearCache() {
        try {
            await this.initDB();
            
            const transaction = this.db.transaction([this.storeName], 'readwrite');
            const store = transaction.objectStore(this.storeName);
            
            await new Promise((resolve, reject) => {
                const request = store.delete(this.cacheName);
                request.onsuccess = () => resolve(request.result);
                request.onerror = () => reject(request.error);
            });

            console.log('Model cache cleared');
            return true;
        } catch (error) {
            console.error('Failed to clear cache:', error);
            return false;
        }
    }

    async getCacheInfo() {
        try {
            await this.initDB();
            
            const transaction = this.db.transaction([this.storeName], 'readonly');
            const store = transaction.objectStore(this.storeName);
            
            const cacheEntry = await new Promise((resolve, reject) => {
                const request = store.get(this.cacheName);
                request.onsuccess = () => resolve(request.result);
                request.onerror = () => reject(request.error);
            });

            if (!cacheEntry) return null;

            return {
                version: cacheEntry.version,
                timestamp: cacheEntry.timestamp,
                size: cacheEntry.size,
                age: Date.now() - cacheEntry.timestamp
            };
        } catch (error) {
            console.error('Failed to get cache info:', error);
            return null;
        }
    }

    formatBytes(bytes) {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
    }

    formatTimeSince(timestamp) {
        const seconds = Math.floor((Date.now() - timestamp) / 1000);
        
        if (seconds < 60) return `${seconds} seconds`;
        
        const minutes = Math.floor(seconds / 60);
        if (minutes < 60) return `${minutes} minute${minutes > 1 ? 's' : ''}`;
        
        const hours = Math.floor(minutes / 60);
        if (hours < 24) return `${hours} hour${hours > 1 ? 's' : ''}`;
        
        const days = Math.floor(hours / 24);
        return `${days} day${days > 1 ? 's' : ''}`;
    }
}

// Initialize the application when DOM is loaded
let popScore;
document.addEventListener('DOMContentLoaded', () => {
    popScore = new ImagePopularityPredictor();
});
