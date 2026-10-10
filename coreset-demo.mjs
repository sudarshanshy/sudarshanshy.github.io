import { makeExample, nearest } from './coreset-model.mjs?v=navy-20261009';

const demo = document.querySelector('.pipeline-demo');
if (demo) {
  const { points, representatives, membership, history, centers } = makeExample();
  const colors = ['#58eed1', '#ffbf7a', '#b9a0ff'];
  const neutral = '#58eed1';
  const inputCloud = demo.querySelector('.input-cloud');
  const inputHighlights = demo.querySelector('.input-highlights');
  const source = demo.querySelector('.summary-source');
  const summary = demo.querySelector('.summary-cloud');
  const links = Array.from(demo.querySelectorAll('.summary-links line'));
  const summaryLinks = demo.querySelector('.summary-links');
  const summaryPlaceholder = demo.querySelector('.summary-placeholder');
  const outputPlaceholder = demo.querySelector('.output-placeholder');
  const summaryCenters = Array.from(demo.querySelectorAll('.summary-centers > g'));
  const resultCenters = Array.from(demo.querySelectorAll('.result-centers > g'));
  const resultReveal = demo.querySelector('.result-reveal');
  const resultCloud = demo.querySelector('.result-cloud');
  const solverStatus = demo.querySelector('.solver-status');
  const resultStatus = demo.querySelector('.result-status');
  const playButton = demo.querySelector('.demo-play');
  const phase = demo.querySelector('.demo-phase');
  const caption = demo.querySelector('.demo-caption');
  const progress = demo.querySelector('.demo-progress');
  const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const boundaries = { compress: 1800, solve: 5600, lift: 10300, end: 17200 };
  const descriptions = {
    ready: 'Lots of points. One clustering problem.',
    compress: 'Compress 1,200 points into 24 weighted representatives.',
    solve: 'Run k-means on the small summary.',
    lift: 'Lift the solution to all 1,200 original points.'
  };
  let elapsed = 0;
  let lastTime = null;
  let lastPaint = -Infinity;
  let frame = null;
  let playing = false;
  let started = false;
  let visible = false;
  let resumeWhenVisible = false;
  let stage = '';
  let shownIteration = -1;
  const clamp = value => Math.max(0, Math.min(1, value));
  const ease = value => { const t = clamp(value); return t * t * (3 - 2 * t); };
  const lerp = (a, b, t) => a + (b - a) * t;
  const attr = (element, values) => {
    for (const [name, value] of Object.entries(values)) element.setAttribute(name, String(value));
  };

  // The static HTML already contains the complete result. Enhance it only
  // after importing the model, so the explanation remains useful without JS.
  source.replaceChildren();
  const sourceNodes = points.map(point => {
    const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    attr(circle, { cx: point.x, cy: point.y, r: 2.25 });
    source.appendChild(circle);
    return circle;
  });
  attr(source, { fill: '#6da5b7', opacity: 0 });
  const summaryNodes = Array.from(summary.querySelectorAll('circle'));

  function setStage(nextStage) {
    if (stage === nextStage) return;
    stage = nextStage;
    demo.dataset.stage = stage;
    caption.textContent = descriptions[stage];
    phase.textContent = { ready: 'The problem', compress: '01 · Compress', solve: '02 · Solve', lift: '03 · Lift' }[stage];
    shownIteration = -1;
  }

  function render(time) {
    const nextStage = time < boundaries.compress ? 'ready'
      : time < boundaries.solve ? 'compress'
      : time < boundaries.lift ? 'solve' : 'lift';
    setStage(nextStage);
    const compression = ease((time - boundaries.compress - 400) / 2800);
    const solving = clamp((time - boundaries.solve - 350) / 3650);
    const lifting = ease((time - boundaries.lift - 650) / 2900);
    const centerArrival = ease((time - boundaries.lift) / 650);
    const resetFade = 1 - ease((time - boundaries.end + 850) / 850);
    const segment = solving * (history.length - 1);
    const historyIndex = Math.min(history.length - 2, Math.floor(segment));
    const fraction = ease(segment - historyIndex);
    const movingCenters = history[historyIndex].map((center, i) => ({
      x: lerp(center.x, history[historyIndex + 1][i].x, fraction),
      y: lerp(center.y, history[historyIndex + 1][i].y, fraction)
    }));
    const shownCenters = stage === 'lift' ? centers : movingCenters;

    attr(inputCloud, { opacity: stage === 'ready' ? .8 : .8 - compression * .48 * resetFade });
    attr(inputHighlights, { opacity: stage === 'ready' ? 0 : .7 * compression * resetFade });
    attr(summaryPlaceholder, { opacity: stage === 'ready' ? 1 : 0 });
    attr(outputPlaceholder, { opacity: stage === 'lift' ? 0 : 1 });
    attr(source, { opacity: stage === 'compress' ? .8 * (1 - compression) : 0 });

    // Animate the complete cloud into its representatives only during
    // compression. Later frames update just 24 points and three centers.
    if (stage === 'compress') {
      points.forEach((point, i) => {
        const representative = representatives[membership[i]];
        attr(sourceNodes[i], {
          cx: lerp(point.x, representative.x, compression).toFixed(2),
          cy: lerp(point.y, representative.y, compression).toFixed(2)
        });
      });
    }
    representatives.forEach((point, i) => {
      const cluster = nearest(point, shownCenters);
      attr(summaryNodes[i], {
        r: ((4 + Math.sqrt(point.weight) * .9) * (stage === 'compress' ? .35 + .65 * compression : 1)).toFixed(2),
        fill: stage === 'ready' || stage === 'compress' ? neutral : colors[cluster],
        opacity: stage === 'ready' ? 0 : stage === 'compress' ? compression : .95 * resetFade
      });
      attr(links[i], {
        x2: shownCenters[cluster].x.toFixed(2),
        y2: shownCenters[cluster].y.toFixed(2),
        stroke: colors[cluster]
      });
    });
    attr(summaryLinks, { opacity: stage === 'solve' ? .32 * clamp((time - boundaries.solve) / 350) : stage === 'lift' ? .32 * resetFade : 0 });
    summaryCenters.forEach((group, i) => attr(group, {
      transform: `translate(${shownCenters[i].x.toFixed(2)} ${shownCenters[i].y.toFixed(2)})`,
      opacity: stage === 'ready' || stage === 'compress' ? 0 : stage === 'solve' ? clamp((time - boundaries.solve) / 350) : resetFade
    }));
    resultCenters.forEach((group, i) => attr(group, {
      transform: `translate(${centers[i].x.toFixed(2)} ${centers[i].y.toFixed(2)}) scale(${centerArrival.toFixed(3)})`,
      opacity: stage === 'lift' ? centerArrival * resetFade : 0
    }));
    attr(resultReveal, { width: stage === 'lift' ? (600 * lifting).toFixed(2) : 0 });
    attr(resultCloud, { opacity: .9 * resetFade });
    const iteration = stage === 'solve' ? Math.min(history.length - 1, Math.floor(segment) + 1) : -1;
    if (iteration !== shownIteration || stage !== 'solve') {
      shownIteration = iteration;
      solverStatus.textContent = stage === 'ready' ? 'Waiting for compression'
        : stage === 'compress' ? 'Preserve structure with weights'
        : stage === 'solve' ? `k-means · iteration ${iteration} of ${history.length - 1}`
        : 'k-means · solved';
    }
    resultStatus.textContent = stage === 'lift' ? lifting >= 1 ? '3 clusters · every point assigned' : 'Apply the learned centers' : 'The solution will be lifted here';
    progress.style.width = `${time / boundaries.end * 100}%`;
  }

  function updatePlayButton() {
    demo.dataset.playing = String(playing);
    playButton.textContent = playing ? 'Pause' : 'Resume';
    playButton.setAttribute('aria-label', `${playing ? 'Pause' : 'Resume'} clustering animation`);
  }
  function pause() {
    playing = false;
    if (frame !== null) cancelAnimationFrame(frame);
    frame = null;
    lastTime = null;
    updatePlayButton();
  }
  function tick(now) {
    if (!playing) return;
    if (lastTime !== null) elapsed = (elapsed + now - lastTime) % boundaries.end;
    lastTime = now;
    // Cap expensive SVG paints at 30 fps; the browser still drives timing.
    if (now - lastPaint >= 32 || elapsed >= boundaries.end) {
      render(elapsed);
      lastPaint = now;
    }
    frame = requestAnimationFrame(tick);
  }
  function play() {
    if (motion.matches || playing) return;
    playing = true;
    started = true;
    lastTime = null;
    lastPaint = -Infinity;
    render(elapsed);
    updatePlayButton();
    frame = requestAnimationFrame(tick);
  }

  playButton.addEventListener('click', () => {
    started = true;
    resumeWhenVisible = false;
    if (playing) pause(); else play();
  });
  function applyMotionPreference() {
    pause();
    resumeWhenVisible = false;
    playButton.hidden = motion.matches;
    if (motion.matches) { elapsed = boundaries.end - 1700; render(elapsed); }
    else if (visible && !document.hidden) play();
  }
  playButton.hidden = motion.matches;
  elapsed = motion.matches ? boundaries.end - 1700 : 0;
  render(elapsed);
  updatePlayButton();
  motion.addEventListener('change', applyMotionPreference);

  const observer = new IntersectionObserver(entries => {
    visible = entries[0].intersectionRatio >= .4;
    if (visible && !document.hidden) {
      if (!started || resumeWhenVisible) { resumeWhenVisible = false; play(); }
    } else if (playing) { resumeWhenVisible = true; pause(); }
  }, { threshold: [0, .4] });
  observer.observe(demo);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && playing) { resumeWhenVisible = true; pause(); }
    else if (!document.hidden && visible && resumeWhenVisible) { resumeWhenVisible = false; play(); }
  });
}
