// Content script - injects into anime sites to extract video URLs

(() => {
  'use strict';

  // Prevent multiple injections
  if (window.__naijasprideExtractorInjected) return;
  window.__naijasprideExtractorInjected = true;

  const API_BASE = 'http://localhost:3001'; // Will be configurable
  let extractedSources = [];
  let currentAnime = null;

  // Extract domain for provider detection
  const getProvider = () => {
    const host = window.location.hostname;
    if (host.includes('9anime')) return 'nineanime';
    if (host.includes('hianime') || host.includes('aniwatch')) return 'aniwatch';
    if (host.includes('gogoanime')) return 'gogoanime';
    if (host.includes('zoro')) return 'zoro';
    if (host.includes('animepahe')) return 'animepahe';
    if (host.includes('kissanime')) return 'kissanime';
    return 'unknown';
  };

  // Extract anime info from page
  const extractAnimeInfo = () => {
    const provider = getProvider();
    let title = '';
    let episode = 1;

    // Try different selectors based on site
    const titleSelectors = [
      'h1.film-name',
      'h1.title',
      '.anime-info h1',
      '.title-wrapper h1',
      'h1',
      '[data-title]',
    ];

    for (const selector of titleSelectors) {
      const el = document.querySelector(selector);
      if (el) {
        title = el.textContent?.trim() || '';
        if (title) break;
      }
    }

    // Extract episode number
    const url = window.location.href;
    const epMatch = url.match(/ep[-_]?(<d+>)/i) || 
                    url.match(/episode[-_]?(<d+>)/i) ||
                    url.match(/ep=(<d+>)/i) ||
                    document.title.match(/Episode\s+(<d+>)/i);
    if (epMatch) {
      episode = parseInt(epMatch[1], 10);
    }

    return { title, episode, provider };
  };

  // Monitor network requests for video URLs
  const monitorNetwork = () => {
    // Override XMLHttpRequest
    const originalXHR = window.XMLHttpRequest;
    window.XMLHttpRequest = function() {
      const xhr = new originalXHR();
      const originalOpen = xhr.open;
      
      xhr.open = function(method, url, ...args) {
        checkVideoUrl(url);
        return originalOpen.apply(xhr, [method, url, ...args]);
      };
      
      return xhr;
    };

    // Override fetch
    const originalFetch = window.fetch;
    window.fetch = function(url, ...args) {
      const urlStr = typeof url === 'string' ? url : url.url;
      checkVideoUrl(urlStr);
      return originalFetch.apply(window, [url, ...args]);
    };
  };

  // Check if URL is a video source
  const checkVideoUrl = (url) => {
    if (!url) return;
    
    const videoPatterns = [
      /\.m3u8(?:\?|$)/i,
      /\.mp4(?:\?|$)/i,
      /\/master\.m3u8/i,
      /\/index\.m3u8/i,
      /\/playlist\.m3u8/i,
      /video.*\.m3u8/i,
      /stream.*\.m3u8/i,
    ];

    const qualityPatterns = [
      /(\d{3,4}p)/i,
      /_([\d]+)_/,
      /quality[=_-]([^&/]+)/i,
    ];

    const isVideo = videoPatterns.some(pattern => pattern.test(url));
    
    if (isVideo) {
      let quality = 'auto';
      for (const pattern of qualityPatterns) {
        const match = url.match(pattern);
        if (match?.[1]) {
          quality = match[1];
          break;
        }
      }

      const source = {
        url: url,
        quality: quality,
        isM3U8: url.includes('.m3u8'),
        timestamp: Date.now(),
      };

      // Avoid duplicates
      if (!extractedSources.some(s => s.url === url)) {
        extractedSources.push(source);
        console.log('[NaijasPride] Found video source:', source);
        
        // Send to background script
        chrome.runtime?.sendMessage({
          type: 'VIDEO_SOURCE_FOUND',
          data: {
            source,
            anime: currentAnime,
          },
        });
      }
    }
  };

  // Monitor video elements
  const monitorVideoElements = () => {
    const videos = document.querySelectorAll('video');
    videos.forEach(video => {
      if (video.src) {
        checkVideoUrl(video.src);
      }
      
      // Check source elements
      const sources = video.querySelectorAll('source');
      sources.forEach(source => {
        if (source.src) {
          checkVideoUrl(source.src);
        }
      });
    });
  };

  // Extract from player configurations (JW Player, VideoJS, etc.)
  const extractFromPlayerConfigs = () => {
    // JW Player
    if (window.jwplayer) {
      try {
        const players = document.querySelectorAll('.jwplayer');
        players.forEach((player, index) => {
          const jw = window.jwplayer(player.id || index);
          if (jw?.getPlaylist) {
            const playlist = jw.getPlaylist();
            playlist?.forEach(item => {
              item?.sources?.forEach(src => {
                if (src.file) checkVideoUrl(src.file);
              });
            });
          }
        });
      } catch (e) {
        console.log('[NaijasPride] JW Player extraction failed:', e);
      }
    }

    // Video.js
    if (window.videojs) {
      try {
        const players = document.querySelectorAll('.video-js');
        players.forEach(player => {
          const id = player.id;
          if (id && window.videojs.getPlayer) {
            const vjs = window.videojs.getPlayer(id);
            if (vjs?.currentSrc) {
              checkVideoUrl(vjs.currentSrc());
            }
          }
        });
      } catch (e) {
        console.log('[NaijasPride] Video.js extraction failed:', e);
      }
    }

    // Plyr
    if (window.Plyr) {
      try {
        const plyrData = document.querySelector('[data-plyr-embed-id]');
        if (plyrData) {
          const sources = plyrData.querySelectorAll('source');
          sources.forEach(source => {
            if (source.src) checkVideoUrl(source.src);
          });
        }
      } catch (e) {
        console.log('[NaijasPride] Plyr extraction failed:', e);
      }
    }

    // Check for player configuration in page scripts
    const scripts = document.querySelectorAll('script:not([src])');
    scripts.forEach(script => {
      const text = script.textContent || '';
      
      // Look for common patterns
      const patterns = [
        /sources:\s*(\[[^\]]+\])/i,
        /"sources":\s*(\[[^\]]+\])/i,
        /var\s+sources\s*=\s*(\[[^\]]+\])/i,
        /file:\s*["']([^"']+)["']/gi,
        /src:\s*["']([^"']+)["']/gi,
      ];

      patterns.forEach(pattern => {
        const matches = text.matchAll(pattern);
        for (const match of matches) {
          if (match[1]) {
            // Try to parse as JSON, or extract URLs
            try {
              const data = JSON.parse(match[1]);
              if (Array.isArray(data)) {
                data.forEach(item => {
                  if (item.file || item.url || item.src) {
                    checkVideoUrl(item.file || item.url || item.src);
                  }
                });
              }
            } catch {
              // Not JSON, try as direct URL
              checkVideoUrl(match[1]);
            }
          }
        }
      });
    });
  };

  // Scan page periodically for new video sources
  const startScanning = () => {
    currentAnime = extractAnimeInfo();
    
    // Initial scan
    monitorVideoElements();
    extractFromPlayerConfigs();

    // Periodic scans
    setInterval(() => {
      monitorVideoElements();
      extractFromPlayerConfigs();
    }, 2000);

    // Listen for messages from popup
    chrome.runtime?.onMessage.addListener((request, sender, sendResponse) => {
      if (request.type === 'GET_EXTRACTED_SOURCES') {
        sendResponse({
          sources: extractedSources,
          anime: currentAnime,
        });
      }
      return true;
    });

    console.log('[NaijasPride] Extractor initialized for:', currentAnime);
  };

  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', startScanning);
  } else {
    startScanning();
  }

  // Monitor network
  monitorNetwork();

  // Monitor for dynamically added video elements
  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      mutation.addedNodes.forEach((node) => {
        if (node.nodeName === 'VIDEO' || (node.querySelectorAll && node.querySelectorAll('video').length > 0)) {
          monitorVideoElements();
        }
      });
    });
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
  });

})();