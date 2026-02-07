/**
 * Memorial Slideshow
 * A responsive vanilla JS + Anime.js slideshow for memorial services
 */

class MemorialSlideshow {
    constructor() {
        this.slides = [];
        this.currentIndex = 0;
        this.isTransitioning = false;
        this.settings = {
            defaultDuration: 8000,
            defaultTransitionDuration: 1500,
            startSlideDuration: 15000,
            verseDuration: 10000,
            kenBurnsEnabled: true
        };

        // DOM elements
        this.container = document.getElementById('slideshow-container');
        this.currentSlide = document.getElementById('current-slide');
        this.nextSlide = document.getElementById('next-slide');
        this.transitionOverlay = document.getElementById('transition-overlay');

        // Ken Burns state
        this.kenBurnsAnimation = null;

        // Verse card colors
        this.verseColors = [
            { background: '#9CAF88', text: '#FFFFFF' },  // Sage green
            { background: '#8BA4B4', text: '#FFFFFF' },  // Soft blue
            { background: '#F5F0E6', text: '#333333' },  // Warm cream
            { background: '#C9B1A1', text: '#FFFFFF' },  // Dusty rose
            { background: '#B8A9C9', text: '#FFFFFF' }   // Muted lavender
        ];

        // Transition types
        this.transitions = [
            'slideLeft',
            'slideRight',
            'slideUp',
            'slideDown',
            'fadeBlack',
            'fadeWhite',
            'hearts',
            'heavensLight'
        ];

        // Bind methods
        this.handleResize = this.handleResize.bind(this);
        this.handleOrientationChange = this.handleOrientationChange.bind(this);
        this.toggleFullscreen = this.toggleFullscreen.bind(this);
    }

    async init() {
        try {
            // Load presentation config
            const response = await fetch('presentation.json');
            const config = await response.json();

            this.settings = { ...this.settings, ...config.settings };
            this.slides = config.slides;

            // Setup event listeners
            window.addEventListener('resize', this.handleResize);
            window.addEventListener('orientationchange', this.handleOrientationChange);
            // Double-tap to toggle fullscreen
            let lastTap = 0;
            this.container.addEventListener('touchend', (e) => {
                const now = Date.now();
                if (now - lastTap < 300) {
                    e.preventDefault();
                    this.toggleFullscreen();
                }
                lastTap = now;
            });
            this.container.addEventListener('dblclick', this.toggleFullscreen);

            // Preload first few images
            await this.preloadSlides(0, 3);

            // Start slideshow
            this.showSlide(0);

        } catch (error) {
            console.error('Failed to initialize slideshow:', error);
            this.showError('Failed to load presentation. Please check presentation.json exists.');
        }
    }

    async preloadSlides(startIndex, count) {
        const promises = [];
        for (let i = startIndex; i < Math.min(startIndex + count, this.slides.length); i++) {
            const slide = this.slides[i];
            if (slide.type === 'photo') {
                promises.push(this.preloadImage(slide.src));
            }
        }
        await Promise.all(promises);
    }

    preloadImage(src) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = reject;
            img.src = src;
        });
    }

    showSlide(index) {
        if (this.isTransitioning) return;

        const slide = this.slides[index];
        this.currentIndex = index;

        // Setup slide content
        this.setupSlideContent(this.currentSlide, slide);

        // Prepare Ken Burns before showing (sets initial transform)
        let kenBurnsParams = null;
        if (slide.type === 'photo' && (slide.kenBurns ?? this.settings.kenBurnsEnabled)) {
            kenBurnsParams = this.prepareKenBurns(this.currentSlide, slide);
        }

        // Make current slide active
        this.currentSlide.classList.add('active');
        this.currentSlide.style.opacity = '1';
        this.currentSlide.style.visibility = 'visible';
        this.currentSlide.style.transform = 'translate(0, 0)';

        // Start Ken Burns animation after slide is visible
        if (kenBurnsParams) {
            this.startKenBurns(kenBurnsParams);
        }

        // Preload next slides
        const nextIndex = (index + 1) % this.slides.length;
        this.preloadSlides(nextIndex, 2);

        // Get duration
        const duration = slide.duration ||
            (slide.type === 'verse' ? this.settings.verseDuration : this.settings.defaultDuration);

        // For verse slides, schedule the English->Thai transition
        if (slide.type === 'verse') {
            // Show English for first half, then crossfade to Thai
            setTimeout(() => {
                this.crossfadeToThai(this.currentSlide);
            }, duration);

            // Total time = English duration + Thai duration
            setTimeout(() => {
                this.transitionToNext();
            }, duration * 2);
        } else {
            // For photo slides, just schedule next slide
            setTimeout(() => {
                this.transitionToNext();
            }, duration);
        }
    }

    crossfadeToThai(slideElement) {
        const verseEnglish = slideElement.querySelector('.verse-english');
        const verseThai = slideElement.querySelector('.verse-thai');
        const refEnglish = slideElement.querySelector('.verse-ref-english');
        const refThai = slideElement.querySelector('.verse-ref-thai');

        // Fade out English
        anime({
            targets: [verseEnglish, refEnglish],
            opacity: 0,
            duration: 800,
            easing: 'easeInOutQuad',
            complete: () => {
                // Swap visibility
                verseEnglish.classList.add('hidden');
                refEnglish.classList.add('hidden');
                verseThai.classList.add('visible');
                refThai.classList.add('visible');

                // Fade in Thai
                anime({
                    targets: [verseThai, refThai],
                    opacity: [0, 1],
                    duration: 800,
                    easing: 'easeInOutQuad'
                });
            }
        });
    }

    setupSlideContent(slideElement, slideData) {
        const img = slideElement.querySelector('.slide-image');
        const verseEnglish = slideElement.querySelector('.verse-english');
        const verseThai = slideElement.querySelector('.verse-thai');
        const refEnglish = slideElement.querySelector('.verse-ref-english');
        const refThai = slideElement.querySelector('.verse-ref-thai');

        // Reset classes
        slideElement.classList.remove('photo-slide', 'verse-slide');

        // Clear any existing daisies
        this.clearDaisies(slideElement);

        if (slideData.type === 'photo') {
            slideElement.classList.add('photo-slide');
            img.src = slideData.src;
            img.alt = slideData.alt || 'Memorial photo';
            // Reset any existing transform - Ken Burns will set it properly
            img.style.transform = 'scale(1) translate(0%, 0%)';

            // Generate daisies once the image dimensions are known
            const onReady = () => this.generateDaisies(slideElement, img);
            if (img.complete && img.naturalWidth) {
                onReady();
            } else {
                img.addEventListener('load', onReady, { once: true });
            }
        } else if (slideData.type === 'verse') {
            slideElement.classList.add('verse-slide');

            // Set English text
            verseEnglish.textContent = slideData.text;
            refEnglish.textContent = slideData.reference;

            // Set Thai text
            verseThai.textContent = slideData.textThai || slideData.text;
            refThai.textContent = slideData.referenceThai || slideData.reference;

            // Reset to show English first (remove any previous state)
            verseEnglish.classList.remove('hidden');
            verseThai.classList.remove('visible');
            refEnglish.classList.remove('hidden');
            refThai.classList.remove('visible');

            verseEnglish.style.opacity = '1';
            verseThai.style.opacity = '0';
            refEnglish.style.opacity = '1';
            refThai.style.opacity = '0';

            // Apply colors
            const colors = this.getVerseColors(slideData);
            slideElement.style.backgroundColor = colors.background;
            verseEnglish.style.color = colors.text;
            verseThai.style.color = colors.text;
            refEnglish.style.color = colors.text;
            refThai.style.color = colors.text;
        }
    }

    getVerseColors(slideData) {
        if (slideData.background && slideData.textColor) {
            return { background: slideData.background, text: slideData.textColor };
        }
        // Random color from palette
        return this.verseColors[Math.floor(Math.random() * this.verseColors.length)];
    }

    prepareKenBurns(slideElement, slideData) {
        const img = slideElement.querySelector('.slide-image');
        if (!img) return null;

        // Reduce Ken Burns intensity on large landscape screens (TV)
        const isLargeScreen = window.innerWidth >= 1200 && window.innerWidth > window.innerHeight;
        const zoomRange = isLargeScreen ? 0.02 : 0.03;
        const zoomBase = isLargeScreen ? 0.02 : 0.05;
        const panRange = isLargeScreen ? 2 : 6;

        // Random zoom amount
        const zoomAmount = 1 + (Math.random() * zoomRange + zoomBase);

        // Random pan direction
        const panX = (Math.random() - 0.5) * panRange;
        const panY = (Math.random() - 0.5) * panRange;

        // Random direction (zoom in or out)
        const zoomIn = Math.random() > 0.5;

        const startScale = zoomIn ? 1 : zoomAmount;
        const endScale = zoomIn ? zoomAmount : 1;
        const startX = zoomIn ? 0 : panX;
        const startY = zoomIn ? 0 : panY;
        const endX = zoomIn ? panX : 0;
        const endY = zoomIn ? panY : 0;

        // Set initial transform immediately
        img.style.transform = `scale(${startScale}) translate(${startX}%, ${startY}%)`;

        const duration = slideData.duration || this.settings.defaultDuration;

        return { img, startScale, endScale, startX, startY, endX, endY, duration };
    }

    startKenBurns(kenBurnsParams) {
        if (!kenBurnsParams) return;

        // Stop any existing animation
        if (this.kenBurnsAnimation) {
            this.kenBurnsAnimation.pause();
        }

        const { img, startScale, endScale, startX, startY, endX, endY, duration } = kenBurnsParams;

        this.kenBurnsAnimation = anime({
            targets: img,
            scale: [startScale, endScale],
            translateX: [`${startX}%`, `${endX}%`],
            translateY: [`${startY}%`, `${endY}%`],
            duration: duration,
            easing: 'linear'
        });
    }

    async transitionToNext() {
        if (this.isTransitioning) return;
        this.isTransitioning = true;

        // Stop Ken Burns
        if (this.kenBurnsAnimation) {
            this.kenBurnsAnimation.pause();
        }

        const currentSlideData = this.slides[this.currentIndex];
        const nextIndex = (this.currentIndex + 1) % this.slides.length;
        const nextSlideData = this.slides[nextIndex];

        // Setup next slide content
        this.setupSlideContent(this.nextSlide, nextSlideData);

        // Prepare Ken Burns on next slide BEFORE transition (so it doesn't pop)
        let nextKenBurnsParams = null;
        if (nextSlideData.type === 'photo' && (nextSlideData.kenBurns ?? this.settings.kenBurnsEnabled)) {
            nextKenBurnsParams = this.prepareKenBurns(this.nextSlide, nextSlideData);
        }

        // Get transition type
        const transitionType = currentSlideData.transition || this.getRandomTransition();
        const transitionDuration = currentSlideData.transitionDuration || this.settings.defaultTransitionDuration;

        // Execute transition
        await this.executeTransition(transitionType, transitionDuration);

        // Swap slides
        this.swapSlides();

        this.isTransitioning = false;

        // Start Ken Burns on the now-current slide
        if (nextKenBurnsParams) {
            this.startKenBurns(nextKenBurnsParams);
        }

        // Continue with next slide scheduling (without re-preparing Ken Burns)
        this.scheduleNextSlide(nextIndex);
    }

    scheduleNextSlide(index) {
        const slide = this.slides[index];
        this.currentIndex = index;

        // Preload next slides
        const nextIndex = (index + 1) % this.slides.length;
        this.preloadSlides(nextIndex, 2);

        // Get duration
        const duration = slide.duration ||
            (slide.type === 'verse' ? this.settings.verseDuration : this.settings.defaultDuration);

        // For verse slides, schedule the English->Thai transition
        if (slide.type === 'verse') {
            setTimeout(() => {
                this.crossfadeToThai(this.currentSlide);
            }, duration);

            setTimeout(() => {
                this.transitionToNext();
            }, duration * 2);
        } else {
            setTimeout(() => {
                this.transitionToNext();
            }, duration);
        }
    }

    getRandomTransition() {
        return this.transitions[Math.floor(Math.random() * this.transitions.length)];
    }

    async executeTransition(type, duration) {
        switch (type) {
            case 'slideLeft':
                await this.transitionSlide('left', duration);
                break;
            case 'slideRight':
                await this.transitionSlide('right', duration);
                break;
            case 'slideUp':
                await this.transitionSlide('up', duration);
                break;
            case 'slideDown':
                await this.transitionSlide('down', duration);
                break;
            case 'fadeBlack':
                await this.transitionFade('black', duration);
                break;
            case 'fadeWhite':
                await this.transitionFade('white', duration);
                break;
            case 'hearts':
                await this.transitionHearts(duration);
                break;
            case 'heavensLight':
                await this.transitionHeavensLight(duration);
                break;
            default:
                await this.transitionFade('black', duration);
        }
    }

    async transitionSlide(direction, duration) {
        const transforms = {
            left: { out: 'translateX(-100%)', in: 'translateX(100%)' },
            right: { out: 'translateX(100%)', in: 'translateX(-100%)' },
            up: { out: 'translateY(-100%)', in: 'translateY(100%)' },
            down: { out: 'translateY(100%)', in: 'translateY(-100%)' }
        };

        const transform = transforms[direction];

        // Position next slide
        this.nextSlide.style.transform = transform.in;
        this.nextSlide.style.opacity = '1';
        this.nextSlide.style.visibility = 'visible';
        this.nextSlide.classList.add('next');

        // Animate both slides
        await Promise.all([
            anime({
                targets: this.currentSlide,
                translateX: direction === 'left' ? '-100%' : direction === 'right' ? '100%' : '0%',
                translateY: direction === 'up' ? '-100%' : direction === 'down' ? '100%' : '0%',
                easing: 'easeInOutQuad',
                duration: duration
            }).finished,
            anime({
                targets: this.nextSlide,
                translateX: '0%',
                translateY: '0%',
                easing: 'easeInOutQuad',
                duration: duration
            }).finished
        ]);
    }

    async transitionFade(color, duration) {
        this.transitionOverlay.className = `fade-${color}`;

        // Fade overlay in
        await anime({
            targets: this.transitionOverlay,
            opacity: 1,
            easing: 'easeInOutQuad',
            duration: duration / 2
        }).finished;

        // Swap visibility
        this.currentSlide.style.opacity = '0';
        this.nextSlide.style.opacity = '1';
        this.nextSlide.style.visibility = 'visible';
        this.nextSlide.style.transform = 'translate(0, 0)';

        // Brief pause
        await new Promise(resolve => setTimeout(resolve, 200));

        // Fade overlay out
        await anime({
            targets: this.transitionOverlay,
            opacity: 0,
            easing: 'easeInOutQuad',
            duration: duration / 2
        }).finished;
    }

    async transitionHearts(duration) {
        // Create floating hearts container
        const container = document.createElement('div');
        container.className = 'hearts-float-container';
        this.container.appendChild(container);

        const heartPath = 'M50,90 C25,68 2,50 2,28 C2,12 15,2 30,2 C39,2 46,8 50,16 C54,8 61,2 70,2 C85,2 98,12 98,28 C98,50 75,68 50,90 Z';
        const colors = [
            'rgba(220, 140, 165, 0.75)',
            'rgba(200, 110, 140, 0.65)',
            'rgba(240, 175, 195, 0.55)',
            'rgba(185, 95, 125, 0.70)',
            'rgba(235, 160, 180, 0.60)',
        ];

        const heartCount = 20;
        const hearts = [];
        const baseSize = Math.max(50, Math.min(window.innerWidth, window.innerHeight) * 0.06);

        for (let i = 0; i < heartCount; i++) {
            const size = baseSize + Math.random() * baseSize * 1.5;
            const color = colors[Math.floor(Math.random() * colors.length)];
            const heart = document.createElement('div');
            heart.className = 'float-heart';
            heart.style.cssText = `
                width: ${size}px;
                height: ${size}px;
                left: ${Math.random() * 90 + 5}%;
                top: ${105 + Math.random() * 15}%;
            `;
            heart.innerHTML = `<svg viewBox="0 0 100 95"><path d="${heartPath}" fill="${color}"/></svg>`;
            container.appendChild(heart);
            hearts.push(heart);
        }

        // Hearts float upward with gentle sway
        const floatDuration = duration * 1.8;
        const animation = anime({
            targets: hearts,
            top: () => `${-15 - Math.random() * 20}%`,
            opacity: [0, 0.9],
            translateX: () => `${(Math.random() - 0.5) * 50}px`,
            rotate: () => `${(Math.random() - 0.5) * 30}deg`,
            easing: 'easeInOutSine',
            duration: floatDuration,
            delay: anime.stagger(70),
        });

        // Swap slides behind the hearts at midpoint
        await new Promise(resolve => setTimeout(resolve, duration * 0.55));

        this.currentSlide.style.opacity = '0';
        this.nextSlide.style.opacity = '1';
        this.nextSlide.style.visibility = 'visible';
        this.nextSlide.style.transform = 'translate(0, 0)';

        await animation.finished;

        // Gentle fade-out of the whole container
        await anime({
            targets: container,
            opacity: 0,
            duration: 400,
            easing: 'easeOutQuad'
        }).finished;

        container.remove();
    }

    // --- Daisy decoration for pillarbox empty space ---

    calculateEmptySpace(img) {
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        const iw = img.naturalWidth;
        const ih = img.naturalHeight;

        if (!iw || !ih) return null;

        // Only on large landscape screens where contain mode leaves empty space
        if (vw < 1200 || vw <= vh) return null;

        const imageAspect = iw / ih;
        const viewportAspect = vw / vh;

        if (imageAspect < viewportAspect) {
            // Portrait image on landscape screen → pillarbox bars on sides
            const renderedWidth = vh * imageAspect;
            const barWidth = (vw - renderedWidth) / 2;
            if (barWidth < 60) return null;
            return {
                bars: [
                    { x: 0, y: 0, width: barWidth, height: vh },
                    { x: vw - barWidth, y: 0, width: barWidth, height: vh }
                ]
            };
        }

        return null;
    }

    createDaisySVG(color) {
        const petals = [];
        for (let i = 0; i < 8; i++) {
            petals.push(
                `<ellipse cx="50" cy="20" rx="10" ry="22" transform="rotate(${i * 45} 50 50)"/>`
            );
        }
        return `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" fill="${color}">
            ${petals.join('')}
            <circle cx="50" cy="50" r="12"/>
        </svg>`;
    }

    generateDaisies(slideElement, img) {
        const space = this.calculateEmptySpace(img);
        if (!space) return;

        const container = document.createElement('div');
        container.className = 'daisies-container';

        const daisyCount = 11;
        const baseSize = Math.max(30, Math.min(window.innerWidth, window.innerHeight) * 0.03);

        for (let i = 0; i < daisyCount; i++) {
            const bar = space.bars[Math.floor(Math.random() * space.bars.length)];
            const size = baseSize + Math.random() * baseSize * 2;
            const opacity = 0.04 + Math.random() * 0.07;
            const rotation = Math.random() * 360;
            const x = bar.x + Math.random() * Math.max(0, bar.width - size);
            const y = Math.random() * Math.max(0, bar.height - size);
            const color = `rgba(255, 255, 255, ${opacity.toFixed(3)})`;

            const daisy = document.createElement('div');
            daisy.className = 'daisy';
            daisy.style.cssText = `
                left: ${x}px;
                top: ${y}px;
                width: ${size}px;
                height: ${size}px;
                transform: rotate(${rotation}deg);
            `;
            daisy.innerHTML = this.createDaisySVG(color);
            container.appendChild(daisy);
        }

        slideElement.insertBefore(container, slideElement.firstChild);

        // Gentle fade-in
        anime({
            targets: container,
            opacity: [0, 1],
            duration: 2000,
            easing: 'easeOutQuad'
        });
    }

    clearDaisies(slideElement) {
        const existing = slideElement.querySelector('.daisies-container');
        if (existing) existing.remove();
    }

    async transitionHeavensLight(duration) {
        this.transitionOverlay.className = 'heavens-light';

        // Brighten and glow
        await anime({
            targets: this.currentSlide,
            filter: ['brightness(1)', 'brightness(2)'],
            easing: 'easeInQuad',
            duration: duration / 3
        }).finished;

        // Fade overlay in with glow
        await anime({
            targets: this.transitionOverlay,
            opacity: [0, 1],
            easing: 'easeInOutQuad',
            duration: duration / 3
        }).finished;

        // Swap slides
        this.currentSlide.style.opacity = '0';
        this.currentSlide.style.filter = 'brightness(1)';
        this.nextSlide.style.opacity = '1';
        this.nextSlide.style.visibility = 'visible';
        this.nextSlide.style.transform = 'translate(0, 0)';

        // Fade overlay out
        await anime({
            targets: this.transitionOverlay,
            opacity: 0,
            easing: 'easeOutQuad',
            duration: duration / 3
        }).finished;
    }

    swapSlides() {
        // Reset current slide
        this.currentSlide.classList.remove('active');
        this.currentSlide.style.opacity = '0';
        this.currentSlide.style.visibility = 'hidden';
        this.currentSlide.style.transform = 'translate(0, 0)';

        // Activate next slide
        this.nextSlide.classList.remove('next');
        this.nextSlide.classList.add('active');

        // Swap references
        const temp = this.currentSlide;
        this.currentSlide = this.nextSlide;
        this.nextSlide = temp;
    }

    handleResize() {
        // Trigger re-layout if needed
        this.container.style.width = '100vw';
        this.container.style.height = '100vh';
    }

    handleOrientationChange() {
        // Small delay to let the browser settle
        setTimeout(() => {
            this.handleResize();
        }, 100);
    }

    toggleFullscreen() {
        if (!document.fullscreenElement && !document.webkitFullscreenElement) {
            // Enter fullscreen
            const elem = this.container;
            if (elem.requestFullscreen) {
                elem.requestFullscreen();
            } else if (elem.webkitRequestFullscreen) {
                elem.webkitRequestFullscreen();
            }
        } else {
            // Exit fullscreen
            if (document.exitFullscreen) {
                document.exitFullscreen();
            } else if (document.webkitExitFullscreen) {
                document.webkitExitFullscreen();
            }
        }
    }

    showError(message) {
        const errorDiv = document.createElement('div');
        errorDiv.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: rgba(0, 0, 0, 0.9);
            color: #fff;
            padding: 2rem;
            border-radius: 8px;
            font-family: sans-serif;
            text-align: center;
            max-width: 80%;
        `;
        errorDiv.textContent = message;
        document.body.appendChild(errorDiv);
    }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    const slideshow = new MemorialSlideshow();
    slideshow.init();
});
