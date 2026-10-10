// Keep earlier links working after moving research and publications off Home.
if (document.body.dataset.page === 'home') {
  const destination = {
    '#research': 'research.html',
    '#compression': 'research.html#compression',
    '#publications': 'publications.html'
  }[window.location.hash];
  if (destination) window.location.replace(destination);
}
