/* Progressive enhancement. All research text and media exist in the HTML. */
(() => {
  'use strict';

  const motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)');
  const videos = [...document.querySelectorAll('video[data-viewport-play]')];
  const videoStates = new Map(videos.map(video => [video, {
    userPaused: false, manualPlay: false, expectedPause: false,
    requestingPlay: false, attempted: false, blocked: false,
    interruptedStarts: 0, retryTimer: null
  }]));
  const walkthroughUpdates = [];
  const chartUpdates = [];
  let videoFrame = 0;

  // The mobile file rearranges entire synchronized panels; no prediction changes.
  const mobileViewport = window.matchMedia('(max-width: 700px)');
  function chooseVideoRendition(video, initial = false) {
    const mobile = mobileViewport.matches && !!video.dataset.mobileSrc;
    const key = mobile ? 'mobile' : 'desktop';
    const url = video.dataset[key + 'Src'];
    const source = video.querySelector('source');
    if (!url || (source.getAttribute('src') === url && !initial)) return;
    const time = video.currentTime || 0;
    const state = videoStates.get(video);
    if (!initial) pauseForVisibility(video);
    source.setAttribute('src', url);
    video.poster = video.dataset[key + 'Poster'];
    video.width = Number(video.dataset[key + 'Width']);
    video.height = Number(video.dataset[key + 'Height']);
    video.style.aspectRatio = `${video.width} / ${video.height}`;
    if (initial && !mobile) return;
    if (time) video.addEventListener('loadedmetadata', () => {
      video.currentTime = Math.min(time, Math.max(0, video.duration - .1));
    }, { once: true });
    if (state) state.attempted = false;
    video.load();
  }
  videos.forEach(video => chooseVideoRendition(video, true));
  mobileViewport.addEventListener('change', () => {
    videos.forEach(video => chooseVideoRendition(video));
    scheduleVideoPlayback();
  });

  function pauseForVisibility(video) {
    const state = videoStates.get(video);
    if (state) {
      state.attempted = false;
      state.interruptedStarts = 0;
      window.clearTimeout(state.retryTimer);
      state.retryTimer = null;
    }
    if (!video.paused) {
      if (state) state.expectedPause = true;
      video.pause();
    }
  }

  function updateVideoPlayback() {
    videoFrame = 0;
    updateActiveNavigation();
    const header = document.querySelector('.topbar');
    const top = Math.max(0, header?.getBoundingClientRect().bottom || 0);
    const unavailable = document.hidden || document.body.classList.contains('dialog-open');
    videos.forEach(video => {
      const state = videoStates.get(video);
      const rect = video.getBoundingClientRect();
      const hidden = unavailable || !!video.closest('[hidden]') || !rect.width || !rect.height;
      const fullscreen = document.fullscreenElement === video;
      const visibleHeight = Math.max(0, Math.min(rect.bottom, innerHeight) - Math.max(rect.top, top));
      const visibleWidth = Math.max(0, Math.min(rect.right, document.documentElement.clientWidth) - Math.max(rect.left, 0));
      // A clip can be taller than the usable viewport. Measure how much of its
      // displayable area is visible instead of requiring every pixel to fit.
      const displayableArea = Math.min(rect.height, Math.max(0, innerHeight - top)) * Math.min(rect.width, document.documentElement.clientWidth);
      const partlyVisible = !hidden && (fullscreen || visibleWidth * visibleHeight > 0);
      const readyToStart = partlyVisible && (fullscreen || (displayableArea > 0 && visibleWidth * visibleHeight >= displayableArea * .5));
      if (!partlyVisible) state.attempted = false;
      if (state.manualPlay && partlyVisible) return;
      if (!partlyVisible || motionPreference.matches) {
        pauseForVisibility(video);
        if (!partlyVisible) state.manualPlay = false;
        return;
      }
      if (!readyToStart || !video.paused || state.userPaused || state.requestingPlay || state.attempted) return;
      state.attempted = true;
      state.blocked = false;
      state.requestingPlay = true;
      video.muted = true;
      video.playsInline = true;
      video.preload = 'auto';
      video.setAttribute('loading', 'eager');
      video.play().then(() => {
        state.interruptedStarts = 0;
      }).catch(error => {
        // Retry a browser-blocked start on the next ordinary page interaction.
        state.blocked = error.name === 'NotAllowedError';
        // Loading or a rapid visibility change can interrupt a pending start.
        // Retry briefly instead of leaving the clip permanently on its poster.
        if (error.name === 'AbortError' && !state.userPaused && state.interruptedStarts < 2) {
          state.interruptedStarts += 1;
          state.retryTimer = window.setTimeout(() => {
            state.retryTimer = null;
            state.attempted = false;
            scheduleVideoPlayback();
          }, 200);
        }
      }).finally(() => {
        state.requestingPlay = false;
        if (video.paused) state.manualPlay = false;
      });
    });
    walkthroughUpdates.forEach(update => update());
    chartUpdates.forEach(update => update());
  }

  function scheduleVideoPlayback() {
    if (!videoFrame) videoFrame = requestAnimationFrame(updateVideoPlayback);
  }

  function retryBlockedPlayback() {
    let retry = false;
    videoStates.forEach(state => {
      if (state.blocked && !state.userPaused) {
        state.attempted = false;
        retry = true;
      }
    });
    if (retry) {
      cancelAnimationFrame(videoFrame);
      updateVideoPlayback();
    }
  }
  window.addEventListener('pointerdown', retryBlockedPlayback, { passive: true });
  window.addEventListener('keydown', retryBlockedPlayback);
  ['focus', 'pageshow'].forEach(event => window.addEventListener(event, () => {
    retryBlockedPlayback();
    scheduleVideoPlayback();
  }));

  videos.forEach(video => {
    const state = videoStates.get(video);
    video.addEventListener('pause', () => {
      if (state.expectedPause) state.expectedPause = false;
      else if (!video.ended) {
        state.userPaused = true;
        window.clearTimeout(state.retryTimer);
        state.retryTimer = null;
      }
      state.manualPlay = false;
    });
    video.addEventListener('play', () => {
      state.manualPlay = !state.requestingPlay;
      state.userPaused = false;
      scheduleVideoPlayback();
    });
    video.addEventListener('canplay', scheduleVideoPlayback);
  });

  document.querySelectorAll('.notice-button[aria-controls]').forEach(button => {
    const notice = document.getElementById(button.getAttribute('aria-controls'));
    if (!notice) return;
    button.addEventListener('click', () => {
      const open = notice.hidden;
      notice.hidden = !open;
      button.setAttribute('aria-expanded', String(open));
    });
  });

  document.querySelectorAll('.scenario-group').forEach(group => {
    const tabs = group.querySelector('.scenario-tabs');
    if (!tabs) return;
    const buttons = [...tabs.querySelectorAll('button')];
    if (buttons.length < 2) return;
    tabs.hidden = false;
    tabs.setAttribute('role', 'tablist');
    tabs.setAttribute('aria-label', group.dataset.label);
    group.classList.add('tabs-enhanced');

    function select(button, moveFocus = false) {
      buttons.forEach(tab => {
        const active = tab === button;
        const panel = document.getElementById(tab.dataset.panel);
        tab.setAttribute('aria-selected', String(active));
        tab.tabIndex = active ? 0 : -1;
        panel.hidden = !active;
        if (!active) panel.querySelectorAll('video').forEach(pauseForVisibility);
      });
      if (moveFocus) button.focus();
      scheduleVideoPlayback();
    }

    buttons.forEach((button, index) => {
      const panel = document.getElementById(button.dataset.panel);
      button.setAttribute('role', 'tab');
      button.setAttribute('aria-controls', panel.id);
      panel.setAttribute('role', 'tabpanel');
      panel.setAttribute('aria-labelledby', button.id);
      panel.tabIndex = 0;
      button.addEventListener('click', () => select(button));
      button.addEventListener('keydown', event => {
        let next;
        if (event.key === 'ArrowRight') next = (index + 1) % buttons.length;
        if (event.key === 'ArrowLeft') next = (index - 1 + buttons.length) % buttons.length;
        if (event.key === 'Home') next = 0;
        if (event.key === 'End') next = buttons.length - 1;
        if (next === undefined) return;
        event.preventDefault();
        select(buttons[next], true);
      });
    });
    select(buttons.find(button => button.dataset.panel === group.dataset.defaultPanel) || buttons[0]);
  });

  // The SVG attributes always retain the measured values. Animation is a
  // presentation-only width override; static exports and no-JS stay complete.
  document.querySelectorAll('.result-chart svg').forEach(chart => {
    if (typeof chart.animate !== 'function') return;
    let entered = false;
    let animations = [];
    let run = 0;
    chart.dataset.motion = motionPreference.matches ? 'complete' : 'idle';

    function settle(status = 'idle') {
      ++run;
      animations.forEach(animation => animation.cancel());
      animations = [];
      chart.dataset.motion = status;
    }

    function update() {
      const rect = chart.getBoundingClientRect();
      const top = Math.max(0, document.querySelector('.topbar')?.getBoundingClientRect().bottom || 0);
      const hidden = document.hidden || document.body.classList.contains('dialog-open')
        || !!chart.closest('[hidden]') || !rect.width || !rect.height;
      const height = Math.max(0, Math.min(rect.bottom, innerHeight) - Math.max(rect.top, top));
      const width = Math.max(0, Math.min(rect.right, document.documentElement.clientWidth) - Math.max(rect.left, 0));
      const available = Math.min(rect.height, Math.max(0, innerHeight - top)) * Math.min(rect.width, document.documentElement.clientWidth);
      if (motionPreference.matches) {
        if (animations.length || chart.dataset.motion !== 'complete') settle('complete');
        entered = false;
        return;
      }
      if (hidden || !height || !width) {
        if (entered || animations.length) settle();
        entered = false;
        return;
      }
      if (entered || !available || width * height < available * .45) return;
      entered = true;
      const id = ++run;
      chart.dataset.motion = 'running';
      chart.querySelectorAll('.chart-row').forEach((row, index) => {
        const bar = row.querySelector('.chart-bar');
        const annotation = row.querySelector('.chart-annotation');
        const delay = index * 130;
        animations.push(bar.animate(
          [{ width: '0px' }, { width: bar.getAttribute('width') + 'px' }],
          { duration: 1050, delay, easing: 'cubic-bezier(.22,.61,.36,1)', fill: 'both' }
        ));
        // Reveal exact values and uncertainty only as the bar reaches its result.
        animations.push(annotation.animate([{ opacity: 0 }, { opacity: 1 }],
          { duration: 220, delay: delay + 980, fill: 'both' }));
      });
      Promise.all(animations.map(animation => animation.finished.catch(() => {}))).then(() => {
        if (id === run) settle('complete');
      });
    }

    chartUpdates.push(update);
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(scheduleVideoPlayback, { threshold: [0, .25, .5, .75, 1] }).observe(chart);
    }
  });

  document.querySelectorAll('.method-walkthrough').forEach(walkthrough => {
    const tabs = walkthrough.querySelector('.walkthrough-tabs');
    const buttons = [...tabs.querySelectorAll('[data-method-step]')];
    const panels = [...walkthrough.querySelectorAll('.walkthrough-slide')];
    const previous = walkthrough.querySelector('[data-method-prev]');
    const next = walkthrough.querySelector('[data-method-next]');
    const play = walkthrough.querySelector('[data-method-play]');
    const count = walkthrough.querySelector('.walkthrough-count');
    const stage = walkthrough.querySelector('.walkthrough-stage');
    const timings = { intro: 4500, step: 5500, fadeOut: 300, fadeIn: 450 };
    let active = 0;
    let requested = 0;
    let timer = null;
    let running = false;
    let playbackId = 0;
    let userPaused = false;
    let manualMotion = false;
    let transitionId = 0;
    let animation = null;
    tabs.hidden = false;
    tabs.setAttribute('role', 'tablist');
    tabs.setAttribute('aria-label', 'Method steps');
    walkthrough.querySelector('.walkthrough-controls').hidden = false;
    walkthrough.classList.add('walkthrough-enhanced');

    function updateControls() {
      play.setAttribute('aria-pressed', String(running));
      play.querySelector('span').textContent = running ? 'Pause walkthrough' : 'Play walkthrough';
      play.querySelector('.method-play-icon').toggleAttribute('hidden', running);
      play.querySelector('.method-pause-icon').toggleAttribute('hidden', !running);
      count.setAttribute('aria-live', running ? 'off' : 'polite');
    }

    function show(index, focus = false) {
      active = index;
      buttons.forEach((button, i) => {
        button.setAttribute('aria-selected', String(i === active));
        button.tabIndex = i === active ? 0 : -1;
        panels[i].hidden = i !== active;
      });
      previous.disabled = active === 0;
      next.disabled = active === panels.length - 1;
      count.textContent = `${active + 1} / ${panels.length}`;
      if (focus) buttons[active].focus({ preventScroll: true });
      const viewport = panels[active].querySelector('.walkthrough-viewport');
      viewport.scrollLeft = Math.max(0, viewport.scrollWidth * Number(panels[active].dataset.focus) - viewport.clientWidth / 2);
    }

    async function select(index, focus = false) {
      requested = index;
      const id = ++transitionId;
      animation?.cancel();
      animation = null;
      if (index === active) {
        if (focus) buttons[active].focus({ preventScroll: true });
        return;
      }
      // Keep the current diagram visible until the next original has decoded.
      const image = panels[index].querySelector('img');
      image.loading = 'eager';
      if (image.decode) await image.decode().catch(() => {});
      if (id !== transitionId) return;
      const fade = !motionPreference.matches && typeof stage.animate === 'function';
      if (fade) {
        animation = stage.animate([{ opacity: 1 }, { opacity: 0 }], { duration: timings.fadeOut, easing: 'ease-in-out', fill: 'forwards' });
        await animation.finished.catch(() => {});
        if (id !== transitionId) return;
        animation.cancel();
      }
      show(index, focus);
      if (fade) {
        animation = stage.animate([{ opacity: 0 }, { opacity: 1 }], { duration: timings.fadeIn, easing: 'ease-in-out', fill: 'forwards' });
        await animation.finished.catch(() => {});
        if (id !== transitionId) return;
        animation.cancel();
      }
      animation = null;
    }

    function stop() {
      running = false;
      ++playbackId;
      window.clearTimeout(timer);
      timer = null;
      updateControls();
    }

    function scheduleStep() {
      if (!running) return;
      const id = playbackId;
      timer = window.setTimeout(async () => {
        timer = null;
        await select((active + 1) % panels.length);
        if (id === playbackId) scheduleStep();
      }, active === 0 ? timings.intro : timings.step);
    }

    function syncPlayback() {
      const rect = stage.getBoundingClientRect();
      const top = Math.max(0, document.querySelector('.topbar')?.getBoundingClientRect().bottom || 0);
      const visibleHeight = Math.max(0, Math.min(rect.bottom, innerHeight) - Math.max(rect.top, top));
      const availableHeight = Math.min(rect.height, Math.max(0, innerHeight - top));
      const visible = availableHeight > 0 && visibleHeight >= availableHeight * .6;
      const shouldPlay = visible && !document.hidden && !document.body.classList.contains('dialog-open')
        && !userPaused && (!motionPreference.matches || manualMotion);
      if (shouldPlay && !running) {
        running = true;
        ++playbackId;
        updateControls();
        scheduleStep();
      } else if (!shouldPlay && running) stop();
    }

    function pauseByReader() {
      userPaused = true;
      stop();
      // A pause during a fade settles immediately on the requested step.
      ++transitionId;
      animation?.cancel();
      animation = null;
      show(requested);
    }

    function choose(index, focus = false) {
      pauseByReader();
      select(index, focus);
    }

    buttons.forEach((button, i) => {
      button.setAttribute('role', 'tab');
      button.setAttribute('aria-controls', panels[i].id);
      panels[i].setAttribute('role', 'tabpanel');
      panels[i].setAttribute('aria-labelledby', button.id);
      button.addEventListener('click', () => choose(i));
      button.addEventListener('keydown', event => {
        const target = { ArrowRight: (i + 1) % panels.length, ArrowLeft: (i - 1 + panels.length) % panels.length, Home: 0, End: panels.length - 1 }[event.key];
        if (target === undefined) return;
        event.preventDefault();
        choose(target, true);
      });
    });
    previous.addEventListener('click', () => choose(Math.max(0, requested - 1)));
    next.addEventListener('click', () => choose(Math.min(panels.length - 1, requested + 1)));
    play.addEventListener('click', () => {
      if (running) return pauseByReader();
      userPaused = false;
      manualMotion = true;
      syncPlayback();
    });
    walkthrough.addEventListener('focusin', event => {
      if (running && !play.contains(event.target)) pauseByReader();
    });
    document.addEventListener('visibilitychange', syncPlayback);
    document.addEventListener('research:pause-motion', syncPlayback);
    motionPreference.addEventListener('change', () => {
      manualMotion = false;
      ++transitionId;
      animation?.cancel();
      animation = null;
      show(requested);
      syncPlayback();
    });
    walkthroughUpdates.push(syncPlayback);
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(scheduleVideoPlayback, { threshold: [0, .25, .5, .75, 1] }).observe(stage);
    }
    show(0);
    updateControls();
    syncPlayback();
  });

  const dialog = document.querySelector('.figure-dialog');
  if (dialog && typeof dialog.showModal === 'function') {
    let returnFocus;
    document.querySelectorAll('[data-lightbox]').forEach(link => {
      link.addEventListener('click', event => {
        // Preserve open-in-new-tab and the ordinary image-link fallback.
        if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
        event.preventDefault();
        returnFocus = link;
        const source = link.querySelector('img') || link.closest('figure')?.querySelector('img');
        const alt = link.dataset.lightboxAlt || source?.alt || link.getAttribute('aria-label') || 'Research figure';
        const image = dialog.querySelector('img');
        image.src = link.href;
        image.alt = alt;
        dialog.querySelector('.dialog-caption').textContent = link.closest('figure')?.querySelector('figcaption')?.textContent || alt;
        dialog.querySelector('.dialog-original').href = link.href;
        dialog.showModal();
        document.body.classList.add('dialog-open');
        document.dispatchEvent(new Event('research:pause-motion'));
        scheduleVideoPlayback();
        dialog.querySelector('.dialog-close').focus();
      });
    });
    dialog.querySelector('.dialog-close').addEventListener('click', () => dialog.close());
    dialog.addEventListener('click', event => {
      const rect = dialog.getBoundingClientRect();
      if (event.target === dialog && (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom)) dialog.close();
    });
    dialog.addEventListener('close', () => {
      document.body.classList.remove('dialog-open');
      returnFocus?.focus({ preventScroll: true });
      scheduleVideoPlayback();
    });
  }

  document.querySelectorAll('[data-copy]').forEach(button => {
    button.addEventListener('click', async () => {
      const code = document.getElementById(button.dataset.copy);
      const text = code.textContent;
      const status = document.querySelector('.copy-status');
      let copied = false;
      try {
        if (navigator.clipboard && window.isSecureContext) {
          await navigator.clipboard.writeText(text);
          copied = true;
        }
      } catch (_) { /* Use a local-file-compatible fallback below. */ }
      if (!copied) {
        const field = document.createElement('textarea');
        field.value = text;
        field.style.cssText = 'position:fixed;left:-9999px;top:0';
        document.body.append(field);
        field.select();
        try { copied = document.execCommand('copy'); } catch (_) { /* Select the citation instead. */ }
        field.remove();
        button.focus({ preventScroll: true });
      }
      if (copied) {
        status.textContent = 'Citation copied to clipboard.';
        button.querySelector('span').textContent = 'Copied';
        window.setTimeout(() => { button.querySelector('span').textContent = 'Copy citation'; }, 2200);
      } else {
        const range = document.createRange();
        range.selectNodeContents(code);
        const selection = window.getSelection();
        selection.removeAllRanges();
        selection.addRange(range);
        status.textContent = 'Citation selected. Press Ctrl+C or ⌘C to copy.';
      }
    });
  });

  // Geometry includes the sticky navigation, so covered pixels do not count.
  window.addEventListener('scroll', scheduleVideoPlayback, { passive: true });
  window.addEventListener('resize', scheduleVideoPlayback, { passive: true });
  document.addEventListener('toggle', scheduleVideoPlayback, true);
  document.addEventListener('fullscreenchange', scheduleVideoPlayback);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) videos.forEach(pauseForVisibility);
    else scheduleVideoPlayback();
  });
  motionPreference.addEventListener('change', scheduleVideoPlayback);
  scheduleVideoPlayback();
  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver(scheduleVideoPlayback, { threshold: [0, .5, 1] });
    videos.forEach(video => observer.observe(video));
  }
  if ('ResizeObserver' in window && document.querySelector('main')) {
    new ResizeObserver(scheduleVideoPlayback).observe(document.querySelector('main'));
  }

  function updateActiveNavigation() {
    const top = (document.querySelector('.topbar')?.getBoundingClientRect().bottom || 0) + 35;
    let active = '';
    document.querySelectorAll('main > .section').forEach(section => {
      const rect = section.getBoundingClientRect();
      if (rect.top <= top && rect.bottom > top) active = '#' + section.id;
    });
    document.querySelectorAll('.topbar nav a').forEach(link => {
      if (active && link.getAttribute('href') === active) link.setAttribute('aria-current', 'location');
      else link.removeAttribute('aria-current');
    });
  }
})();
