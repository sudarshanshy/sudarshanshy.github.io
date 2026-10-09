import { makeExample, nearest } from './coreset-model.mjs';

const demo = document.querySelector('.coreset-demo');
if (demo) {
  const { points, representatives, membership, history, centers, assignments } = makeExample();
  const svg = demo.querySelector('.coreset-plot');
  const cloud = svg.querySelector('.demo-cloud');
  const summary = svg.querySelector('.demo-summary');
  const solution = svg.querySelector('.demo-centers');
  const playButton = demo.querySelector('.demo-play');
  const steps = Array.from(demo.querySelectorAll('.demo-step'));
  const caption = demo.querySelector('.demo-caption');
  const metric = demo.querySelector('.demo-metric');
  const progress = demo.querySelector('.demo-progress');
  const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const colors = ['#2d7a85', '#af7243', '#77689a'];
  const neutral = '#5f899d';
  const duration = 10800;
  const boundaries = [0, 3600, 7600, duration];
  const descriptions = [
    'Compress the data into a small weighted summary. Larger dots represent more points.',
    'Solve the smaller k-means problem: the three cluster centers move into place.',
    'Lift the solution back: use those centers to cluster every point in the original data.'
  ];
  let elapsed = 0;
  let lastTime = null;
  let frame = null;
  let playing = false;
  let started = false;
  let visible = false;
  let resumeWhenVisible = false;
  let currentStage = -1;

  const clamp = value => Math.max(0, Math.min(1, value));
  const ease = value => { const t = clamp(value); return t * t * (3 - 2 * t); };
  const lerp = (a, b, t) => a + (b - a) * t;
  const attr = (element, values) => {
    for (const [name, value] of Object.entries(values)) element.setAttribute(name, String(value));
  };
  const circle = (group, className) => {
    const element = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    if (className) element.setAttribute('class', className);
    group.appendChild(element);
    return element;
  };
  // Replace the complete static illustration only after the module is ready.
  cloud.replaceChildren();
  summary.replaceChildren();
  solution.replaceChildren();
  const pointNodes = points.map(() => circle(cloud));
  const representativeNodes = representatives.map(point => {
    const element = circle(summary);
    const title = document.createElementNS('http://www.w3.org/2000/svg', 'title');
    title.textContent = `Represents ${point.weight} original points`;
    element.appendChild(title);
    return element;
  });
  const centerNodes = centers.map(() => {
    const group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    const ring = circle(group);
    attr(ring, { r: 11, fill: 'var(--paper)', 'stroke-width': 2 });
    const cross = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    attr(cross, { d: 'M-4 0h8M0-4v8', fill: 'none', 'stroke-width': 2, 'stroke-linecap': 'round' });
    group.appendChild(cross);
    solution.appendChild(group);
    return { group, ring, cross };
  });

  function setStage(stage) {
    if (stage === currentStage) return;
    currentStage = stage;
    demo.dataset.stage = ['compress', 'solve', 'lift'][stage];
    caption.textContent = descriptions[stage];
    metric.textContent = [
      `${points.length} points → ${representatives.length} weighted representatives`,
      `${representatives.length} representatives → 3 cluster centers`,
      `3 cluster centers → all ${points.length} points`
    ][stage];
    steps.forEach((button, index) => {
      button.setAttribute('aria-pressed', String(index === stage));
      button.dataset.complete = String(index < stage);
    });
  }

  function render(time) {
    const stage = time < boundaries[1] ? 0 : time < boundaries[2] ? 1 : 2;
    setStage(stage);
    const compression = ease((time - 650) / 2350);
    const solving = clamp((time - boundaries[1] - 400) / 3000);
    const lifting = ease((time - boundaries[2] - 250) / 2100);
    const segment = solving * (history.length - 1);
    const index = Math.min(history.length - 2, Math.floor(segment));
    const fraction = ease(segment - index);
    const movingCenters = history[index].map((center, i) => ({
      x: lerp(center.x, history[index + 1][i].x, fraction),
      y: lerp(center.y, history[index + 1][i].y, fraction)
    }));
    const shownCenters = stage === 2 ? centers : movingCenters;

    points.forEach((point, i) => {
      const representative = representatives[membership[i]];
      const amount = stage === 0 ? compression : 1 - lifting;
      attr(pointNodes[i], {
        cx: lerp(point.x, representative.x, amount).toFixed(2),
        cy: lerp(point.y, representative.y, amount).toFixed(2),
        r: 2.8,
        fill: stage === 2 ? colors[assignments[i]] : neutral,
        opacity: stage === 0 ? .72 * (1 - compression) : stage === 1 ? 0 : .78 * lifting
      });
    });
    representatives.forEach((point, i) => {
      attr(representativeNodes[i], {
        cx: point.x, cy: point.y,
        r: (2.8 + Math.sqrt(point.weight) * 1.45).toFixed(2),
        fill: stage === 0 ? neutral : colors[nearest(point, shownCenters)],
        opacity: stage === 0 ? compression * .85 : stage === 1 ? .85 : (1 - lifting) * .85,
        stroke: 'var(--paper)', 'stroke-width': 1.2
      });
    });
    centerNodes.forEach(({ group, ring, cross }, i) => {
      attr(group, {
        transform: `translate(${shownCenters[i].x.toFixed(2)} ${shownCenters[i].y.toFixed(2)})`,
        opacity: stage === 0 ? 0 : stage === 1 ? clamp((time - boundaries[1]) / 400) : 1
      });
      attr(ring, { stroke: colors[i] });
      attr(cross, { stroke: colors[i] });
    });
    progress.style.width = `${time / duration * 100}%`;
  }

  function updatePlayButton() {
    playButton.textContent = playing ? 'Pause' : elapsed >= duration ? 'Replay' : elapsed > 0 ? 'Continue' : 'Play';
    playButton.setAttribute('aria-label', `${playButton.textContent} clustering animation`);
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
    if (lastTime !== null) elapsed = Math.min(duration, elapsed + now - lastTime);
    lastTime = now;
    render(elapsed);
    if (elapsed >= duration) { pause(); return; }
    frame = requestAnimationFrame(tick);
  }

  function play() {
    if (motion.matches || playing) return;
    if (elapsed >= duration) elapsed = 0;
    started = true;
    playing = true;
    lastTime = null;
    render(elapsed);
    updatePlayButton();
    frame = requestAnimationFrame(tick);
  }

  playButton.addEventListener('click', () => {
    resumeWhenVisible = false;
    started = true;
    if (playing) pause(); else play();
  });
  steps.forEach((button, index) => {
    button.disabled = false;
    button.addEventListener('click', () => {
      started = true;
      resumeWhenVisible = false;
      pause();
      elapsed = index === 0 ? boundaries[1] - 1 : index === 1 ? boundaries[2] - 1 : duration;
      render(elapsed);
      updatePlayButton();
    });
  });
  function applyMotionPreference() {
    pause();
    playButton.hidden = motion.matches;
    if (motion.matches) {
      resumeWhenVisible = false;
      elapsed = duration;
      render(elapsed);
    }
  }
  playButton.hidden = motion.matches;
  render(motion.matches ? duration : 0);
  motion.addEventListener('change', applyMotionPreference);

  const observer = new IntersectionObserver(entries => {
    visible = entries[0].isIntersecting;
    if (visible && !document.hidden) {
      if (!started || resumeWhenVisible) { resumeWhenVisible = false; play(); }
    } else if (playing) {
      resumeWhenVisible = true;
      pause();
    }
  }, { threshold: .35 });
  observer.observe(demo);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && playing) { resumeWhenVisible = true; pause(); }
    else if (!document.hidden && visible && resumeWhenVisible) { resumeWhenVisible = false; play(); }
  });
}
