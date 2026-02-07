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
        this.heartsOverlay = document.getElementById('hearts-overlay');

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

        if (slideData.type === 'photo') {
            slideElement.classList.add('photo-slide');
            img.src = slideData.src;
            img.alt = slideData.alt || 'Memorial photo';
            // Reset any existing transform - Ken Burns will set it properly
            img.style.transform = 'scale(1) translate(0%, 0%)';
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
        const heartsGroup = document.querySelector('#hearts-group');

        // Generate heart positions
        heartsGroup.innerHTML = this.generateHeartPaths();

        // Show hearts overlay
        this.heartsOverlay.style.opacity = '1';

        // Animate hearts expanding
        await anime({
            targets: '#hearts-group path',
            scale: [0, 20],
            opacity: [1, 1],
            easing: 'easeInOutQuad',
            duration: duration,
            delay: anime.stagger(50, { from: 'center' })
        }).finished;

        // Swap slides during animation
        this.currentSlide.style.opacity = '0';
        this.nextSlide.style.opacity = '1';
        this.nextSlide.style.visibility = 'visible';
        this.nextSlide.style.transform = 'translate(0, 0)';

        // Hide overlay
        this.heartsOverlay.style.opacity = '0';
        heartsGroup.innerHTML = '';
    }

    generateHeartPaths() {
        const heartPath = 'M50,88 C25,65 5,50 5,30 C5,15 18,5 32,5 C40,5 47,10 50,18 C53,10 60,5 68,5 C82,5 95,15 95,30 C95,50 75,65 50,88 Z';
        const positions = [
            { x: 50, y: 50, scale: 0.01 },  // Center
            { x: 25, y: 30, scale: 0.01 },
            { x: 75, y: 30, scale: 0.01 },
            { x: 25, y: 70, scale: 0.01 },
            { x: 75, y: 70, scale: 0.01 },
            { x: 10, y: 50, scale: 0.01 },
            { x: 90, y: 50, scale: 0.01 },
            { x: 50, y: 15, scale: 0.01 },
            { x: 50, y: 85, scale: 0.01 },
            { x: 15, y: 20, scale: 0.01 },
            { x: 85, y: 20, scale: 0.01 },
            { x: 15, y: 80, scale: 0.01 },
            { x: 85, y: 80, scale: 0.01 }
        ];

        return positions.map(pos =>
            `<path d="${heartPath}" transform="translate(${pos.x - 50}, ${pos.y - 50}) scale(${pos.scale})" fill="black"/>`
        ).join('');
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
